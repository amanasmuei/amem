import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  type AmemDatabase,
  MemoryType,
  type MemoryTypeValue,
  type ExplainedMemory,
  recallMemories,
  detectConflict,
  consolidateMemories,
  autoExpireContradictions,
  getVectorIndex,
  generateEmbedding,
  cosineSimilarity,
  sanitizeContent,
  loadConfig,
  autoRelateMemory,
  isReflectionDue,
  RecallResultSchema,
  ContextResultSchema,
  ExtractResultSchema,
  StatsResultSchema,
  ExportResultSchema,
  InjectResultSchema,
  ConsolidateResultSchema,
  DetailResultSchema,
  TYPE_ORDER,
  MEMORY_TYPES,
  CHARACTER_LIMIT,
  shortId,
  formatAge,
} from "@aman_asmuei/amem-core";

export function registerMemoryTools(server: McpServer, db: AmemDatabase, project: string, autoScope: (type: MemoryTypeValue) => string): void {

  // ── memory_store ──────────────────────────────────────────
  server.registerTool(
    "memory_store",
    {
      title: "Store Memory",
      description: `Store a developer memory. Types: correction (highest priority — hard constraints), decision (architectural choice + rationale), pattern (coding style/habit), preference (tool/style preference), topology (where things are in the codebase), fact (general knowledge). Always include tags for better recall.

Args:
  - content (string): The memory content — be specific and self-contained
  - type (enum): Memory type — corrections are highest priority
  - tags (string[]): Tags for filtering (e.g., ['typescript', 'auth', 'testing'])
  - confidence (number 0-1): How confident is this memory. Corrections from user = 1.0
  - source (string): Where this memory came from (default: 'conversation')

Returns:
  Confirmation with memory ID, or conflict detection if a similar memory exists.`,
      inputSchema: z.object({
        content: z.string().min(1, "Content is required").max(10000, "Content too long — max 10,000 characters").describe("The memory content — be specific and include context"),
        type: z.enum(MEMORY_TYPES as [string, ...string[]]).describe("Memory type — corrections are highest priority"),
        tags: z.array(z.string()).default([]).describe("Tags for filtering (e.g., ['typescript', 'auth', 'testing'])"),
        confidence: z.number().min(0).max(1).default(0.8).describe("How confident is this memory (0-1). Corrections from user = 1.0"),
        source: z.string().default("conversation").describe("Where this memory came from"),
        scope: z.string().optional().describe("Memory scope — 'global' or 'project:<name>'. Auto-detected from type if omitted."),
      }).strict(),
      // outputSchema omitted — z.union() causes _zod serialization errors in MCP SDK
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ content: rawContent, type, tags, confidence, source, scope }) => {
      try {
        // Privacy: strip <private> tags and redact sensitive patterns
        const content = sanitizeContent(rawContent) ?? rawContent;
        if (content !== rawContent && sanitizeContent(rawContent) === null) {
          return {
            content: [{
              type: "text" as const,
              text: "Content is entirely private (wrapped in <private> tags). Nothing was stored.",
            }],
            structuredContent: { action: "stored" as const, id: "", type, confidence, tags, total: 0, reinforced: 0 },
          };
        }

        const embedding = await generateEmbedding(content);

        // Auto-expire contradictions before storing
        const expireResult = autoExpireContradictions(db, content, embedding, type as MemoryTypeValue);
        if (expireResult.expired.length > 0) {
          console.error(`[amem] Auto-expired ${expireResult.expired.length} contradicting memories`);
        }

        // Single pass over recent memories: conflict detection, confidence boost, and reinforcement
        // Limit to 5000 most recently accessed to stay fast at scale
        if (embedding) {
          const existing = db.getRecentWithEmbeddings(loadConfig().retrieval.maxCandidates);

          const toReinforce: string[] = [];
          const toBoostConfidence: Array<{ id: string; confidence: number }> = [];

          for (const mem of existing) {
            if (!mem.embedding) continue;
            const sim = cosineSimilarity(embedding, mem.embedding);

            if (sim > 0.85) {
              // Near-duplicate — smart conflict resolution
              const conflict = detectConflict(content, mem.content, sim);
              if (conflict.isConflict) {
                // If the new memory is a correction or higher confidence, supersede the old one
                const isSuperseding = type === "correction" || confidence > mem.confidence;
                if (isSuperseding) {
                  // Auto-expire the old memory and store the new one
                  db.expireMemory(mem.id);
                  db.snapshotVersion(mem.id, `superseded by new ${type} memory`);
                  break; // Fall through to store the new memory below
                }
                db.updateConfidence(mem.id, Math.max(mem.confidence, confidence));
                return {
                  content: [{
                    type: "text" as const,
                    text: `Similar memory exists (${(sim * 100).toFixed(0)}% match):\n  OLD: "${mem.content}"\n  NEW: "${content}"\n\nUpdated confidence of existing memory. To replace it, store as a correction or with higher confidence. To keep both, rephrase to be more distinct.`,
                  }],
                  structuredContent: {
                    action: "conflict_resolved" as const,
                    existingId: mem.id,
                    similarity: Number((sim * 100).toFixed(0)),
                    existingContent: mem.content,
                  },
                };
              }
            }

            if (sim > 0.8) {
              toBoostConfidence.push({ id: mem.id, confidence: mem.confidence });
            } else if (sim > 0.6) {
              toReinforce.push(mem.id);
            }
          }

          const id = db.insertMemory({ content, type: type as MemoryTypeValue, tags, confidence, source, embedding, scope: scope ?? autoScope(type as MemoryTypeValue) });

          // Keep vector index in sync
          if (embedding) {
            const vecIdx = getVectorIndex();
            if (vecIdx) vecIdx.add(id, embedding);
          }

          // Auto-relate to similar existing memories
          const autoRelated = autoRelateMemory(db, id);
          const graphNote = autoRelated.created > 0
            ? ` Auto-linked to ${autoRelated.created} related memories.`
            : "";

          // Apply boosts and reinforcements collected in the single pass
          for (const b of toBoostConfidence) {
            db.updateConfidence(b.id, Math.min(1.0, b.confidence + 0.1));
          }
          for (const rId of toReinforce) {
            db.touchAccess(rId);
          }

          const stats = db.getStats();
          const evolvedNote = toReinforce.length > 0 ? ` Reinforced ${toReinforce.length} related memories.` : "";
          return {
            content: [{
              type: "text" as const,
              text: `Stored ${type} memory (${shortId(id)}). Confidence: ${confidence}. Tags: [${tags.join(", ")}]. Total memories: ${stats.total}.${evolvedNote}${graphNote}`,
            }],
            structuredContent: {
              action: "stored" as const,
              id,
              type,
              confidence,
              tags,
              total: stats.total,
              reinforced: toReinforce.length,
            },
          };
        }

        // No embeddings available — check content hash for exact duplicates, then store
        const existingByHash = db.findByContentHash(content);
        if (existingByHash) {
          db.updateConfidence(existingByHash.id, Math.max(existingByHash.confidence, confidence));
          return {
            content: [{
              type: "text" as const,
              text: `Exact duplicate detected: "${existingByHash.content}" — updated confidence instead of creating duplicate.`,
            }],
            structuredContent: {
              action: "conflict_resolved" as const,
              existingId: existingByHash.id,
              similarity: 100,
              existingContent: existingByHash.content,
            },
          };
        }
        const id = db.insertMemory({ content, type: type as MemoryTypeValue, tags, confidence, source, embedding, scope: scope ?? autoScope(type as MemoryTypeValue) });
        const autoRelated = autoRelateMemory(db, id);
        const graphNote = autoRelated.created > 0
          ? ` Auto-linked to ${autoRelated.created} related memories.`
          : "";
        const stats = db.getStats();
        return {
          content: [{
            type: "text" as const,
            text: `Stored ${type} memory (${shortId(id)}). Confidence: ${confidence}. Tags: [${tags.join(", ")}]. Total memories: ${stats.total}.${graphNote}`,
          }],
          structuredContent: {
            action: "stored" as const,
            id,
            type,
            confidence,
            tags,
            total: stats.total,
            reinforced: 0,
          },
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error storing memory: ${error instanceof Error ? error.message : String(error)}. Ensure the database is accessible and content is valid.`,
          }],
        };
      }
    },
  );

  // ── memory_recall ─────────────────────────────────────────
  server.registerTool(
    "memory_recall",
    {
      title: "Recall Memories",
      description: `Search memories semantically. Returns the most relevant memories ranked by relevance, recency, confidence, and importance. Use this when you need to remember something about the user, project, or past decisions.

Args:
  - query (string): What to search for — natural language works best
  - limit (number 1-50): Max results to return (default: 10)
  - type (enum, optional): Filter by memory type
  - tag (string, optional): Filter by tag
  - min_confidence (number 0-1, optional): Minimum confidence threshold
  - compact (boolean, optional): Return compact index (~50-100 tokens) with IDs for progressive disclosure (default: true). Set to false for full content inline. Use memory_detail to get full content for specific IDs.
  - explain (boolean, optional): If true, include detailed score breakdown showing how each factor (relevance, recency, confidence, importance) contributed to the ranking.

Returns:
  Ranked list of memories with scores, confidence, age, and tags. If compact=true, returns a compact index with short IDs and previews. If explain=true, includes per-memory scoring explanation.`,
      inputSchema: z.object({
        query: z.string().min(1, "Query is required").describe("What to search for — natural language works best"),
        limit: z.number().int().min(1).max(50).default(10).describe("Max results to return"),
        type: z.enum(MEMORY_TYPES as [string, ...string[]]).optional().describe("Filter by memory type"),
        tag: z.string().optional().describe("Filter by tag"),
        min_confidence: z.number().min(0).max(1).optional().describe("Minimum confidence threshold"),
        compact: z.boolean().default(true).describe("If true, return compact index (~50-100 tokens) with IDs for progressive disclosure. Use memory_detail to get full content."),
        explain: z.boolean().default(false).describe("If true, include detailed score breakdown per memory showing relevance source, recency decay, confidence, and type importance."),
      }).strict(),
      outputSchema: RecallResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ query, limit, type, tag, min_confidence, compact, explain }) => {
      try {
        const queryEmbedding = await generateEmbedding(query);

        const results = recallMemories(db, {
          query,
          queryEmbedding,
          limit,
          type: type as MemoryTypeValue | undefined,
          tag,
          minConfidence: min_confidence,
          scope: project,
          explain,
        });

        for (const r of results) {
          db.touchAccess(r.id);
        }

        // Track knowledge gaps — sparse or low-confidence results
        if (results.length < 3 || (results.length > 0 && results.reduce((s, r) => s + r.confidence, 0) / results.length < 0.5)) {
          const avgConf = results.length > 0 ? results.reduce((s, r) => s + r.confidence, 0) / results.length : 0;
          db.upsertKnowledgeGap(query.toLowerCase().trim(), avgConf, results.length);
        }

        if (results.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No memories found for: "${query}". Try broadening your search or using different keywords.` }],
            structuredContent: {
              query,
              total: 0,
              memories: [],
            },
          };
        }

        if (compact) {
          const compactLines = results.map((r) => {
            const preview = r.content.slice(0, 80) + (r.content.length > 80 ? "..." : "");
            return `${shortId(r.id)} [${r.type}] ${preview} (${(r.score * 100).toFixed(0)}%)`;
          });

          const tokenEstimate = compactLines.join("\n").split(/\s+/).length;

          return {
            content: [{
              type: "text" as const,
              text: `${results.length} memories (~${tokenEstimate} tokens):\n${compactLines.join("\n")}\n\nUse memory_detail with IDs for full content.`,
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

        const memoriesData = results.map((r) => {
          const base: Record<string, unknown> = {
            id: r.id,
            content: r.content,
            type: r.type,
            score: Number(r.score.toFixed(3)),
            confidence: r.confidence,
            tags: r.tags,
            age: formatAge(r.createdAt),
          };
          if (explain && "explanation" in r) {
            base.explanation = (r as ExplainedMemory).explanation;
          }
          return base;
        });

        const lines = results.map((r, i) => {
          const age = formatAge(r.createdAt);
          const conf = (r.confidence * 100).toFixed(0);
          let line = `${i + 1}. [${r.type}] ${r.content}\n   Score: ${r.score.toFixed(3)} | Confidence: ${conf}% | Age: ${age} | Tags: [${r.tags.join(", ")}]`;
          if (explain && "explanation" in r) {
            const e = (r as ExplainedMemory).explanation;
            line += `\n   ── Breakdown: relevance=${e.relevance.toFixed(3)} (${e.relevanceSource}) × recency=${e.recency} (${e.hoursSinceAccess}h ago) × confidence=${e.confidence} × importance=${e.importance} (${e.importanceLabel})`;
          }
          return line;
        });

        return {
          content: [{
            type: "text" as const,
            text: `Found ${results.length} memories for "${query}":\n\n${lines.join("\n\n")}`,
          }],
          structuredContent: {
            query,
            total: results.length,
            memories: memoriesData,
          },
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error recalling memories: ${error instanceof Error ? error.message : String(error)}. Try a different query or check the database.`,
          }],
        };
      }
    },
  );

  // ── memory_detail ────────────────────────────────────────
  server.registerTool(
    "memory_detail",
    {
      title: "Get Memory Details",
      description: "Retrieve full details for specific memory IDs. Use after memory_recall with compact=true to get full content for selected memories. Supports partial IDs (first 8 chars).",
      inputSchema: z.object({
        ids: z.array(z.string()).min(1).max(20).describe("Memory IDs (full or first 8 chars) to retrieve"),
      }).strict(),
      outputSchema: DetailResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ ids }) => {
      try {
        const found = ids.map(id => {
          const fullId = db.resolveId(id);
          if (!fullId) return null;
          const mem = db.getById(fullId);
          if (!mem) return null;
          db.touchAccess(mem.id);
          db.bumpUtilityScore(mem.id); // User actively chose to read this — signal utility
          return mem;
        }).filter((m): m is NonNullable<typeof m> => m !== null);

        if (found.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No memories found for the given IDs." }],
            structuredContent: { total: 0, tokenEstimate: 0, memories: [] },
          };
        }

        const lines = found.map((r) => {
          const age = formatAge(r.createdAt);
          const conf = (r.confidence * 100).toFixed(0);
          return `[${r.type}] ${r.content}\nID: ${shortId(r.id)} | Confidence: ${conf}% | Age: ${age} | Tags: [${r.tags.join(", ")}]`;
        });

        const tokenEstimate = lines.join("\n\n").split(/\s+/).length;

        return {
          content: [{
            type: "text" as const,
            text: `${found.length} memories (~${tokenEstimate} tokens):\n\n${lines.join("\n\n")}`,
          }],
          structuredContent: {
            total: found.length,
            tokenEstimate,
            memories: found.map(r => ({
              id: r.id,
              content: r.content,
              type: r.type,
              confidence: r.confidence,
              tags: r.tags,
              age: formatAge(r.createdAt),
              scope: r.scope,
            })),
          },
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error retrieving memories: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );

  // ── memory_context ────────────────────────────────────────
  server.registerTool(
    "memory_context",
    {
      title: "Get Memory Context",
      description: `Get all relevant context for a topic — combines memories across types to build a complete picture. Use at the start of a task to load relevant background. Returns corrections first (they override other context).

Args:
  - topic (string): The topic or task you need context for
  - max_tokens (number): Approximate token budget for context (default: 2000)

Returns:
  Markdown-formatted context grouped by memory type, with corrections first.`,
      inputSchema: z.object({
        topic: z.string().min(1, "Topic is required").describe("The topic or task you need context for"),
        max_tokens: z.number().int().min(100).max(10000).default(2000).describe("Approximate token budget for context"),
      }).strict(),
      outputSchema: ContextResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ topic, max_tokens }) => {
      try {
        const queryEmbedding = await generateEmbedding(topic);

        const results = recallMemories(db, {
          query: topic,
          queryEmbedding,
          limit: 50,
          scope: project,
        });

        if (results.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No context found for: "${topic}". Store some memories first using memory_store or memory_extract.` }],
            structuredContent: {
              topic,
              groups: [],
              memoriesUsed: 0,
            },
          };
        }

        const grouped: Record<string, typeof results> = {};

        for (const r of results) {
          if (!grouped[r.type]) grouped[r.type] = [];
          grouped[r.type].push(r);
        }

        let output = `## Context for: ${topic}\n\n`;
        let approxTokens = 0;
        const CHARS_PER_TOKEN = 4;

        for (const t of TYPE_ORDER) {
          const memories = grouped[t];
          if (!memories || memories.length === 0) continue;

          const header = `### ${t.charAt(0).toUpperCase() + t.slice(1)}s\n`;
          output += header;
          approxTokens += header.length / CHARS_PER_TOKEN;

          for (const m of memories) {
            const line = `- ${m.content} (${(m.confidence * 100).toFixed(0)}% confidence)\n`;
            approxTokens += line.length / CHARS_PER_TOKEN;
            if (approxTokens > max_tokens) break;
            output += line;
          }
          output += "\n";
          if (approxTokens > max_tokens) break;
        }

        for (const r of results) db.touchAccess(r.id);

        const groups = TYPE_ORDER
          .filter(t => grouped[t] && grouped[t].length > 0)
          .map(t => ({
            type: t,
            memories: grouped[t].map(m => ({
              content: m.content,
              confidence: m.confidence,
            })),
          }));

        return {
          content: [{ type: "text" as const, text: output.trim() }],
          structuredContent: {
            topic,
            groups,
            memoriesUsed: results.length,
          },
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error loading context: ${error instanceof Error ? error.message : String(error)}. Try a different topic or check the database.`,
          }],
        };
      }
    },
  );

  // ── memory_forget ─────────────────────────────────────────
  server.registerTool(
    "memory_forget",
    {
      title: "Forget Memory",
      description: `Delete a specific memory by ID, or delete all memories matching a query. Use when information is outdated, wrong, or the user explicitly asks to forget something.

Args:
  - id (string, optional): Specific memory ID to delete
  - query (string, optional): Delete all memories matching this query (requires confirmation)
  - confirm (boolean): Must be true to actually delete when using query-based deletion (default: false)

Returns:
  Deletion confirmation, or a preview of matching memories when confirm=false.

Error Handling:
  - Returns error if neither id nor query is provided
  - Returns error if memory ID not found`,
      inputSchema: z.object({
        id: z.string().optional().describe("Specific memory ID to delete"),
        query: z.string().optional().describe("Delete all memories matching this query (requires confirmation)"),
        confirm: z.boolean().default(false).describe("Must be true to actually delete when using query-based deletion"),
      }).strict(),
      // outputSchema omitted — z.union() causes _zod serialization errors in MCP SDK
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ id, query, confirm }) => {
      try {
        if (id) {
          const fullId = db.resolveId(id) ?? id;
          const memory = db.getById(fullId);
          if (!memory) {
            return {
              isError: true,
              content: [{ type: "text" as const, text: `Memory ${id} not found. Use memory_recall to search for the correct ID.` }],
            };
          }
          db.deleteMemory(fullId);
          // Keep vector index in sync
          const vecIdx = getVectorIndex();
          if (vecIdx) vecIdx.remove(fullId);
          return {
            content: [{ type: "text" as const, text: `Deleted memory: "${memory.content}" (${memory.type})` }],
            structuredContent: {
              action: "deleted" as const,
              id: fullId,
              content: memory.content,
              type: memory.type,
            },
          };
        }

        if (query) {
          const queryEmbedding = await generateEmbedding(query);
          const matches = recallMemories(db, { query, queryEmbedding, limit: 20, minConfidence: 0, scope: project });

          if (matches.length === 0) {
            return {
              content: [{ type: "text" as const, text: `No memories found matching "${query}".` }],
              structuredContent: {
                action: "preview" as const,
                query,
                total: 0,
                previewed: [],
              },
            };
          }

          if (!confirm) {
            const preview = matches.slice(0, 5).map((m, i) =>
              `${i + 1}. [${shortId(m.id)}] ${m.content}`
            ).join("\n");
            return {
              content: [{
                type: "text" as const,
                text: `Found ${matches.length} memories matching "${query}". Preview:\n${preview}\n\nCall again with confirm=true to delete these.`,
              }],
              structuredContent: {
                action: "preview" as const,
                query,
                total: matches.length,
                previewed: matches.slice(0, 5).map(m => ({ id: m.id, content: m.content })),
              },
            };
          }

          for (const m of matches) {
            db.deleteMemory(m.id);
            // Keep vector index in sync
            const vecIdx2 = getVectorIndex();
            if (vecIdx2) vecIdx2.remove(m.id);
          }
          return {
            content: [{ type: "text" as const, text: `Deleted ${matches.length} memories matching "${query}".` }],
            structuredContent: {
              action: "bulk_deleted" as const,
              query,
              deleted: matches.length,
            },
          };
        }

        return {
          isError: true,
          content: [{ type: "text" as const, text: "Provide either an id or a query to delete memories." }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error forgetting memory: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );

  // ── memory_extract ─────────────────────────────────────────
  server.registerTool(
    "memory_extract",
    {
      title: "Extract Memories from Conversation",
      description: `Extract and store multiple memories from the current conversation in one call. Use this PROACTIVELY:

WHEN to extract:
- User corrects your approach → correction (confidence: 1.0)
- An architectural decision is made → decision (confidence: 0.9)
- You notice a coding pattern the user prefers → pattern (confidence: 0.7)
- User expresses a tool/style preference → preference (confidence: 0.8)
- You learn where something is in the codebase → topology (confidence: 0.7)
- A project fact is established → fact (confidence: 0.6)

HOW OFTEN: Every ~10 exchanges, or when the conversation is ending, or after any significant decision/correction.

Each memory should be a specific, self-contained statement that would be useful in a future conversation without additional context.

Args:
  - memories (array): Array of {content, type, tags, confidence} objects
  - source (string): Source identifier (default: 'conversation')

Returns:
  Summary of stored, reinforced, and skipped memories with details.`,
      inputSchema: z.object({
        memories: z.array(z.object({
          content: z.string().min(1, "Content is required").max(10000, "Content too long — max 10,000 characters").describe("Specific, self-contained memory statement"),
          type: z.enum(MEMORY_TYPES as [string, ...string[]]).describe("Memory type"),
          tags: z.array(z.string()).default([]).describe("Relevant tags"),
          confidence: z.number().min(0).max(1).default(0.8).describe("Confidence level"),
        }).strict()).min(1, "At least one memory is required").describe("Array of memories to extract and store"),
        source: z.string().default("conversation").describe("Source identifier"),
      }).strict(),
      outputSchema: ExtractResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ memories: memoryInputs, source }) => {
      try {
        let stored = 0;
        let reinforced = 0;
        const details: string[] = [];
        const structuredDetails: Array<{
          action: "stored" | "reinforced";
          content: string;
          type?: string;
          id?: string;
          matchedContent?: string;
          similarity?: number;
        }> = [];

        // Load existing embeddings once (not per-memory)
        const existingWithEmbeddings = db.getRecentWithEmbeddings(loadConfig().retrieval.maxCandidates);

        // Pre-compute embeddings (async) then batch all DB writes in a transaction
        const pendingOps: Array<
          | { op: "reinforce"; memId: string; confidence: number; content: string; inputContent: string; similarity: number }
          | { op: "store"; input: typeof memoryInputs[0]; embedding: Float32Array | null }
        > = [];

        for (const input of memoryInputs) {
          const embedding = await generateEmbedding(input.content);

          let isDuplicate = false;
          if (embedding) {
            for (const mem of existingWithEmbeddings) {
              if (!mem.embedding) continue;
              const sim = cosineSimilarity(embedding, mem.embedding);
              if (sim > 0.85) {
                pendingOps.push({
                  op: "reinforce",
                  memId: mem.id,
                  confidence: mem.confidence,
                  content: mem.content,
                  inputContent: input.content,
                  similarity: sim,
                });
                isDuplicate = true;
                break;
              }
            }
          }

          if (!isDuplicate) {
            pendingOps.push({ op: "store", input, embedding });
          }
        }

        // Execute all DB writes atomically
        db.transaction(() => {
          for (const pending of pendingOps) {
            if (pending.op === "reinforce") {
              db.updateConfidence(pending.memId, Math.min(1.0, pending.confidence + 0.1));
              db.touchAccess(pending.memId);
              reinforced++;
              details.push(`  ~ Reinforced: "${pending.content}" (${(pending.similarity * 100).toFixed(0)}% match)`);
              structuredDetails.push({
                action: "reinforced",
                content: pending.inputContent,
                matchedContent: pending.content,
                similarity: Number((pending.similarity * 100).toFixed(0)),
              });
            } else {
              const id = db.insertMemory({
                content: pending.input.content,
                type: pending.input.type as MemoryTypeValue,
                tags: pending.input.tags,
                confidence: pending.input.confidence,
                source,
                embedding: pending.embedding,
                scope: autoScope(pending.input.type as MemoryTypeValue),
              });
              // Keep vector index in sync
              if (pending.embedding) {
                const vecIdx = getVectorIndex();
                if (vecIdx) vecIdx.add(id, pending.embedding);
              }
              stored++;
              details.push(`  + Stored [${pending.input.type}]: "${pending.input.content}" (${shortId(id)})`);
              structuredDetails.push({
                action: "stored",
                content: pending.input.content,
                type: pending.input.type,
                id: shortId(id),
              });
            }
          }
        });

        const stats = db.getStats();
        const summary = [
          `Extraction complete: ${stored} stored, ${reinforced} reinforced.`,
          `Total memories: ${stats.total}.`,
          "",
          ...details,
        ].join("\n");

        return {
          content: [{ type: "text" as const, text: summary }],
          structuredContent: {
            stored,
            reinforced,
            total: stats.total,
            details: structuredDetails,
          },
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error extracting memories: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );

  // ── memory_stats ──────────────────────────────────────────
  server.registerTool(
    "memory_stats",
    {
      title: "Memory Statistics",
      description: `Show memory statistics: total count, breakdown by type, confidence distribution, embedding coverage.

Args: None

Returns:
  Formatted statistics including total count, per-type breakdown, confidence distribution, and embedding coverage.`,
      inputSchema: z.object({}).strict(),
      outputSchema: StatsResultSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        // Use SQL aggregation — no full table load
        const stats = db.getStats();

        if (stats.total === 0) {
          return {
            content: [{ type: "text" as const, text: "No memories stored yet. Use memory_store or memory_extract to create memories." }],
            structuredContent: {
              total: 0,
              byType: {},
              confidence: { high: 0, medium: 0, low: 0 },
              embeddingCoverage: { withEmbeddings: 0, total: 0 },
            },
          };
        }

        const typeLines = TYPE_ORDER
          .filter(t => (stats.byType[t] || 0) > 0)
          .map(t => `  ${t}: ${stats.byType[t]}`);

        const { high: highConf, medium: medConf, low: lowConf } = db.getConfidenceStats();
        const withEmbeddings = db.getEmbeddingCount();

        const text = [
          `Total memories: ${stats.total}`,
          "",
          "By type:",
          ...typeLines,
          "",
          "Confidence:",
          `  High (\u226580%): ${highConf}`,
          `  Medium (50-79%): ${medConf}`,
          `  Low (<50%): ${lowConf}`,
          "",
          `Embeddings: ${withEmbeddings}/${stats.total}`,
        ].join("\n");

        return {
          content: [{ type: "text" as const, text }],
          structuredContent: {
            total: stats.total,
            byType: stats.byType,
            confidence: { high: highConf, medium: medConf, low: lowConf },
            embeddingCoverage: { withEmbeddings, total: stats.total },
          },
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error fetching stats: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );

  // ── memory_export ─────────────────────────────────────────
  server.registerTool(
    "memory_export",
    {
      title: "Export Memories",
      description: `Export all memories in a chosen format, grouped by type. Useful for backup, review, or sharing.

Args:
  - format ("markdown" | "json", optional): Export format (default: "markdown")

Returns:
  Formatted export with all memories grouped by type, including confidence, tags, and metadata.`,
      inputSchema: z.object({
        format: z.enum(["markdown", "json"]).default("markdown").describe("Export format"),
      }).strict(),
      outputSchema: ExportResultSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ format }) => {
      try {
        const all = db.getAllForProject(project);

        if (all.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No memories to export. Use memory_store or memory_extract to create memories." }],
            structuredContent: {
              exportedAt: new Date().toISOString(),
              total: 0,
              markdown: "",
              truncated: false,
            },
          };
        }

        if (format === "json") {
          const grouped: Record<string, Array<{ id: string; content: string; confidence: number; tags: string[]; scope: string; createdAt: number }>> = {};
          for (const t of TYPE_ORDER) {
            const memories = all.filter(m => m.type === t);
            if (memories.length > 0) {
              grouped[t] = memories.map(m => ({
                id: m.id,
                content: m.content,
                confidence: m.confidence,
                tags: m.tags,
                scope: m.scope,
                createdAt: m.createdAt,
              }));
            }
          }
          const jsonStr = JSON.stringify({ exportedAt: new Date().toISOString(), total: all.length, memories: grouped }, null, 2);
          let truncated = false;
          let output = jsonStr;
          if (output.length > CHARACTER_LIMIT) {
            output = output.slice(0, CHARACTER_LIMIT) + "\n... (truncated)";
            truncated = true;
          }
          return {
            content: [{ type: "text" as const, text: output }],
            structuredContent: {
              exportedAt: new Date().toISOString(),
              total: all.length,
              markdown: output,
              truncated,
            },
          };
        }

        let md = `# Amem Memory Export\n\n`;
        md += `*Exported: ${new Date().toISOString()}*\n`;
        md += `*Total: ${all.length} memories*\n\n`;

        for (const t of TYPE_ORDER) {
          const memories = all.filter(m => m.type === t);
          if (memories.length === 0) continue;

          md += `## ${t.charAt(0).toUpperCase() + t.slice(1)}s\n\n`;
          for (const m of memories) {
            const conf = (m.confidence * 100).toFixed(0);
            md += `- **${m.content}** (${conf}% confidence)\n`;
            if (m.tags.length > 0) {
              md += `  Tags: ${m.tags.join(", ")}\n`;
            }
            md += "\n";
          }
        }

        // Truncate if exceeding character limit
        let truncated = false;
        if (md.length > CHARACTER_LIMIT) {
          md = md.slice(0, CHARACTER_LIMIT);
          md += `\n\n---\n*Output truncated at ${CHARACTER_LIMIT} characters. Use memory_recall with filters to view specific memories.*`;
          truncated = true;
        }

        return {
          content: [{ type: "text" as const, text: md.trim() }],
          structuredContent: {
            exportedAt: new Date().toISOString(),
            total: all.length,
            markdown: md.trim(),
            truncated,
          },
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error exporting memories: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );

  // ── memory_inject ─────────────────────────────────────────
  server.registerTool(
    "memory_inject",
    {
      title: "Inject Memory Context",
      description: `Proactively inject relevant corrections and decisions for a topic. Use this AUTOMATICALLY at the start of any task to ensure hard constraints are respected.

Unlike memory_context (which returns all types), memory_inject focuses on the two most critical types:
- **Corrections** — hard constraints that MUST be followed (returned as a list)
- **Decisions** — architectural choices that SHOULD inform the approach (returned as a list)

This is the recommended tool for proactive context injection. Call it before writing any code.

Args:
  - topic (string): The topic or task about to be worked on

Returns:
  Structured object with corrections list, decisions list, and formatted context string.`,
      inputSchema: z.object({
        topic: z.string().min(1, "Topic is required").describe("The topic or task about to be worked on"),
      }).strict(),
      outputSchema: InjectResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ topic }) => {
      try {
        const queryEmbedding = await generateEmbedding(topic);

        const results = recallMemories(db, {
          query: topic,
          queryEmbedding,
          limit: 30,
          scope: project,
        });

        const corrections = results
          .filter(r => r.type === MemoryType.CORRECTION)
          .map(r => r.content);
        const decisions = results
          .filter(r => r.type === MemoryType.DECISION)
          .map(r => r.content);

        let context = "";
        if (corrections.length > 0) {
          context += "## Corrections (MUST follow)\n";
          context += corrections.map(c => `- ${c}`).join("\n");
          context += "\n\n";
        }
        if (decisions.length > 0) {
          context += "## Decisions (SHOULD follow)\n";
          context += decisions.map(d => `- ${d}`).join("\n");
          context += "\n";
        }

        if (corrections.length === 0 && decisions.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No corrections or decisions found for: "${topic}".` }],
            structuredContent: {
              topic,
              corrections: [],
              decisions: [],
              context: "",
              memoriesUsed: 0,
            },
          };
        }

        // Only touch access for memories actually surfaced to the user
        const injectedIds = new Set<string>();
        for (const r of results) {
          if (r.type === MemoryType.CORRECTION || r.type === MemoryType.DECISION) {
            db.touchAccess(r.id);
            injectedIds.add(r.id);
          }
        }

        // Graph-aware injection: surface 1-hop neighbors of top results
        const graphContext: string[] = [];
        const topResults = results.filter(r => r.type === MemoryType.CORRECTION || r.type === MemoryType.DECISION).slice(0, 5);
        for (const r of topResults) {
          const related = db.getRelatedMemories(r.id);
          for (const rel of related.slice(0, 2)) {
            if (injectedIds.has(rel.id)) continue;
            if (rel.validUntil !== null && rel.validUntil <= Date.now()) continue;
            injectedIds.add(rel.id);
            graphContext.push(`- [${rel.type}] ${rel.content}`);
          }
        }
        if (graphContext.length > 0) {
          context += "\n\n## Related Context (from knowledge graph)\n";
          context += graphContext.join("\n");
        }

        // Check if reflection is due and nudge
        const reflectionCheck = isReflectionDue(db);
        if (reflectionCheck.due) {
          context += `\n\n## Reflection Recommended\n`;
          context += `${reflectionCheck.reason}. Run \`memory_reflect\` to analyze memory health, find contradictions, and synthesize clusters.`;
        }

        // Surface active knowledge gaps relevant to this topic
        const gaps = db.getActiveKnowledgeGaps(5);
        if (gaps.length > 0) {
          const relevant = gaps.filter(g =>
            topic.toLowerCase().includes(g.queryPattern) || g.queryPattern.includes(topic.toLowerCase()),
          );
          if (relevant.length > 0) {
            context += `\n\n## Knowledge Gaps\n`;
            context += relevant.map(g => `- "${g.queryPattern}" (asked ${g.hitCount}x, avg ${(g.avgConfidence * 100).toFixed(0)}% confidence)`).join("\n");
          }
        }

        return {
          content: [{ type: "text" as const, text: context.trim() }],
          structuredContent: {
            topic,
            corrections,
            decisions,
            context: context.trim(),
            memoriesUsed: corrections.length + decisions.length + graphContext.length,
          },
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error injecting context: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );

  // ── memory_consolidate ──────────────────────────────────
  server.registerTool(
    "memory_consolidate",
    {
      title: "Consolidate Memories",
      description: `Analyze and optimize the memory database. Merges near-duplicates, prunes stale low-value memories, and promotes frequently-accessed ones. This keeps your memory system lean and high-signal over months of use.

NEVER auto-prunes corrections (they are always preserved).

Args:
  - confirm (boolean): false = preview what would change (default), true = execute changes
  - max_stale_days (number): Days of inactivity before a memory is considered stale (default: 60)
  - min_confidence (number): Minimum confidence for stale memories to survive (default: 0.3)
  - min_access_count (number): Minimum access count for stale memories to survive (default: 2)
  - enable_decay (boolean): Enable confidence decay for stale non-correction memories (default: false)
  - decay_factor (number 0-1): Multiplier applied to confidence per consolidation cycle (default: 0.95)

Returns:
  Report with merged/pruned/promoted/decayed counts, health score, and detailed action list.`,
      inputSchema: z.object({
        confirm: z.boolean().default(false).describe("false = preview (safe), true = execute consolidation"),
        max_stale_days: z.number().int().min(1).default(60).describe("Days of inactivity before considering a memory stale"),
        min_confidence: z.number().min(0).max(1).default(0.3).describe("Confidence threshold for stale memory pruning"),
        min_access_count: z.number().int().min(0).default(2).describe("Minimum access count for stale memories to survive pruning"),
        enable_decay: z.boolean().default(false).describe("Enable confidence decay for stale non-correction memories"),
        decay_factor: z.number().min(0.5).max(1).default(0.95).describe("Multiplier applied to confidence per consolidation cycle"),
      }).strict(),
      outputSchema: ConsolidateResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ confirm, max_stale_days, min_confidence, min_access_count, enable_decay, decay_factor }) => {
      try {
        const report = consolidateMemories(db, cosineSimilarity, {
          dryRun: !confirm,
          maxStaleDays: max_stale_days,
          minConfidence: min_confidence,
          minAccessCount: min_access_count,
          enableDecay: enable_decay,
          decayFactor: decay_factor,
        });

        const mode = confirm ? "EXECUTED" : "PREVIEW (dry run)";
        const lines = [
          `Memory Consolidation — ${mode}`,
          "",
          `Health Score: ${report.healthScore}/100`,
          `Before: ${report.before.total} memories`,
          `After: ${report.after.total} memories`,
          "",
          `Merged: ${report.merged} near-duplicates`,
          `Pruned: ${report.pruned} stale memories`,
          `Promoted: ${report.promoted} frequently-used memories`,
          ...(report.decayed > 0 ? [`Decayed: ${report.decayed} stale memories (confidence reduced)`] : []),
        ];

        if (report.actions.length > 0) {
          lines.push("", "Details:");
          for (const a of report.actions) {
            const prefix = a.action === "merged" ? "~" : a.action === "pruned" ? "-" : a.action === "decayed" ? "v" : "+";
            lines.push(`  ${prefix} ${a.description}`);
          }
        }

        if (!confirm && (report.merged > 0 || report.pruned > 0 || report.decayed > 0)) {
          lines.push("", "Call again with confirm=true to execute these changes.");
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: {
            merged: report.merged,
            pruned: report.pruned,
            promoted: report.promoted,
            decayed: report.decayed,
            healthScore: report.healthScore,
            before: report.before,
            after: report.after,
            actions: report.actions,
          },
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error consolidating memories: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );

  // ── memory_patch ──────────────────────────────────────────
  server.registerTool(
    "memory_patch",
    {
      title: "Patch Memory",
      description: `Apply a targeted, AI-executable patch to an existing memory. Unlike delete+recreate, patches are surgical — they update a single field while automatically snapshotting the previous state into version history for full reversibility.

Use this when:
- Correcting a memory that is mostly right but has a wrong detail
- Updating confidence after validation
- Retagging a memory for better recall
- Reclassifying type (e.g. fact → decision)

Every patch creates a version snapshot. Use memory_versions to view history or roll back.

Args:
  - id (string): Memory ID to patch (short IDs like first 8 chars work)
  - field (enum): Which field to change — content | confidence | tags | type
  - value (string | number | string[]): New value for the field
  - reason (string): Why this patch is being made — stored in version history`,
      inputSchema: z.object({
        id: z.string().min(1, "Memory ID is required").describe("Memory ID — full UUID or first 8 characters"),
        field: z.enum(["content", "confidence", "tags", "type"]).describe("Which field to patch"),
        value: z.union([
          z.string(),
          z.number().min(0).max(1),
          z.array(z.string()),
        ]).describe("New value — string for content/type, number 0-1 for confidence, string[] for tags"),
        reason: z.string().min(1).describe("Why this patch is being made — stored in version history"),
      }).strict().refine(({ field, value }) => {
        if (field === "confidence") return typeof value === "number";
        if (field === "tags") return Array.isArray(value);
        if (field === "content" || field === "type") return typeof value === "string";
        return true;
      }, { message: "Value type must match field: string for content/type, number for confidence, string[] for tags" }),
      // outputSchema omitted — z.union() causes _zod serialization errors in MCP SDK
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ id, field, value, reason }) => {
      try {
        const fullId = db.resolveId(id);
        if (!fullId) {
          return {
            content: [{ type: "text" as const, text: `No memory found with ID starting with "${id}".` }],
            structuredContent: { action: "not_found" as const, id },
          };
        }

        const mem = db.getById(fullId);
        if (!mem) {
          return {
            content: [{ type: "text" as const, text: `Memory "${fullId}" not found.` }],
            structuredContent: { action: "not_found" as const, id: fullId },
          };
        }

        const previousContent = field === "content" ? mem.content
          : field === "confidence" ? String(mem.confidence)
          : field === "tags" ? JSON.stringify(mem.tags)
          : mem.type;

        const success = db.patchMemory(fullId, { field, value, reason });
        if (!success) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: `Failed to patch memory "${fullId}". Unknown field or DB error.` }],
          };
        }

        // Regenerate embedding if content changed
        if (field === "content" && typeof value === "string") {
          const newEmbedding = await generateEmbedding(value);
          if (newEmbedding) {
            db.updateEmbedding(fullId, newEmbedding);
            // Keep vector index in sync
            const vecIdx = getVectorIndex();
            if (vecIdx) vecIdx.add(fullId, newEmbedding);
          }
        }

        const displayValue = Array.isArray(value) ? `[${(value as string[]).join(", ")}]` : String(value);
        return {
          content: [{
            type: "text" as const,
            text: `Patched memory (${shortId(fullId)}): ${field} → ${displayValue}\nReason: ${reason}\nPrevious ${field}: ${previousContent}\nVersion snapshot saved.`,
          }],
          structuredContent: {
            action: "patched" as const,
            id: fullId,
            field,
            previousContent,
            reason,
            versionSaved: true,
          },
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error patching memory: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );

  // ── memory_import ────────────────────────────────────────
  server.registerTool(
    "memory_import",
    {
      title: "Import Memories from JSON",
      description: `Import memories from a JSON array. Use this to restore from a backup, migrate between machines, or seed memories from another source.

Each memory in the array should have: content, type, tags, confidence. Duplicates are detected by content hash and skipped.

Args:
  - memories (array): Array of {content, type, tags, confidence} objects to import
  - source (string): Import source identifier (default: 'import')

Returns:
  Summary of imported, skipped (duplicate), and total memories.`,
      inputSchema: z.object({
        memories: z.array(z.object({
          content: z.string().min(1).max(10000),
          type: z.enum(MEMORY_TYPES as [string, ...string[]]),
          tags: z.array(z.string()).default([]),
          confidence: z.number().min(0).max(1).default(0.8),
        }).strict()).min(1).max(500).describe("Array of memories to import"),
        source: z.string().default("import").describe("Import source identifier"),
      }).strict(),
      outputSchema: ExtractResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ memories: memoryInputs, source }) => {
      try {
        let stored = 0;
        let skipped = 0;
        const details: Array<{
          action: "stored" | "reinforced";
          content: string;
          type?: string;
          id?: string;
          matchedContent?: string;
          similarity?: number;
        }> = [];

        // Pre-compute embeddings, then batch all DB writes
        const pendingOps: Array<{
          input: typeof memoryInputs[0];
          embedding: Float32Array | null;
        }> = [];

        for (const input of memoryInputs) {
          // Skip exact duplicates by content hash
          const existing = db.findByContentHash(input.content);
          if (existing) {
            skipped++;
            details.push({
              action: "reinforced",
              content: input.content,
              matchedContent: existing.content,
              similarity: 100,
            });
            continue;
          }

          const embedding = await generateEmbedding(input.content);
          pendingOps.push({ input, embedding });
        }

        db.transaction(() => {
          for (const { input, embedding } of pendingOps) {
            const id = db.insertMemory({
              content: input.content,
              type: input.type as MemoryTypeValue,
              tags: input.tags,
              confidence: input.confidence,
              source,
              embedding,
              scope: autoScope(input.type as MemoryTypeValue),
            });
            // Keep vector index in sync
            if (embedding) {
              const vecIdx = getVectorIndex();
              if (vecIdx) vecIdx.add(id, embedding);
            }
            stored++;
            details.push({
              action: "stored",
              content: input.content,
              type: input.type,
              id: shortId(id),
            });
          }
        });

        const stats = db.getStats();
        return {
          content: [{
            type: "text" as const,
            text: `Import complete: ${stored} imported, ${skipped} duplicates skipped. Total memories: ${stats.total}.`,
          }],
          structuredContent: {
            stored,
            reinforced: skipped,
            total: stats.total,
            details,
          },
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error importing memories: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );
}
