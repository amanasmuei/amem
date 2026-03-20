import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AmemDatabase } from "./database.js";
import { MemoryType, type MemoryTypeValue, recallMemories, detectConflict } from "./memory.js";
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
        content: z.string().min(1, "Content is required").describe("The memory content — be specific and include context"),
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
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
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
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
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
                previewed: matches.slice(0, 5).map(m => ({ id: m.id.slice(0, 8), content: m.content })),
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
          content: z.string().min(1, "Content is required").describe("Specific, self-contained memory statement"),
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

        for (const input of memoryInputs) {
          const embedding = await generateEmbedding(input.content);

          // Check for duplicates/conflicts
          let isDuplicate = false;
          if (embedding) {
            const existing = db.getAllWithEmbeddings();
            for (const mem of existing) {
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
        const stats = db.getStats();
        const all = db.getAll();

        if (stats.total === 0) {
          return {
            content: [{ type: "text" as const, text: "No memories stored yet. Use memory_store or memory_extract to create memories." }],
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
        const all = db.getAll();

        if (all.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No memories to export. Use memory_store or memory_extract to create memories." }],
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
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
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
}
