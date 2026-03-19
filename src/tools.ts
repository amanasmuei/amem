import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { EngramDatabase } from "./database.js";
import { MemoryType, type MemoryTypeValue, IMPORTANCE_WEIGHTS, recallMemories, detectConflict } from "./memory.js";
import { generateEmbedding, cosineSimilarity } from "./embeddings.js";

const MEMORY_TYPES = Object.values(MemoryType);

export function registerTools(server: McpServer, db: EngramDatabase): void {

  // ── memory_store ──────────────────────────────────────────
  server.registerTool(
    "memory_store",
    {
      title: "Store Memory",
      description: "Store a developer memory. Types: correction (highest priority), decision (architectural choice + rationale), pattern (coding style/habit), preference (tool/style preference), topology (where things are in the codebase), fact (general knowledge). Always include tags for better recall.",
      inputSchema: z.object({
        content: z.string().describe("The memory content — be specific and include context"),
        type: z.enum(MEMORY_TYPES as [string, ...string[]]).describe("Memory type — corrections are highest priority"),
        tags: z.array(z.string()).default([]).describe("Tags for filtering (e.g., ['typescript', 'auth', 'testing'])"),
        confidence: z.number().min(0).max(1).default(0.8).describe("How confident is this memory (0-1). Corrections from user = 1.0"),
        source: z.string().default("conversation").describe("Where this memory came from"),
      }),
    },
    async ({ content, type, tags, confidence, source }) => {
      const embedding = await generateEmbedding(content);

      let conflictWarning = "";
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
      }

      const id = db.insertMemory({
        content,
        type: type as MemoryTypeValue,
        tags,
        confidence,
        source,
        embedding,
      });

      const stats = db.getStats();
      return {
        content: [{
          type: "text" as const,
          text: `Stored ${type} memory (${id.slice(0, 8)}). Confidence: ${confidence}. Tags: [${tags.join(", ")}]. Total memories: ${stats.total}.`,
        }],
      };
    },
  );

  // ── memory_recall ─────────────────────────────────────────
  server.registerTool(
    "memory_recall",
    {
      title: "Recall Memories",
      description: "Search memories semantically. Returns the most relevant memories ranked by relevance, recency, confidence, and importance. Use this when you need to remember something about the user, project, or past decisions.",
      inputSchema: z.object({
        query: z.string().describe("What to search for — natural language works best"),
        limit: z.number().min(1).max(50).default(10).describe("Max results to return"),
        type: z.enum(MEMORY_TYPES as [string, ...string[]]).optional().describe("Filter by memory type"),
        tag: z.string().optional().describe("Filter by tag"),
        min_confidence: z.number().min(0).max(1).optional().describe("Minimum confidence threshold"),
      }),
    },
    async ({ query, limit, type, tag, min_confidence }) => {
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
          content: [{ type: "text" as const, text: `No memories found for: "${query}"` }],
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
    },
  );

  // ── memory_context ────────────────────────────────────────
  server.registerTool(
    "memory_context",
    {
      title: "Get Memory Context",
      description: "Get all relevant context for a topic — combines memories across types to build a complete picture. Use at the start of a task to load relevant background. Returns corrections first (they override other context).",
      inputSchema: z.object({
        topic: z.string().describe("The topic or task you need context for"),
        max_tokens: z.number().default(2000).describe("Approximate token budget for context"),
      }),
    },
    async ({ topic, max_tokens }) => {
      const queryEmbedding = await generateEmbedding(topic);

      const results = recallMemories(db, {
        query: topic,
        queryEmbedding,
        limit: 50,
      });

      if (results.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No context found for: "${topic}"` }],
        };
      }

      const grouped: Record<string, typeof results> = {};
      const typeOrder: MemoryTypeValue[] = ["correction", "decision", "pattern", "preference", "topology", "fact"];

      for (const r of results) {
        if (!grouped[r.type]) grouped[r.type] = [];
        grouped[r.type].push(r);
      }

      let output = `## Context for: ${topic}\n\n`;
      let approxTokens = 0;
      const CHARS_PER_TOKEN = 4;

      for (const t of typeOrder) {
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
    },
  );

  // ── memory_forget ─────────────────────────────────────────
  server.registerTool(
    "memory_forget",
    {
      title: "Forget Memory",
      description: "Delete a specific memory by ID, or delete all memories matching a query. Use when information is outdated, wrong, or the user explicitly asks to forget something.",
      inputSchema: z.object({
        id: z.string().optional().describe("Specific memory ID to delete"),
        query: z.string().optional().describe("Delete all memories matching this query (requires confirmation)"),
        confirm: z.boolean().default(false).describe("Must be true to actually delete when using query-based deletion"),
      }),
    },
    async ({ id, query, confirm }) => {
      if (id) {
        const memory = db.getById(id);
        if (!memory) {
          return { content: [{ type: "text" as const, text: `Memory ${id} not found.` }] };
        }
        db.deleteMemory(id);
        return {
          content: [{ type: "text" as const, text: `Deleted memory: "${memory.content}" (${memory.type})` }],
        };
      }

      if (query) {
        const queryEmbedding = await generateEmbedding(query);
        const matches = recallMemories(db, { query, queryEmbedding, limit: 20, minConfidence: 0 });

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
        content: [{ type: "text" as const, text: "Provide either an id or a query to delete memories." }],
      };
    },
  );
}

function formatAge(timestamp: number): string {
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
