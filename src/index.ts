#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDatabase } from "./database.js";
import { registerTools } from "./tools.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const ENGRAM_DIR = process.env.ENGRAM_DIR || path.join(os.homedir(), ".engram");
const DB_PATH = process.env.ENGRAM_DB || path.join(ENGRAM_DIR, "memory.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = createDatabase(DB_PATH);

const server = new McpServer({
  name: "engram",
  version: "0.1.0",
});

registerTools(server, db);

process.on("SIGINT", () => {
  db.close();
  process.exit(0);
});
process.on("SIGTERM", () => {
  db.close();
  process.exit(0);
});

const transport = new StdioServerTransport();
await server.connect(transport);

console.error("Engram running. DB: " + DB_PATH);
