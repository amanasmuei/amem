import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AmemDatabase } from "../database.js";
import { generateEmbedding } from "../embeddings.js";
import { VersionResultSchema } from "../schemas.js";
import { shortId, formatAge } from "./helpers.js";

export function registerVersionTools(server: McpServer, db: AmemDatabase, project: string): void {

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
        const fullId = db.resolveId(memory_id) ?? memory_id;

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
              content: [{ type: "text" as const, text: `Version "${restore_version_id}" not found in history for memory ${shortId(fullId)}.` }],
            };
          }

          db.patchMemory(fullId, { field: "content", value: target.content, reason: `restored from version ${shortId(target.versionId)}` });
          db.patchMemory(fullId, { field: "confidence", value: target.confidence, reason: `restored from version ${shortId(target.versionId)}` });

          const newEmbedding = await generateEmbedding(target.content);
          if (newEmbedding) db.updateEmbedding(fullId, newEmbedding);

          return {
            content: [{
              type: "text" as const,
              text: `Restored memory ${shortId(fullId)} to version ${shortId(target.versionId)}\nContent: "${target.content}"\nConfidence: ${(target.confidence * 100).toFixed(0)}%\nOriginal age: ${formatAge(target.editedAt)}`,
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
            content: [{ type: "text" as const, text: `No version history for memory ${shortId(fullId)}. Memories gain history after their first patch.` }],
            structuredContent: {
              action: "history" as const,
              memoryId: fullId,
              currentContent: mem.content,
              versions: [],
            },
          };
        }

        const lines = [
          `Version history for memory ${shortId(fullId)}`,
          `Current: "${mem.content}" (${(mem.confidence * 100).toFixed(0)}% confidence)`,
          "",
          `${history.length} version${history.length === 1 ? "" : "s"}:`,
          ...history.map((v, i) =>
            `  ${i + 1}. [${shortId(v.versionId)}] "${v.content}" — ${(v.confidence * 100).toFixed(0)}% — ${formatAge(v.editedAt)}\n     Reason: ${v.reason}`
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
}
