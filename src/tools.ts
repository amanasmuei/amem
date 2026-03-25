import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AmemDatabase } from "./database.js";
import { MemoryType, type MemoryTypeValue, recallMemories, detectConflict, consolidateMemories } from "./memory.js";
import { generateEmbedding, cosineSimilarity } from "./embeddings.js";
import {
  StoreResultSchema,
  RecallResultSchema,
  ContextResultSchema,
  ForgetResultSchema,
  ExtractResultSchema,
  StatsResultSchema,
  ExportResultSchema,
  InjectResultSchema,
  ConsolidateResultSchema,
  PatchResultSchema,
  LogAppendResultSchema,
  LogRecallResultSchema,
  RelateResultSchema,
  VersionResultSchema,
  TemporalResultSchema,
} from "./schemas.js";

const MEMORY_TYPES = Object.values(MemoryType);
const CHARACTER_LIMIT = 50_000;

export const TYPE_ORDER: MemoryTypeValue[] = ["correction", "decision", "pattern", "preference", "topology", "fact"];

export function formatAge(timestamp: number): string {
  const ms = Date.now() - timestamp;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function registerTools(server: McpServer, db: AmemDatabase, project: string): void {

  const GLOBAL_TYPES: MemoryTypeValue[] = ["correction", "preference", "pattern"];
  function autoScope(type: MemoryTypeValue): string {
    return GLOBAL_TYPES.includes(type) ? "global" : project;
  }

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
      outputSchema: StoreResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ content, type, tags, confidence, source, scope }) => {
      try {
        const embedding = await generateEmbedding(content);

        // Single pass over existing memories: conflict detection + reinforcement
        if (embedding) {
          const existing = db.getAllWithEmbeddings();

          for (const mem of existing) {
            if (!mem.embedding) continue;
            const sim = cosineSimilarity(embedding, mem.embedding);
            const conflict = detectConflict(content, mem.content, sim);
            if (conflict.isConflict) {
              db.updateConfidence(mem.id, Math.max(mem.confidence, confidence));
              return {
                content: [{
                  type: "text" as const,
                  text: `Memory conflict detected. Similar memory exists (${(sim * 100).toFixed(0)}% match): "${mem.content}" — updated its confidence instead of creating duplicate.\n\nIf these are genuinely different memories, rephrase to be more distinct.`,
                }],
                structuredContent: {
                  action: "conflict_resolved" as const,
                  existingId: mem.id,
                  similarity: Number((sim * 100).toFixed(0)),
                  existingContent: mem.content,
                },
              };
            }
            if (sim > 0.8) {
              db.updateConfidence(mem.id, Math.min(1.0, mem.confidence + 0.1));
            }
          }

          const id = db.insertMemory({ content, type: type as MemoryTypeValue, tags, confidence, source, embedding, scope: scope ?? autoScope(type as MemoryTypeValue) });

          // Reinforce related memories (0.6-0.8 range) using already-loaded embeddings
          let evolved = 0;
          for (const mem of existing) {
            if (!mem.embedding) continue;
            const sim = cosineSimilarity(embedding, mem.embedding);
            if (sim > 0.6 && sim <= 0.8) {
              db.touchAccess(mem.id);
              evolved++;
            }
          }

          const stats = db.getStats();
          const evolvedNote = evolved > 0 ? ` Reinforced ${evolved} related memories.` : "";
          return {
            content: [{
              type: "text" as const,
              text: `Stored ${type} memory (${id.slice(0, 8)}). Confidence: ${confidence}. Tags: [${tags.join(", ")}]. Total memories: ${stats.total}.${evolvedNote}`,
            }],
            structuredContent: {
              action: "stored" as const,
              id,
              type,
              confidence,
              tags,
              total: stats.total,
              reinforced: evolved,
            },
          };
        }

        // No embeddings available — store directly
        const id = db.insertMemory({ content, type: type as MemoryTypeValue, tags, confidence, source, embedding, scope: scope ?? autoScope(type as MemoryTypeValue) });
        const stats = db.getStats();
        return {
          content: [{
            type: "text" as const,
            text: `Stored ${type} memory (${id.slice(0, 8)}). Confidence: ${confidence}. Tags: [${tags.join(", ")}]. Total memories: ${stats.total}.`,
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

Returns:
  Ranked list of memories with scores, confidence, age, and tags.`,
      inputSchema: z.object({
        query: z.string().min(1, "Query is required").describe("What to search for — natural language works best"),
        limit: z.number().int().min(1).max(50).default(10).describe("Max results to return"),
        type: z.enum(MEMORY_TYPES as [string, ...string[]]).optional().describe("Filter by memory type"),
        tag: z.string().optional().describe("Filter by tag"),
        min_confidence: z.number().min(0).max(1).optional().describe("Minimum confidence threshold"),
      }).strict(),
      outputSchema: RecallResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ query, limit, type, tag, min_confidence }) => {
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
        });

        for (const r of results) {
          db.touchAccess(r.id);
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

        const memoriesData = results.map((r) => ({
          id: r.id,
          content: r.content,
          type: r.type,
          score: Number(r.score.toFixed(3)),
          confidence: r.confidence,
          tags: r.tags,
          age: formatAge(r.createdAt),
        }));

        const lines = results.map((r, i) => {
          const age = formatAge(r.createdAt);
          const conf = (r.confidence * 100).toFixed(0);
          return `${i + 1}. [${r.type}] ${r.content}\n   Score: ${r.score.toFixed(3)} | Confidence: ${conf}% | Age: ${age} | Tags: [${r.tags.join(", ")}]`;
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
      outputSchema: ForgetResultSchema,
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
          const memory = db.getById(id);
          if (!memory) {
            return {
              isError: true,
              content: [{ type: "text" as const, text: `Memory ${id} not found. Use memory_recall to search for the correct ID.` }],
            };
          }
          db.deleteMemory(id);
          return {
            content: [{ type: "text" as const, text: `Deleted memory: "${memory.content}" (${memory.type})` }],
            structuredContent: {
              action: "deleted" as const,
              id,
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
              `${i + 1}. [${m.id.slice(0, 8)}] ${m.content}`
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

          for (const m of matches) db.deleteMemory(m.id);
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
        const existingWithEmbeddings = db.getAllWithEmbeddings();

        for (const input of memoryInputs) {
          const embedding = await generateEmbedding(input.content);

          // Check for duplicates/conflicts
          let isDuplicate = false;
          if (embedding) {
            for (const mem of existingWithEmbeddings) {
              if (!mem.embedding) continue;
              const sim = cosineSimilarity(embedding, mem.embedding);
              if (sim > 0.85) {
                // Near-duplicate — reinforce existing
                db.updateConfidence(mem.id, Math.min(1.0, mem.confidence + 0.1));
                db.touchAccess(mem.id);
                reinforced++;
                details.push(`  ~ Reinforced: "${mem.content}" (${(sim * 100).toFixed(0)}% match)`);
                structuredDetails.push({
                  action: "reinforced",
                  content: input.content,
                  matchedContent: mem.content,
                  similarity: Number((sim * 100).toFixed(0)),
                });
                isDuplicate = true;
                break;
              }
            }
          }

          if (!isDuplicate) {
            const id = db.insertMemory({
              content: input.content,
              type: input.type as MemoryTypeValue,
              tags: input.tags,
              confidence: input.confidence,
              source,
              embedding,
              scope: autoScope(input.type as MemoryTypeValue),
            });
            stored++;
            details.push(`  + Stored [${input.type}]: "${input.content}" (${id.slice(0, 8)})`);
            structuredDetails.push({
              action: "stored",
              content: input.content,
              type: input.type,
              id: id.slice(0, 8),
            });
          }
        }

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
        const all = db.getAllForProject(project);
        const stats = db.getStats();

        if (all.length === 0) {
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

        const highConf = all.filter(m => m.confidence >= 0.8).length;
        const medConf = all.filter(m => m.confidence >= 0.5 && m.confidence < 0.8).length;
        const lowConf = all.filter(m => m.confidence < 0.5).length;
        const withEmbeddings = db.getAllWithEmbeddings().length;

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
      description: `Export all memories as formatted markdown, grouped by type. Useful for backup, review, or sharing.

Args: None

Returns:
  Markdown document with all memories grouped by type, including confidence, tags, and metadata.`,
      inputSchema: z.object({}).strict(),
      outputSchema: ExportResultSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
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

        for (const r of results) db.touchAccess(r.id);

        return {
          content: [{ type: "text" as const, text: context.trim() }],
          structuredContent: {
            topic,
            corrections,
            decisions,
            context: context.trim(),
            memoriesUsed: corrections.length + decisions.length,
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

Returns:
  Report with merged/pruned/promoted counts, health score, and detailed action list.`,
      inputSchema: z.object({
        confirm: z.boolean().default(false).describe("false = preview (safe), true = execute consolidation"),
        max_stale_days: z.number().int().min(1).default(60).describe("Days of inactivity before considering a memory stale"),
        min_confidence: z.number().min(0).max(1).default(0.3).describe("Confidence threshold for stale memory pruning"),
      }).strict(),
      outputSchema: ConsolidateResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ confirm, max_stale_days, min_confidence }) => {
      try {
        const report = consolidateMemories(db, cosineSimilarity, {
          dryRun: !confirm,
          maxStaleDays: max_stale_days,
          minConfidence: min_confidence,
          minAccessCount: 2,
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
        ];

        if (report.actions.length > 0) {
          lines.push("", "Details:");
          for (const a of report.actions) {
            const prefix = a.action === "merged" ? "~" : a.action === "pruned" ? "-" : "+";
            lines.push(`  ${prefix} ${a.description}`);
          }
        }

        if (!confirm && (report.merged > 0 || report.pruned > 0)) {
          lines.push("", "Call again with confirm=true to execute these changes.");
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: {
            merged: report.merged,
            pruned: report.pruned,
            promoted: report.promoted,
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
      outputSchema: PatchResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ id, field, value, reason }) => {
      try {
        // Support short IDs: find full ID if 8-char prefix given
        let fullId = id;
        if (id.length < 36) {
          const all = db.getAll();
          const match = all.find(m => m.id.startsWith(id));
          if (!match) {
            return {
              content: [{ type: "text" as const, text: `No memory found with ID starting with "${id}".` }],
              structuredContent: { action: "not_found" as const, id },
            };
          }
          fullId = match.id;
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
          if (newEmbedding) db.updateEmbedding(fullId, newEmbedding);
        }

        const displayValue = Array.isArray(value) ? `[${(value as string[]).join(", ")}]` : String(value);
        return {
          content: [{
            type: "text" as const,
            text: `Patched memory (${fullId.slice(0, 8)}): ${field} → ${displayValue}\nReason: ${reason}\nPrevious ${field}: ${previousContent}\nVersion snapshot saved.`,
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

  // ── memory_versions ───────────────────────────────────────
  server.registerTool(
    "memory_versions",
    {
      title: "Memory Version History",
      description: `View the full edit history of a memory, or restore it to a previous version. Every memory_patch and memory_store conflict resolution creates an immutable snapshot. Nothing is ever truly lost.

Use this to:
- See how a memory has evolved over time
- Roll back a bad patch
- Audit when and why a memory changed

Args:
  - memory_id (string): Memory to inspect — full or 8-char short ID
  - restore_version_id (string, optional): If provided, restore this specific version (creates a new patch, keeps history intact)`,
      inputSchema: z.object({
        memory_id: z.string().min(1).describe("Memory ID to inspect — full UUID or first 8 chars"),
        restore_version_id: z.string().optional().describe("Version ID to restore — rolls the memory back to this snapshot"),
      }).strict(),
      outputSchema: VersionResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ memory_id, restore_version_id }) => {
      try {
        // Resolve short IDs
        let fullId = memory_id;
        if (memory_id.length < 36) {
          const all = db.getAll();
          const match = all.find(m => m.id.startsWith(memory_id));
          if (match) fullId = match.id;
        }

        const mem = db.getById(fullId);
        if (!mem) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: `Memory "${fullId}" not found.` }],
          };
        }

        if (restore_version_id) {
          const history = db.getVersionHistory(fullId);
          const target = history.find(v => v.versionId === restore_version_id || v.versionId.startsWith(restore_version_id));
          if (!target) {
            return {
              isError: true,
              content: [{ type: "text" as const, text: `Version "${restore_version_id}" not found in history for memory ${fullId.slice(0, 8)}.` }],
            };
          }

          db.patchMemory(fullId, { field: "content", value: target.content, reason: `restored from version ${target.versionId.slice(0, 8)}` });
          db.patchMemory(fullId, { field: "confidence", value: target.confidence, reason: `restored from version ${target.versionId.slice(0, 8)}` });

          const newEmbedding = await generateEmbedding(target.content);
          if (newEmbedding) db.updateEmbedding(fullId, newEmbedding);

          return {
            content: [{
              type: "text" as const,
              text: `Restored memory ${fullId.slice(0, 8)} to version ${target.versionId.slice(0, 8)}\nContent: "${target.content}"\nConfidence: ${(target.confidence * 100).toFixed(0)}%\nOriginal age: ${formatAge(target.editedAt)}`,
            }],
            structuredContent: {
              action: "restored" as const,
              memoryId: fullId,
              restoredContent: target.content,
              versionId: target.versionId,
            },
          };
        }

        const history = db.getVersionHistory(fullId);
        if (history.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No version history for memory ${fullId.slice(0, 8)}. Memories gain history after their first patch.` }],
            structuredContent: {
              action: "history" as const,
              memoryId: fullId,
              currentContent: mem.content,
              versions: [],
            },
          };
        }

        const lines = [
          `Version history for memory ${fullId.slice(0, 8)}`,
          `Current: "${mem.content}" (${(mem.confidence * 100).toFixed(0)}% confidence)`,
          "",
          `${history.length} version${history.length === 1 ? "" : "s"}:`,
          ...history.map((v, i) =>
            `  ${i + 1}. [${v.versionId.slice(0, 8)}] "${v.content}" — ${(v.confidence * 100).toFixed(0)}% — ${formatAge(v.editedAt)}\n     Reason: ${v.reason}`
          ),
        ];

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: {
            action: "history" as const,
            memoryId: fullId,
            currentContent: mem.content,
            versions: history.map(v => ({
              versionId: v.versionId,
              content: v.content,
              confidence: v.confidence,
              editedAt: v.editedAt,
              age: formatAge(v.editedAt),
              reason: v.reason,
            })),
          },
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error reading version history: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );

  // ── memory_log ────────────────────────────────────────────
  server.registerTool(
    "memory_log",
    {
      title: "Append to Conversation Log",
      description: `Append a raw conversation turn to the lossless, append-only conversation log. Unlike memory_store (which distills memories), memory_log preserves the exact, unmodified content of every exchange — nothing is summarized or discarded.

The log is your permanent audit trail:
- Every user message, assistant response, or system note
- Fully searchable via memory_log_recall
- Organized by session ID for replaying conversations
- Scoped per project — never mixes contexts

Use this to preserve conversation turns that may be important later but aren't yet ready to be distilled into memories. You can later search the log and promote specific entries into proper memories.

Args:
  - session_id (string): Conversation session identifier — use a consistent ID per conversation
  - role (enum): Who said it — user | assistant | system
  - content (string): The exact text to preserve — no summarization
  - metadata (object, optional): Extra context — e.g., { tool: "vscode", file: "auth.ts" }`,
      inputSchema: z.object({
        session_id: z.string().min(1).describe("Session identifier — keep consistent across a conversation"),
        role: z.enum(["user", "assistant", "system"]).describe("Who said this"),
        content: z.string().min(1).max(50000, "Log content too long — max 50,000 characters").describe("Exact content to preserve — not summarized"),
        metadata: z.record(z.unknown()).optional().describe("Optional extra context"),
      }).strict(),
      outputSchema: LogAppendResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ session_id, role, content, metadata }) => {
      try {
        const id = db.appendLog({
          sessionId: session_id,
          role,
          content,
          project,
          metadata: metadata ?? {},
        });
        return {
          content: [{
            type: "text" as const,
            text: `Logged ${role} turn (${id.slice(0, 8)}) to session "${session_id}". Content length: ${content.length} chars.`,
          }],
          structuredContent: {
            id,
            sessionId: session_id,
            role,
            appended: true,
          },
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error appending to log: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );

  // ── memory_log_recall ─────────────────────────────────────
  server.registerTool(
    "memory_log_recall",
    {
      title: "Search Conversation Log",
      description: `Search or replay the lossless conversation log. Returns raw, unmodified conversation turns — nothing has been summarized or lost.

Use this when:
- You need to find exactly what was said in a past conversation
- Replaying a session to reconstruct context
- Searching for a specific phrase, decision, or exchange that may not have been extracted into a memory
- Auditing what happened in a past session

Search modes:
- By session_id: replays a specific conversation in order
- By query: full-text search across all logged content
- Recent: retrieve the N most recent log entries for this project

Args:
  - session_id (string, optional): Replay a specific session in chronological order
  - query (string, optional): Full-text search across all logged content
  - limit (number): Max entries to return (default: 20)`,
      inputSchema: z.object({
        session_id: z.string().optional().describe("Replay a specific session — returns turns in order"),
        query: z.string().optional().describe("Full-text search across all logged content"),
        limit: z.number().int().min(1).max(200).default(20).describe("Max entries to return"),
      }).strict().refine(d => d.session_id || d.query || true, "Provide session_id or query, or omit both for recent entries"),
      outputSchema: LogRecallResultSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ session_id, query, limit }) => {
      try {
        let entries: Awaited<ReturnType<typeof db.getRecentLog>>;

        if (session_id) {
          entries = db.getLogBySession(session_id);
        } else if (query) {
          entries = db.searchLog(query, limit);
        } else {
          entries = db.getRecentLog(limit, project);
        }

        if (entries.length === 0) {
          const hint = session_id
            ? `No log entries found for session "${session_id}". Log turns using memory_log first.`
            : query
            ? `No log entries match "${query}".`
            : `No log entries yet for this project. Use memory_log to preserve conversation turns.`;
          return {
            content: [{ type: "text" as const, text: hint }],
            structuredContent: {
              query,
              sessionId: session_id,
              total: 0,
              entries: [],
            },
          };
        }

        const lines: string[] = [];
        if (session_id) {
          lines.push(`Session "${session_id}" — ${entries.length} turn${entries.length === 1 ? "" : "s"}`);
          lines.push("");
          for (const e of entries) {
            const roleLabel = e.role === "user" ? "▶ User" : e.role === "assistant" ? "◀ Assistant" : "⚙ System";
            lines.push(`[${formatAge(e.timestamp)}] ${roleLabel}`);
            lines.push(e.content.length > 300 ? e.content.slice(0, 300) + "…" : e.content);
            lines.push("");
          }
        } else {
          const header = query ? `Log search: "${query}" — ${entries.length} result${entries.length === 1 ? "" : "s"}` : `Recent log — ${entries.length} entries`;
          lines.push(header);
          lines.push("");
          for (const e of entries) {
            lines.push(`[${e.id.slice(0, 8)}] ${formatAge(e.timestamp)} | ${e.role} | session:${e.sessionId.slice(0, 8)}`);
            lines.push(e.content.length > 200 ? e.content.slice(0, 200) + "…" : e.content);
            lines.push("");
          }
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n").trim() }],
          structuredContent: {
            query,
            sessionId: session_id,
            total: entries.length,
            entries: entries.slice(0, limit).map(e => ({
              id: e.id,
              role: e.role,
              content: e.content,
              timestamp: e.timestamp,
              age: formatAge(e.timestamp),
              project: e.project,
            })),
          },
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error searching log: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );

  // ── memory_relate ─────────────────────────────────────────
  server.registerTool(
    "memory_relate",
    {
      title: "Relate / Unrelate Memories",
      description: `Build a knowledge graph by explicitly linking memories with typed relationships. Or inspect all connections for a given memory.

Relationship types (use these or invent your own):
- "supports"     — this memory provides evidence for the other
- "contradicts"  — these memories are in tension
- "depends_on"   — one requires the other to make sense
- "supersedes"   — this memory replaces or updates the other
- "related_to"   — loosely related, no specific direction
- "caused_by"    — this memory is a consequence of the other
- "implements"   — this memory is a concrete implementation of a higher-level decision

The knowledge graph lets amem surface not just direct matches, but connected context — when you recall one memory, its graph neighbors are available too.

Args:
  - action (enum): "relate" | "unrelate" | "graph"
  - from_id (string): Source memory ID (required for relate/unrelate)
  - to_id (string): Target memory ID (required for relate)
  - relation_type (string): Relationship label (required for relate)
  - strength (number 0-1): How strong is this relationship (default: 0.8)
  - relation_id (string): Relation ID to remove (required for unrelate)
  - memory_id (string): Memory to inspect all connections for (required for graph)`,
      inputSchema: z.object({
        action: z.enum(["relate", "unrelate", "graph"]).describe("Operation to perform"),
        from_id: z.string().optional().describe("Source memory ID (relate)"),
        to_id: z.string().optional().describe("Target memory ID (relate)"),
        relation_type: z.string().optional().describe("Relationship type label"),
        strength: z.number().min(0).max(1).default(0.8).optional().describe("Relationship strength 0-1"),
        relation_id: z.string().optional().describe("Relation ID to remove (unrelate)"),
        memory_id: z.string().optional().describe("Memory ID to inspect graph connections for"),
      }).strict(),
      outputSchema: RelateResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ action, from_id, to_id, relation_type, strength, relation_id, memory_id }) => {
      try {
        if (action === "relate") {
          if (!from_id || !to_id || !relation_type) {
            return {
              isError: true,
              content: [{ type: "text" as const, text: "relate requires from_id, to_id, and relation_type." }],
            };
          }
          const resolveId = (id: string) => {
            if (id.length >= 36) return id;
            const match = db.getAll().find(m => m.id.startsWith(id));
            return match?.id ?? id;
          };
          const fromFull = resolveId(from_id);
          const toFull = resolveId(to_id);
          const fromMem = db.getById(fromFull);
          const toMem = db.getById(toFull);
          if (!fromMem || !toMem) {
            return {
              isError: true,
              content: [{ type: "text" as const, text: `Memory not found: ${!fromMem ? from_id : to_id}` }],
            };
          }
          const relId = db.addRelation(fromFull, toFull, relation_type, strength ?? 0.8);
          return {
            content: [{
              type: "text" as const,
              text: `Linked memories:\n  "${fromMem.content.slice(0, 60)}"\n  ${relation_type} →\n  "${toMem.content.slice(0, 60)}"\nRelation ID: ${relId.slice(0, 8)}`,
            }],
            structuredContent: {
              action: "related" as const,
              relationId: relId,
              fromId: fromFull,
              toId: toFull,
              type: relation_type,
              strength: strength ?? 0.8,
            },
          };
        }

        if (action === "unrelate") {
          if (!relation_id) {
            return {
              isError: true,
              content: [{ type: "text" as const, text: "unrelate requires relation_id. Use action:graph to find relation IDs." }],
            };
          }
          db.removeRelation(relation_id);
          return {
            content: [{ type: "text" as const, text: `Removed relation ${relation_id.slice(0, 8)}.` }],
            structuredContent: { action: "unrelated" as const, relationId: relation_id },
          };
        }

        // graph
        if (!memory_id) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: "graph requires memory_id." }],
          };
        }
        const resolveId = (id: string) => {
          if (id.length >= 36) return id;
          const match = db.getAll().find(m => m.id.startsWith(id));
          return match?.id ?? id;
        };
        const fullId = resolveId(memory_id);
        const mem = db.getById(fullId);
        if (!mem) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: `Memory "${memory_id}" not found.` }],
          };
        }

        const relations = db.getRelations(fullId);
        if (relations.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: `Memory ${fullId.slice(0, 8)} has no explicit relations yet.\n\nUse action:relate to build the knowledge graph.`,
            }],
            structuredContent: { action: "graph" as const, memoryId: fullId, relations: [] },
          };
        }

        const lines = [
          `Knowledge graph for memory ${fullId.slice(0, 8)}:`,
          `"${mem.content.slice(0, 80)}${mem.content.length > 80 ? "…" : ""}"`,
          "",
        ];
        const structRelations = [];
        for (const r of relations) {
          const direction = r.fromId === fullId ? "outgoing" : "incoming";
          const otherId = direction === "outgoing" ? r.toId : r.fromId;
          const other = db.getById(otherId);
          const arrow = direction === "outgoing" ? `→ [${r.relationshipType}] →` : `← [${r.relationshipType}] ←`;
          lines.push(`  ${arrow} ${other?.content.slice(0, 60) ?? otherId.slice(0, 8)} (${(r.strength * 100).toFixed(0)}% strength)`);
          lines.push(`     relation id: ${r.id.slice(0, 8)}`);
          structRelations.push({
            relatedId: otherId,
            direction,
            type: r.relationshipType,
            strength: r.strength,
            content: other?.content,
          });
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: {
            action: "graph" as const,
            memoryId: fullId,
            relations: structRelations,
          },
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error managing relations: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );

  // ── memory_since ──────────────────────────────────────────
  server.registerTool(
    "memory_since",
    {
      title: "Temporal Memory Query",
      description: `Query memories by when they were created. Use this to answer "what did we decide last week?" or "what changed since yesterday?" or to find memories from a specific time window.

Natural language time expressions supported:
- "5m", "30m" — minutes ago
- "1h", "2h", "6h" — hours ago
- "1d", "7d", "30d" — days ago
- "1w", "2w" — weeks ago
- "1mo", "3mo" — months ago
- ISO 8601 timestamp — exact time (e.g. "2025-01-15T10:00:00Z")
- Unix millisecond timestamp

Args:
  - since (string): How far back to look — "7d", "1w", "2025-01-15", etc.
  - until (string, optional): End of time window — same format. Defaults to now.
  - type (enum, optional): Filter by memory type within this window`,
      inputSchema: z.object({
        since: z.string().min(1).describe("Start of time window — '7d', '2w', '1h', or ISO timestamp"),
        until: z.string().optional().describe("End of time window — defaults to now"),
        type: z.enum(TYPE_ORDER as [MemoryTypeValue, ...MemoryTypeValue[]]).optional().describe("Filter by memory type"),
      }).strict(),
      outputSchema: TemporalResultSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ since, until, type }) => {
      try {
        const parseTime = (s: string): number => {
          const now = Date.now();
          const match = s.match(/^(\d+)(m|min|h|d|w|mo)$/i);
          if (match) {
            const n = parseInt(match[1], 10);
            const unit = match[2].toLowerCase();
            const ms: Record<string, number> = { m: 60000, min: 60000, h: 3600000, d: 86400000, w: 604800000, mo: 2592000000 };
            return now - n * (ms[unit] ?? 86400000);
          }
          const parsed = Date.parse(s);
          if (!isNaN(parsed)) return parsed;
          const num = Number(s);
          if (!isNaN(num)) return num;
          throw new Error(`Cannot parse time expression: "${s}". Use formats like "7d", "2w", "1h", or an ISO date.`);
        };

        const fromTs = parseTime(since);
        const toTs = until ? parseTime(until) : Date.now();

        let memories = db.getMemoriesByDateRange(fromTs, toTs);
        if (type) memories = memories.filter(m => m.type === type);

        if (memories.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: `No memories found between ${new Date(fromTs).toISOString().slice(0, 10)} and ${new Date(toTs).toISOString().slice(0, 10)}${type ? ` of type "${type}"` : ""}.`,
            }],
            structuredContent: {
              from: new Date(fromTs).toISOString(),
              to: new Date(toTs).toISOString(),
              total: 0,
              memories: [],
            },
          };
        }

        const lines = [
          `Memories from ${new Date(fromTs).toISOString().slice(0, 10)} → ${new Date(toTs).toISOString().slice(0, 10)}`,
          type ? `Type filter: ${type}` : `All types`,
          `Found: ${memories.length}`,
          "",
        ];

        for (const m of memories) {
          lines.push(`[${m.type}] ${m.content.slice(0, 80)}${m.content.length > 80 ? "…" : ""}`);
          lines.push(`  Created: ${formatAge(m.createdAt)} | Confidence: ${(m.confidence * 100).toFixed(0)}% | ID: ${m.id.slice(0, 8)}`);
          if (m.tags.length > 0) lines.push(`  Tags: ${m.tags.join(", ")}`);
          lines.push("");
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n").trim() }],
          structuredContent: {
            from: new Date(fromTs).toISOString(),
            to: new Date(toTs).toISOString(),
            total: memories.length,
            memories: memories.map(m => ({
              id: m.id,
              content: m.content,
              type: m.type,
              confidence: m.confidence,
              createdAt: m.createdAt,
              age: formatAge(m.createdAt),
              tags: m.tags,
            })),
          },
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error in temporal query: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );

  // ── memory_search ─────────────────────────────────────────
  server.registerTool(
    "memory_search",
    {
      title: "Full-Text Memory Search",
      description: `Exact full-text search across all memory content and tags using SQLite FTS5. Complements memory_recall (which is semantic/fuzzy) with precise keyword matching.

Use this when:
- You need exact phrase matching ("never use any" not just "TypeScript types")
- Searching for a specific function name, file path, or technical term
- memory_recall returns too many loosely-related results
- You want to find all memories mentioning a specific tool, library, or concept

Supports FTS5 query syntax:
- Simple terms: "postgres"
- Phrase search: '"event sourcing"'
- Prefix search: "auth*"
- Boolean: "postgres OR sqlite"
- Negation: "database NOT redis"

Args:
  - query (string): Full-text search query — exact terms, phrases, or FTS5 syntax
  - limit (number): Max results (default: 20)`,
      inputSchema: z.object({
        query: z.string().min(1).describe("Full-text search query — exact terms, phrases, or FTS5 syntax"),
        limit: z.number().int().min(1).max(100).default(20).describe("Max results to return"),
      }).strict(),
      outputSchema: RecallResultSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query, limit }) => {
      try {
        const results = db.fullTextSearch(query, limit, project);

        if (results.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No memories found matching "${query}". Try memory_recall for semantic/fuzzy search.` }],
            structuredContent: { query, total: 0, memories: [] },
          };
        }

        const lines = [`Full-text search: "${query}" — ${results.length} result${results.length === 1 ? "" : "s"}`, ""];
        for (const m of results) {
          lines.push(`[${m.type}] ${m.content}`);
          lines.push(`  ID: ${m.id.slice(0, 8)} | Confidence: ${(m.confidence * 100).toFixed(0)}% | ${formatAge(m.lastAccessed)}`);
          if (m.tags.length > 0) lines.push(`  Tags: ${m.tags.join(", ")}`);
          lines.push("");
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n").trim() }],
          structuredContent: {
            query,
            total: results.length,
            memories: results.map(m => ({
              id: m.id,
              content: m.content,
              type: m.type,
              score: 1.0,
              confidence: m.confidence,
              tags: m.tags,
              age: formatAge(m.lastAccessed),
            })),
          },
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error in full-text search: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );
}

