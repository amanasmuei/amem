import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AmemDatabase } from "../database.js";
import { shortId } from "./helpers.js";

export function registerReminderTools(server: McpServer, db: AmemDatabase): void {

  // ── reminder_set ─────────────────────────────────────────
  server.registerTool(
    "reminder_set",
    {
      title: "Set Reminder",
      description: `Create a reminder with optional due date.

Args:
  - content (string): What to be reminded about
  - due_at (number, optional): Unix timestamp (ms) for when the reminder is due
  - scope (string): Scope for the reminder — 'global' or project-specific (default: 'global')

Returns:
  Confirmation with reminder ID.`,
      inputSchema: z.object({
        content: z.string().min(1).describe("What to be reminded about"),
        due_at: z.number().optional().describe("Unix timestamp (ms) for when the reminder is due"),
        scope: z.string().default("global").describe("Scope for the reminder — 'global' or project-specific"),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ content, due_at, scope }) => {
      try {
        const id = db.insertReminder(content, due_at ?? null, scope);
        const dueStr = due_at ? ` (due: ${new Date(due_at).toISOString()})` : "";
        return {
          content: [{
            type: "text" as const,
            text: `Reminder set: "${content}"${dueStr}\nID: ${id}`,
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error setting reminder: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );

  // ── reminder_list ────────────────────────────────────────
  server.registerTool(
    "reminder_list",
    {
      title: "List Reminders",
      description: `List reminders, optionally including completed ones.

Args:
  - include_completed (boolean): Whether to include completed reminders (default: false)
  - scope (string, optional): Filter by scope — returns global + scope-matching reminders

Returns:
  List of reminders with their status.`,
      inputSchema: z.object({
        include_completed: z.boolean().default(false).describe("Whether to include completed reminders"),
        scope: z.string().optional().describe("Filter by scope — returns global + scope-matching reminders"),
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ include_completed, scope }) => {
      try {
        const reminders = db.listReminders(include_completed, scope);

        if (reminders.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No reminders found." }],
          };
        }

        const lines: string[] = [`${reminders.length} reminder${reminders.length === 1 ? "" : "s"}:`, ""];
        for (const r of reminders) {
          const dueStr = r.dueAt ? new Date(r.dueAt).toISOString() : "no due date";
          const status = r.completed ? "[DONE]" : "[pending]";
          lines.push(`${status} ${r.content}`);
          lines.push(`  ID: ${shortId(r.id)} | Due: ${dueStr} | Scope: ${r.scope}`);
          lines.push("");
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n").trim() }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error listing reminders: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );

  // ── reminder_check ───────────────────────────────────────
  server.registerTool(
    "reminder_check",
    {
      title: "Check Reminders",
      description: `Check for overdue, today's, and upcoming reminders (within 7 days). Use this proactively at the start of sessions.

Args: None

Returns:
  List of actionable reminders with [OVERDUE], [TODAY], or [upcoming] prefixes.`,
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
        const reminders = db.checkReminders();

        if (reminders.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No overdue, today, or upcoming reminders." }],
          };
        }

        const lines: string[] = [`${reminders.length} actionable reminder${reminders.length === 1 ? "" : "s"}:`, ""];
        for (const r of reminders) {
          const prefix = r.status === "overdue" ? "[OVERDUE]" : r.status === "today" ? "[TODAY]" : "[upcoming]";
          const dueStr = r.dueAt ? new Date(r.dueAt).toISOString() : "no due date";
          lines.push(`${prefix} ${r.content}`);
          lines.push(`  ID: ${shortId(r.id)} | Due: ${dueStr} | Scope: ${r.scope}`);
          lines.push("");
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n").trim() }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error checking reminders: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );

  // ── reminder_complete ────────────────────────────────────
  server.registerTool(
    "reminder_complete",
    {
      title: "Complete Reminder",
      description: `Mark a reminder as completed. Supports partial ID matching (first 8 characters).

Args:
  - id (string): Full or partial reminder ID

Returns:
  Confirmation that the reminder was completed.`,
      inputSchema: z.object({
        id: z.string().min(1).describe("Full or partial reminder ID"),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ id }) => {
      try {
        // Try exact match first
        if (db.completeReminder(id)) {
          return {
            content: [{ type: "text" as const, text: `Reminder ${shortId(id)} marked as completed.` }],
          };
        }

        // Try partial ID match via SQL prefix
        const fullId = db.resolveReminderId(id);
        if (!fullId) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: `No reminder found matching ID "${id}".` }],
          };
        }

        db.completeReminder(fullId);
        const reminder = db.listReminders(true).find(r => r.id === fullId);
        return {
          content: [{ type: "text" as const, text: `Reminder ${shortId(fullId)} marked as completed${reminder ? `: "${reminder.content}"` : ""}.` }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error completing reminder: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );
}
