#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDatabase } from "./database.js";
import { registerTools, TYPE_ORDER } from "./tools.js";
import { MemoryType } from "./memory.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const AMEM_DIR = process.env.AMEM_DIR || path.join(os.homedir(), ".amem");
const DB_PATH = process.env.AMEM_DB || path.join(AMEM_DIR, "memory.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = createDatabase(DB_PATH);

const server = new McpServer({
  name: "amem-mcp-server",
  version: "0.2.0",
});

registerTools(server, db);

// Register MCP prompts — these teach AI clients how to use Amem effectively
server.registerPrompt(
  "extraction-guide",
  {
    description: "Guidelines for what to extract from conversations into Amem memory",
  },
  () => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `You have access to Amem, a persistent memory system. Use it to remember important information across conversations.

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

server.registerPrompt(
  "session-start",
  {
    description: "Load relevant context at the start of a conversation",
  },
  () => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `You have access to Amem memory. At the start of this conversation:

1. Call memory_context with the likely topic (based on what the user asks about)
2. Use any corrections as hard constraints — they override other context
3. Use decisions and patterns to inform your approach
4. Mention relevant memories naturally: "I remember you prefer X" not "According to my memory database..."

If the user seems to be continuing previous work, call memory_recall to find relevant history.`,
      },
    }],
  }),
);

// Register MCP resources — proactive context that clients can read automatically
server.registerResource(
  "corrections",
  "amem://corrections",
  { mimeType: "text/plain", description: "All active corrections — hard constraints that should always be followed" },
  () => {
    const corrections = db.searchByType(MemoryType.CORRECTION);
    if (corrections.length === 0) {
      return { contents: [{ uri: "amem://corrections", mimeType: "text/plain", text: "No corrections stored." }] };
    }
    const text = corrections
      .sort((a, b) => b.confidence - a.confidence)
      .map(c => `- ${c.content} (${(c.confidence * 100).toFixed(0)}% confidence)`)
      .join("\n");
    return {
      contents: [{ uri: "amem://corrections", mimeType: "text/plain", text: `# Corrections (${corrections.length})\n\n${text}` }],
    };
  },
);

server.registerResource(
  "decisions",
  "amem://decisions",
  { mimeType: "text/plain", description: "Active architectural decisions and their rationale" },
  () => {
    const decisions = db.searchByType(MemoryType.DECISION);
    if (decisions.length === 0) {
      return { contents: [{ uri: "amem://decisions", mimeType: "text/plain", text: "No decisions stored." }] };
    }
    const text = decisions
      .sort((a, b) => b.confidence - a.confidence)
      .map(d => `- ${d.content} (${(d.confidence * 100).toFixed(0)}% confidence)`)
      .join("\n");
    return {
      contents: [{ uri: "amem://decisions", mimeType: "text/plain", text: `# Decisions (${decisions.length})\n\n${text}` }],
    };
  },
);

server.registerResource(
  "profile",
  "amem://profile",
  { mimeType: "text/plain", description: "Developer profile — preferences, patterns, and tool choices" },
  () => {
    const preferences = db.searchByType(MemoryType.PREFERENCE);
    const patterns = db.searchByType(MemoryType.PATTERN);
    const all = [...preferences, ...patterns].sort((a, b) => b.confidence - a.confidence);
    if (all.length === 0) {
      return { contents: [{ uri: "amem://profile", mimeType: "text/plain", text: "No profile data stored." }] };
    }
    const prefText = preferences.length > 0
      ? "## Preferences\n\n" + preferences.map(p => `- ${p.content}`).join("\n")
      : "";
    const patText = patterns.length > 0
      ? "## Patterns\n\n" + patterns.map(p => `- ${p.content}`).join("\n")
      : "";
    return {
      contents: [{ uri: "amem://profile", mimeType: "text/plain", text: [prefText, patText].filter(Boolean).join("\n\n") }],
    };
  },
);

server.registerResource(
  "summary",
  "amem://summary",
  { mimeType: "text/plain", description: "Quick summary of all stored memories" },
  () => {
    const stats = db.getStats();
    if (stats.total === 0) {
      return { contents: [{ uri: "amem://summary", mimeType: "text/plain", text: "No memories stored yet." }] };
    }
    const lines = TYPE_ORDER
      .filter(t => (stats.byType[t] || 0) > 0)
      .map(t => `  ${t}: ${stats.byType[t]}`);
    const text = `Amem: ${stats.total} memories\n\n${lines.join("\n")}`;
    return {
      contents: [{ uri: "amem://summary", mimeType: "text/plain", text }],
    };
  },
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

console.error("Amem running. DB: " + DB_PATH);
