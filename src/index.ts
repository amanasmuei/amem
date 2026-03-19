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

// Register MCP prompts — these teach AI clients how to use Engram effectively
server.prompt(
  "extraction-guide",
  "Guidelines for what to extract from conversations into Engram memory",
  () => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `You have access to Engram, a persistent memory system. Use it to remember important information across conversations.

## What to Extract

Watch for these during conversation and extract them using memory_extract:

| Signal | Type | Confidence | Example |
|--------|------|------------|---------|
| User corrects you | correction | 1.0 | "Don't mock the DB in integration tests" |
| Architecture/design choice made | decision | 0.9 | "Chose event sourcing for audit trail" |
| User shows preferred coding style | pattern | 0.7 | "Prefers early returns over nested ifs" |
| Tool or workflow preference expressed | preference | 0.8 | "Uses pnpm, not npm" |
| Codebase location revealed | topology | 0.7 | "Auth module is in src/auth/" |
| Project fact established | fact | 0.6 | "API uses REST, not GraphQL" |

## When to Extract

- After every ~10 exchanges
- After any significant decision or correction
- Before the conversation ends
- When you notice something the user would want remembered

## How to Extract

Call memory_extract with an array of memories. Each memory should be:
- **Self-contained**: Understandable without conversation context
- **Specific**: "Uses Tailwind with custom theme" not "Has a CSS framework"
- **Actionable**: Useful for future coding decisions

## What NOT to Extract

- Ephemeral task details ("currently debugging X")
- Things obvious from the code itself
- Sensitive data (API keys, passwords)
- Exact file contents (just reference the path)`,
      },
    }],
  }),
);

server.prompt(
  "session-start",
  "Load relevant context at the start of a conversation",
  () => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `You have access to Engram memory. At the start of this conversation:

1. Call memory_context with the likely topic (based on what the user asks about)
2. Use any corrections as hard constraints — they override other context
3. Use decisions and patterns to inform your approach
4. Mention relevant memories naturally: "I remember you prefer X" not "According to my memory database..."

If the user seems to be continuing previous work, call memory_recall to find relevant history.`,
      },
    }],
  }),
);

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
