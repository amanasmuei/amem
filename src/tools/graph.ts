import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AmemDatabase } from "../database.js";
import type { MemoryTypeValue } from "../memory.js";
import { RecallResultSchema, TemporalResultSchema } from "../schemas.js";
import { TYPE_ORDER, shortId, formatAge } from "./helpers.js";

export function registerGraphTools(server: McpServer, db: AmemDatabase, project: string): void {

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
      // outputSchema omitted — z.union() causes _zod serialization errors in MCP SDK
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
          const fromFull = db.resolveId(from_id) ?? from_id;
          const toFull = db.resolveId(to_id) ?? to_id;
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
              text: `Linked memories:\n  "${fromMem.content.slice(0, 60)}"\n  ${relation_type} →\n  "${toMem.content.slice(0, 60)}"\nRelation ID: ${shortId(relId)}`,
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
            content: [{ type: "text" as const, text: `Removed relation ${shortId(relation_id)}.` }],
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
        const fullId = db.resolveId(memory_id) ?? memory_id;
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
              text: `Memory ${shortId(fullId)} has no explicit relations yet.\n\nUse action:relate to build the knowledge graph.`,
            }],
            structuredContent: { action: "graph" as const, memoryId: fullId, relations: [] },
          };
        }

        const lines = [
          `Knowledge graph for memory ${shortId(fullId)}:`,
          `"${mem.content.slice(0, 80)}${mem.content.length > 80 ? "…" : ""}"`,
          "",
        ];
        const structRelations = [];
        for (const r of relations) {
          const direction = r.fromId === fullId ? "outgoing" : "incoming";
          const otherId = direction === "outgoing" ? r.toId : r.fromId;
          const other = db.getById(otherId);
          const arrow = direction === "outgoing" ? `→ [${r.relationshipType}] →` : `← [${r.relationshipType}] ←`;
          lines.push(`  ${arrow} ${other?.content.slice(0, 60) ?? shortId(otherId)} (${(r.strength * 100).toFixed(0)}% strength)`);
          lines.push(`     relation id: ${shortId(r.id)}`);
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
          lines.push(`  Created: ${formatAge(m.createdAt)} | Confidence: ${(m.confidence * 100).toFixed(0)}% | ID: ${shortId(m.id)}`);
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
          lines.push(`  ID: ${shortId(m.id)} | Confidence: ${(m.confidence * 100).toFixed(0)}% | ${formatAge(m.lastAccessed)}`);
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
