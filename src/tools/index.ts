import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AmemDatabase } from "../database.js";
import type { MemoryTypeValue } from "../memory.js";
import { registerMemoryTools } from "./memory.js";
import { registerVersionTools } from "./versions.js";
import { registerLogTools } from "./log.js";
import { registerGraphTools } from "./graph.js";
import { registerReminderTools } from "./reminders.js";

// Re-export helpers for external consumers
export { TYPE_ORDER, formatAge, shortId, SHORT_ID_LENGTH, CHARACTER_LIMIT } from "./helpers.js";

export function registerTools(server: McpServer, db: AmemDatabase, project: string): void {
  const GLOBAL_TYPES: MemoryTypeValue[] = ["correction", "preference", "pattern"];
  function autoScope(type: MemoryTypeValue): string {
    return GLOBAL_TYPES.includes(type) ? "global" : project;
  }

  registerMemoryTools(server, db, project, autoScope);
  registerVersionTools(server, db, project);
  registerLogTools(server, db, project);
  registerGraphTools(server, db, project);
  registerReminderTools(server, db);
}
