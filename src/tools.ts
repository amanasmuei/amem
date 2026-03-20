import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AmemDatabase } from "./database.js";
import { MemoryType, type MemoryTypeValue, recallMemories, detectConflict } from "./memory.js";
import { generateEmbedding, cosineSimilarity } from "./embeddings.js";

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

export function registerTools(server: McpServer, db: AmemDatabase): void {

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
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ content, type, tags, confidence, source }) => {
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
              };
            }
            if (sim > 0.8) {
              db.updateConfidence(mem.id, Math.min(1.0, mem.confidence + 0.1));
            }
          }

          const id = db.insertMemory({ content, type: type as MemoryTypeValue, tags, confidence, source, embedding });

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
          };
        }

        // No embeddings available — store directly
        const id = db.insertMemory({ content, type: type as MemoryTypeValue, tags, confidence, source, embedding });
        const stats = db.getStats();
        return {
          content: [{
            type: "text" as const,
            text: `Stored ${type} memory (${id.slice(0, 8)}). Confidence: ${confidence}. Tags: [${tags.join(", ")}]. Total memories: ${stats.total}.`,
          }],
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
        });

        for (const r of results) {
          db.touchAccess(r.id);
        }

        if (results.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No memories found for: "${query}". Try broadening your search or using different keywords.` }],
          };
        }

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

        return {
          content: [{ type: "text" as const, text: output.trim() }],
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
          };
        }

        if (query) {
          const queryEmbedding = await generateEmbedding(query);
          const matches = recallMemories(db, { query, queryEmbedding, limit: 20, minConfidence: 0 });

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
            };
          }

          for (const m of matches) db.deleteMemory(m.id);
          return {
            content: [{ type: "text" as const, text: `Deleted ${matches.length} memories matching "${query}".` }],
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
            });
            stored++;
            details.push(`  + Stored [${input.type}]: "${input.content}" (${id.slice(0, 8)})`);
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
        if (md.length > CHARACTER_LIMIT) {
          md = md.slice(0, CHARACTER_LIMIT);
          md += `\n\n---\n*Output truncated at ${CHARACTER_LIMIT} characters. Use memory_recall with filters to view specific memories.*`;
        }

        return {
          content: [{ type: "text" as const, text: md.trim() }],
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
}
