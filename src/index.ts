#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDatabase } from "./database.js";
import { registerTools, TYPE_ORDER } from "./tools.js";
import { MemoryType } from "./memory.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const AMEM_DIR = process.env.AMEM_DIR || path.join(os.homedir(), ".amem");
const DB_PATH = process.env.AMEM_DB || path.join(AMEM_DIR, "memory.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

function detectProject(): string {
  if (process.env.AMEM_PROJECT) return `project:${process.env.AMEM_PROJECT}`;
  try {
    let dir = process.cwd();
    while (dir !== path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, ".git"))) {
        return `project:${path.basename(dir)}`;
      }
      dir = path.dirname(dir);
    }
  } catch {}
  return "global";
}

const db = createDatabase(DB_PATH);
const currentProject = detectProject();

const server = new McpServer({
  name: "amem-mcp-server",
  version: pkg.version,
});

registerTools(server, db, currentProject);

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
- Exact file contents (just reference the path)

## Patching vs. Storing

- Memory mostly right but has a wrong detail → **memory_patch** (surgical, auto-versioned)
- Memory completely wrong → memory_forget then memory_store
- Always check with memory_search or memory_recall before creating a duplicate

## Building the Knowledge Graph

After storing decisions, link connected memories with memory_relate:
- Decision "supports" Pattern (why code is written a certain way)
- Correction "caused_by" Decision (why something is off-limits)
- Topology "depends_on" Topology (how modules relate)

## Lossless Log

For raw exchanges not yet ready to distill:
- Use memory_log to preserve turns verbatim (append-only, nothing lost)
- Search later with memory_log_recall and promote to proper memories`,
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

1. Call memory_inject with the likely topic — this surfaces corrections (hard constraints) and decisions first
2. Call memory_context for broader preferences, patterns, and topology
3. Apply corrections as absolute constraints — they override everything else
4. Reference memories naturally: "I remember you prefer X" not "According to my memory database..."
5. If continuing previous work, call memory_log_recall with the session ID or a keyword to replay raw history

## Tool Quick Reference

| Goal | Tool |
|------|------|
| Load context for a task | memory_inject, memory_context |
| Find something specific | memory_recall (semantic), memory_search (exact) |
| Store a new memory | memory_store or memory_extract (batch) |
| Fix an existing memory | memory_patch (surgical, versioned) |
| See what changed | memory_since "7d" |
| Preserve raw conversation | memory_log |
| Replay a past session | memory_log_recall |
| Link related memories | memory_relate |
| View edit history | memory_versions |
| Clean up the database | memory_consolidate |`,
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

server.registerResource(
  "log-recent",
  "amem://log/recent",
  { mimeType: "text/plain", description: "Recent raw conversation log entries — lossless, append-only history" },
  () => {
    const entries = db.getRecentLog(50, currentProject);
    if (entries.length === 0) {
      return { contents: [{ uri: "amem://log/recent", mimeType: "text/plain", text: "No log entries yet. Use memory_log to preserve conversation turns." }] };
    }
    const lines = [`# Recent Conversation Log (${entries.length} entries)\n`];
    for (const e of entries) {
      const ts = new Date(e.timestamp).toISOString().slice(0, 16).replace("T", " ");
      lines.push(`[${ts}] ${e.role.toUpperCase()} (session: ${e.sessionId.slice(0, 8)})`);
      lines.push(e.content.length > 200 ? e.content.slice(0, 200) + "…" : e.content);
      lines.push("");
    }
    return { contents: [{ uri: "amem://log/recent", mimeType: "text/plain", text: lines.join("\n") }] };
  },
);

server.registerResource(
  "graph-overview",
  "amem://graph",
  { mimeType: "text/plain", description: "Knowledge graph overview — all explicit memory relationships" },
  () => {
    const all = db.getAll();
    const lines = [`# Knowledge Graph (${all.length} nodes)\n`];
    let edgeCount = 0;
    for (const mem of all) {
      const relations = db.getRelations(mem.id);
      const outgoing = relations.filter(r => r.fromId === mem.id);
      if (outgoing.length > 0) {
        lines.push(`[${mem.id.slice(0, 8)}] "${mem.content.slice(0, 60)}"`);
        for (const r of outgoing) {
          const target = db.getById(r.toId);
          lines.push(`  → [${r.relationshipType}] "${target?.content.slice(0, 50) ?? r.toId.slice(0, 8)}"`);
          edgeCount++;
        }
        lines.push("");
      }
    }
    if (edgeCount === 0) {
      return { contents: [{ uri: "amem://graph", mimeType: "text/plain", text: "No memory relations yet. Use memory_relate to build the knowledge graph." }] };
    }
    lines.unshift(`${edgeCount} edges\n`);
    return { contents: [{ uri: "amem://graph", mimeType: "text/plain", text: lines.join("\n") }] };
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

console.error(`Amem running. DB: ${DB_PATH} | Project: ${currentProject}`);
