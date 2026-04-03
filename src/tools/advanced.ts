import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AmemDatabase } from "../database.js";
import { multiStrategyRecall } from "../memory.js";
import { generateEmbedding } from "../embeddings.js";
import { loadConfig } from "../config.js";
import { reflect } from "../reflection.js";
import { shortId, formatAge } from "./helpers.js";

export function registerAdvancedTools(server: McpServer, db: AmemDatabase, project: string): void {

  // ── memory_tier ──────────────────────────────────────────
  server.registerTool(
    "memory_tier",
    {
      title: "Manage Memory Tiers",
      description: `Move memories between tiers to control what's always loaded vs. searchable.

Tiers:
- **core** — Always injected at session start (~500 tokens max). Only your most critical corrections and decisions.
- **working** — Session-scoped context. Relevant to the current task, automatically surfaced.
- **archival** — Default tier. Searchable but not auto-injected. The long-term store.

Use this to promote important memories to core (always visible) or demote stale ones to archival.

Args:
  - id (string): Memory ID (full or 8-char prefix)
  - tier (enum): Target tier — core | working | archival
  - action (enum, optional): "set" to change tier, "list" to list memories in a tier (default: "set")`,
      inputSchema: z.object({
        id: z.string().optional().describe("Memory ID to move (required for set)"),
        tier: z.enum(["core", "working", "archival"]).describe("Target tier"),
        action: z.enum(["set", "list"]).default("set").describe("set = move memory, list = show tier contents"),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ id, tier, action }) => {
      try {
        if (action === "list") {
          const memories = db.getByTier(tier, project);
          if (memories.length === 0) {
            return {
              content: [{ type: "text" as const, text: `No memories in ${tier} tier.` }],
            };
          }
          const lines = [`${tier.toUpperCase()} tier — ${memories.length} memories:`, ""];
          for (const m of memories) {
            lines.push(`[${m.type}] ${m.content.slice(0, 80)}${m.content.length > 80 ? "..." : ""}`);
            lines.push(`  ID: ${shortId(m.id)} | Confidence: ${(m.confidence * 100).toFixed(0)}% | ${formatAge(m.lastAccessed)}`);
            lines.push("");
          }
          return {
            content: [{ type: "text" as const, text: lines.join("\n").trim() }],
          };
        }

        // set
        if (!id) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: "Memory ID is required for tier assignment." }],
          };
        }
        const fullId = db.resolveId(id) ?? id;
        const mem = db.getById(fullId);
        if (!mem) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: `Memory "${id}" not found.` }],
          };
        }

        // Check core tier token budget
        if (tier === "core") {
          const config = loadConfig();
          const coreMemories = db.getByTier("core", project);
          const currentTokens = coreMemories.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
          const newTokens = Math.ceil(mem.content.length / 4);
          if (currentTokens + newTokens > config.tiers.coreMaxTokens) {
            return {
              isError: true,
              content: [{
                type: "text" as const,
                text: `Core tier would exceed ${config.tiers.coreMaxTokens} token budget (current: ~${currentTokens}, adding: ~${newTokens}). Demote existing core memories first.`,
              }],
            };
          }
        }

        const oldTier = mem.tier;
        db.updateTier(fullId, tier);
        return {
          content: [{
            type: "text" as const,
            text: `Moved memory ${shortId(fullId)} from ${oldTier} → ${tier}\n"${mem.content.slice(0, 80)}"`,
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error managing tiers: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    },
  );

  // ── memory_summarize ──────────────────────────────────────
  server.registerTool(
    "memory_summarize",
    {
      title: "Summarize Session",
      description: `Create a structured summary of a conversation session. Extracts key decisions, corrections, and insights from the conversation log for this session. The summary is stored for future reference.

Use at the end of a session or when the Stop hook fires.

Args:
  - session_id (string): Session to summarize
  - summary (string): High-level summary of what happened
  - key_decisions (string[]): Important decisions made during the session
  - key_corrections (string[]): Corrections the user made
  - memories_extracted (number): How many memories were extracted during this session`,
      inputSchema: z.object({
        session_id: z.string().min(1).describe("Session ID to summarize"),
        summary: z.string().min(1).max(5000).describe("High-level summary of the session"),
        key_decisions: z.array(z.string()).default([]).describe("Important decisions made"),
        key_corrections: z.array(z.string()).default([]).describe("Corrections from the user"),
        memories_extracted: z.number().int().min(0).default(0).describe("Number of memories extracted"),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ session_id, summary, key_decisions, key_corrections, memories_extracted }) => {
      try {
        const id = db.insertSummary({
          sessionId: session_id,
          summary,
          keyDecisions: key_decisions,
          keyCorrections: key_corrections,
          memoriesExtracted: memories_extracted,
          project,
        });

        return {
          content: [{
            type: "text" as const,
            text: `Session summary stored (${shortId(id)}):\n${summary.slice(0, 200)}${summary.length > 200 ? "..." : ""}\nDecisions: ${key_decisions.length} | Corrections: ${key_corrections.length} | Memories extracted: ${memories_extracted}`,
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error summarizing session: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    },
  );

  // ── memory_expire ────────────────────────────────────────
  server.registerTool(
    "memory_expire",
    {
      title: "Expire Memory (Temporal Validity)",
      description: `Mark a memory as expired — it was true in the past but no longer applies. Unlike forget (which deletes), expire preserves the memory for historical queries ("what was our approach in March?") but excludes it from normal recall.

This is the Zep-style temporal knowledge graph approach: facts have validity windows.

Args:
  - id (string): Memory ID to expire
  - reason (string): Why this memory is no longer valid`,
      inputSchema: z.object({
        id: z.string().min(1).describe("Memory ID to expire"),
        reason: z.string().min(1).describe("Why this memory is no longer valid"),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ id, reason }) => {
      try {
        const fullId = db.resolveId(id) ?? id;
        const mem = db.getById(fullId);
        if (!mem) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: `Memory "${id}" not found.` }],
          };
        }

        if (mem.validUntil !== null) {
          return {
            content: [{
              type: "text" as const,
              text: `Memory ${shortId(fullId)} is already expired (since ${new Date(mem.validUntil).toISOString().slice(0, 10)}).`,
            }],
          };
        }

        db.expireMemory(fullId);
        // Snapshot the reason in version history
        db.snapshotVersion(fullId, `expired: ${reason}`);

        return {
          content: [{
            type: "text" as const,
            text: `Expired memory ${shortId(fullId)}: "${mem.content.slice(0, 80)}"\nReason: ${reason}\nThis memory is preserved for history but excluded from normal recall.`,
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error expiring memory: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    },
  );

  // ── memory_multi_recall ──────────────────────────────────
  server.registerTool(
    "memory_multi_recall",
    {
      title: "Multi-Strategy Memory Recall",
      description: `Advanced recall using 4 search strategies combined: semantic embeddings, full-text search, knowledge graph traversal, and temporal recency. Each strategy votes independently, then scores are merged.

Use this when standard memory_recall isn't finding what you need, or when you want the most comprehensive context possible. More expensive but more thorough.

By default returns a compact index of IDs and previews (compact: true). Use memory_detail with the returned IDs to get full content.

Args:
  - query (string): What to search for
  - limit (number): Max results (default: 15)
  - compact (boolean): If true, return compact index with IDs. Use memory_detail for full content. (default: true)
  - weights (object, optional): Custom weights for each strategy (default: semantic=0.4, fts=0.3, graph=0.15, temporal=0.15)`,
      inputSchema: z.object({
        query: z.string().min(1).describe("What to search for"),
        limit: z.number().int().min(1).max(50).default(15).describe("Max results"),
        compact: z.boolean().default(true).describe("If true, return compact index with IDs. Use memory_detail for full content."),
        weights: z.object({
          semantic: z.number().min(0).max(1).default(0.4),
          fts: z.number().min(0).max(1).default(0.3),
          graph: z.number().min(0).max(1).default(0.15),
          temporal: z.number().min(0).max(1).default(0.15),
        }).optional().describe("Custom weights for each retrieval strategy"),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ query, limit, compact, weights }) => {
      try {
        const queryEmbedding = await generateEmbedding(query);
        const results = await multiStrategyRecall(db, {
          query,
          queryEmbedding,
          limit,
          scope: project,
          weights,
          rerank: loadConfig().retrieval.rerankerEnabled,
          rerankerTopK: loadConfig().retrieval.rerankerTopK,
        });

        if (results.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No memories found for: "${query}" (multi-strategy search).` }],
          };
        }

        for (const r of results) db.touchAccess(r.id);

        if (compact) {
          const compactLines = results.map((r) => {
            const preview = r.content.slice(0, 80) + (r.content.length > 80 ? "..." : "");
            return `${shortId(r.id)} [${r.type}] ${preview} (${(r.score * 100).toFixed(0)}%)`;
          });
          const tokenEstimate = compactLines.join("\n").split(/\s+/).length;
          return {
            content: [{
              type: "text" as const,
              text: `Multi-strategy: "${query}" — ${results.length} results (~${tokenEstimate} tokens):\n${compactLines.join("\n")}\n\nUse memory_detail with IDs for full content.`,
            }],
            structuredContent: {
              query,
              total: results.length,
              compact: true,
              tokenEstimate,
              memories: results.map(r => ({
                id: r.id,
                type: r.type,
                preview: r.content.slice(0, 80),
                score: Number(r.score.toFixed(3)),
                confidence: r.confidence,
              })),
            },
          };
        }

        const lines = results.map((r, i) => {
          const age = formatAge(r.createdAt);
          return `${i + 1}. [${r.type}] ${r.content}\n   Score: ${r.score.toFixed(3)} | Confidence: ${(r.confidence * 100).toFixed(0)}% | Age: ${age} | Tier: ${r.tier}`;
        });

        return {
          content: [{
            type: "text" as const,
            text: `Multi-strategy search: "${query}" — ${results.length} results:\n\n${lines.join("\n\n")}`,
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error in multi-strategy recall: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    },
  );

  // ── memory_reflect ───────────────────────────────────────
  server.registerTool(
    "memory_reflect",
    {
      title: "Self-Evolving Memory Reflection",
      description: `Run the reflection engine to analyze your entire memory graph. Returns a structured report with:

1. **Clusters** — groups of semantically related memories (connected-component clustering via HNSW)
2. **Contradictions** — pairs of memories with opposing language within the same cluster
3. **Synthesis candidates** — clusters ripe for merging into a higher-order principle

**How the self-evolving loop works:**
- Call memory_reflect to get the report
- Review synthesis candidates → call memory_store with the synthesized principle (source: "reflection-synthesis")
- Link synthesis to constituents → call memory_relate with relationship_type "synthesized_from"
- Resolve contradictions → call memory_expire on stale memories
- Repeat periodically — each cycle, the memory graph becomes more coherent and abstract

Args:
  - min_cluster_size (number, optional): Minimum memories to form a cluster (default: 3)
  - similarity_threshold (number, optional): Min similarity for cluster edges (default: 0.65)
  - max_synthesis_candidates (number, optional): Max synthesis prompts to return (default: 5)`,
      inputSchema: z.object({
        min_cluster_size: z.number().int().min(2).max(20).default(3)
          .describe("Minimum memories to form a cluster"),
        similarity_threshold: z.number().min(0.3).max(0.95).default(0.65)
          .describe("Minimum cosine similarity to form a cluster edge"),
        max_synthesis_candidates: z.number().int().min(1).max(20).default(5)
          .describe("Maximum synthesis prompts to return"),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ min_cluster_size, similarity_threshold, max_synthesis_candidates }) => {
      try {
        const report = reflect(db, {
          minClusterSize: min_cluster_size,
          similarityThreshold: similarity_threshold,
          maxSynthesisCandidates: max_synthesis_candidates,
        });

        // Format the report for the AI to act on
        const lines: string[] = [];

        lines.push(`# Memory Reflection Report`);
        lines.push(`Analyzed ${report.stats.totalMemories} memories in ${report.durationMs}ms`);
        lines.push(`Health Score: ${report.stats.healthScore}/100`);
        lines.push("");

        // Stats summary
        lines.push(`## Stats`);
        lines.push(`- Clusters: ${report.stats.totalClusters} (avg size: ${report.stats.avgClusterSize})`);
        lines.push(`- Clustered: ${report.stats.clusteredMemories} | Orphans: ${report.orphans}`);
        lines.push(`- Contradictions: ${report.stats.contradictionsFound}`);
        lines.push(`- Synthesis candidates: ${report.stats.synthesisCandidates}`);
        lines.push(`- Knowledge gaps: ${report.stats.knowledgeGaps}`);
        lines.push("");

        // Top clusters
        if (report.clusters.length > 0) {
          lines.push(`## Top Clusters`);
          for (const c of report.clusters.slice(0, 8)) {
            const tagStr = c.tags.length > 0 ? ` [${c.tags.join(", ")}]` : "";
            lines.push(`**${c.id}** — ${c.members.length} memories, ${c.dominantType}s${tagStr} (coherence: ${(c.coherence * 100).toFixed(0)}%)`);
            for (const m of c.members.slice(0, 4)) {
              lines.push(`  ${shortId(m.id)} [${m.type}] "${m.content.slice(0, 70)}${m.content.length > 70 ? "..." : ""}"`);
            }
            if (c.members.length > 4) {
              lines.push(`  ... +${c.members.length - 4} more`);
            }
            lines.push("");
          }
        }

        // Contradictions
        if (report.contradictions.length > 0) {
          lines.push(`## Contradictions Found`);
          for (const c of report.contradictions) {
            lines.push(`⚠ ${c.reason}`);
            lines.push(`  A: ${shortId(c.memoryA.id)} "${c.memoryA.content.slice(0, 60)}..."`);
            lines.push(`  B: ${shortId(c.memoryB.id)} "${c.memoryB.content.slice(0, 60)}..."`);
            lines.push(`  → ${c.suggestedAction}`);
            lines.push("");
          }
        }

        // Synthesis candidates
        if (report.synthesisCandidates.length > 0) {
          lines.push(`## Synthesis Candidates`);
          lines.push(`These clusters are ready to be synthesized into higher-order principles.`);
          lines.push(`For each, review the prompt, synthesize, then store with memory_store and link with memory_relate.`);
          lines.push("");
          for (const s of report.synthesisCandidates) {
            lines.push(`### ${s.clusterId} (${s.memories.length} ${s.dominantType}s)`);
            lines.push("```");
            lines.push(s.suggestedPrompt);
            lines.push("```");
            lines.push("");
          }
        }

        // Knowledge gaps
        if (report.knowledgeGaps.length > 0) {
          lines.push(`## Knowledge Gaps`);
          lines.push(`Topics where recall consistently returns sparse or low-confidence results:`);
          for (const g of report.knowledgeGaps.slice(0, 10)) {
            lines.push(`- "${g.queryPattern}" — asked ${g.hitCount}x, avg ${(g.avgConfidence * 100).toFixed(0)}% confidence, ~${g.avgResults} results`);
          }
          lines.push("");
        }

        // Action guidance
        let actionNum = 1;
        const hasActions = report.contradictions.length > 0 || report.synthesisCandidates.length > 0 || report.knowledgeGaps.length > 0;
        if (hasActions) {
          lines.push(`## Suggested Actions`);
          if (report.contradictions.length > 0) {
            lines.push(`${actionNum++}. Review ${report.contradictions.length} contradiction(s) — use memory_expire on stale ones`);
          }
          if (report.synthesisCandidates.length > 0) {
            lines.push(`${actionNum++}. Synthesize ${report.synthesisCandidates.length} cluster(s) — use memory_store + memory_relate`);
          }
          if (report.knowledgeGaps.length > 0) {
            lines.push(`${actionNum++}. Fill ${report.knowledgeGaps.length} knowledge gap(s) — ask the user about these topics and store with memory_store`);
          }
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n").trim() }],
          structuredContent: {
            stats: report.stats,
            clusters: report.clusters.map(c => ({
              id: c.id,
              memberCount: c.members.length,
              dominantType: c.dominantType,
              coherence: c.coherence,
              tags: c.tags,
              memberIds: c.members.map(m => m.id),
            })),
            contradictions: report.contradictions.map(c => ({
              olderMemoryId: c.memoryA.id,
              newerMemoryId: c.memoryB.id,
              similarity: c.similarity,
              reason: c.reason,
              suggestedAction: c.suggestedAction,
            })),
            synthesisCandidates: report.synthesisCandidates.map(s => ({
              clusterId: s.clusterId,
              dominantType: s.dominantType,
              memoryIds: s.memories.map(m => m.id),
              suggestedPrompt: s.suggestedPrompt,
            })),
            knowledgeGaps: report.knowledgeGaps.map(g => ({
              id: g.id,
              queryPattern: g.queryPattern,
              hitCount: g.hitCount,
              avgConfidence: g.avgConfidence,
              avgResults: g.avgResults,
            })),
            orphans: report.orphans,
            durationMs: report.durationMs,
          },
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error running reflection: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );

  // ── memory_history ───────────────────────────────────────
  server.registerTool(
    "memory_history",
    {
      title: "View Session History",
      description: `View past session summaries. Shows what happened in recent sessions, key decisions, corrections, and how many memories were extracted.

Args:
  - limit (number): Number of recent sessions to show (default: 5)`,
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(5).describe("Number of recent sessions"),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ limit }) => {
      try {
        const summaries = db.getRecentSummaries(project, limit);

        if (summaries.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No session summaries found. Use memory_summarize at the end of sessions." }],
          };
        }

        const lines = [`Recent ${summaries.length} session summaries:`, ""];
        for (const s of summaries) {
          lines.push(`Session: ${s.sessionId.slice(0, 16)} | ${formatAge(s.createdAt)}`);
          lines.push(`  ${s.summary.slice(0, 150)}${s.summary.length > 150 ? "..." : ""}`);
          if (s.keyDecisions.length > 0) {
            lines.push(`  Decisions: ${s.keyDecisions.slice(0, 3).join("; ")}${s.keyDecisions.length > 3 ? ` (+${s.keyDecisions.length - 3} more)` : ""}`);
          }
          if (s.keyCorrections.length > 0) {
            lines.push(`  Corrections: ${s.keyCorrections.slice(0, 3).join("; ")}${s.keyCorrections.length > 3 ? ` (+${s.keyCorrections.length - 3} more)` : ""}`);
          }
          lines.push(`  Memories extracted: ${s.memoriesExtracted}`);
          lines.push("");
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n").trim() }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error loading session history: ${error instanceof Error ? error.message : String(error)}` }],
        };
      }
    },
  );
}
