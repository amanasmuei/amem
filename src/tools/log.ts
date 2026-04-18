import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type AmemDatabase, LogAppendResultSchema, LogRecallResultSchema, LogCleanupResultSchema, shortId, formatAge } from "@aman_asmuei/amem-core";

export function registerLogTools(server: McpServer, db: AmemDatabase, project: string): void {

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
            text: `Logged ${role} turn (${shortId(id)}) to session "${session_id}". Content length: ${content.length} chars.`,
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
      }).strict(),
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
            lines.push(`[${shortId(e.id)}] ${formatAge(e.timestamp)} | ${e.role} | session:${shortId(e.sessionId)}`);
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

  // ── memory_log_cleanup ───────────────────────────────────
  server.registerTool(
    "memory_log_cleanup",
    {
      title: "Clean Up Conversation Log",
      description: `Delete old conversation log entries to keep the database lean. The conversation log is append-only and grows without bound — use this periodically to prune entries older than a given retention period.

Args:
  - older_than_days (number): Delete log entries older than this many days (default: 90)
  - confirm (boolean): Must be true to actually delete (default: false — preview only)

Returns:
  Number of entries deleted and remaining.`,
      inputSchema: z.object({
        older_than_days: z.number().int().min(1).default(90).describe("Delete entries older than this many days"),
        confirm: z.boolean().default(false).describe("false = preview (safe), true = execute deletion"),
      }).strict(),
      outputSchema: LogCleanupResultSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ older_than_days, confirm }) => {
      try {
        const cutoff = Date.now() - older_than_days * 24 * 60 * 60 * 1000;
        const cutoffDate = new Date(cutoff).toISOString().slice(0, 10);
        const totalBefore = db.getLogCount();

        if (!confirm) {
          // Preview: count how many would be deleted
          const recent = db.getRecentLog(totalBefore);
          const wouldDelete = recent.filter(e => e.timestamp < cutoff).length;
          return {
            content: [{
              type: "text" as const,
              text: `Preview: ${wouldDelete} log entries older than ${older_than_days} days (before ${cutoffDate}) would be deleted.\n${totalBefore - wouldDelete} entries would remain.\n\nCall again with confirm=true to execute.`,
            }],
            structuredContent: {
              deleted: wouldDelete,
              remaining: totalBefore - wouldDelete,
              cutoffDate,
            },
          };
        }

        const deleted = db.deleteLogBefore(cutoff);
        const remaining = db.getLogCount();

        return {
          content: [{
            type: "text" as const,
            text: `Deleted ${deleted} log entries older than ${older_than_days} days (before ${cutoffDate}). ${remaining} entries remaining.`,
          }],
          structuredContent: {
            deleted,
            remaining,
            cutoffDate,
          },
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error cleaning up log: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );
}
