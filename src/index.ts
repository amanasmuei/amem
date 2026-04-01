#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDatabase } from "./database.js";
import { registerTools, TYPE_ORDER } from "./tools/index.js";
import { MemoryType } from "./memory.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const AMEM_DIR = process.env.AMEM_DIR || path.join(os.homedir(), ".amem");
const DB_PATH = process.env.AMEM_DB || path.join(AMEM_DIR, "memory.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true, mode: 0o700 });

// Set restrictive permissions on DB file after creation (owner-only read/write)
function ensureSecurePermissions(filePath: string): void {
  try {
    if (fs.existsSync(filePath) && process.platform !== "win32") {
      fs.chmodSync(filePath, 0o600);
    }
  } catch {}
}

// Automatic backup: keep last 3 backups of the DB before server starts
function backupDatabase(dbPath: string): void {
  try {
    if (!fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0) return;
    const backupDir = path.join(path.dirname(dbPath), "backups");
    fs.mkdirSync(backupDir, { recursive: true });

    const backupPath = path.join(backupDir, `memory-${Date.now()}.db`);
    fs.copyFileSync(dbPath, backupPath);

    // Keep only the 3 most recent backups
    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith("memory-") && f.endsWith(".db"))
      .sort()
      .reverse();
    for (const old of backups.slice(3)) {
      fs.unlinkSync(path.join(backupDir, old));
    }
  } catch (error) {
    console.error("[amem] Backup failed:", error instanceof Error ? error.message : String(error));
  }
}

backupDatabase(DB_PATH);

function detectProject(): string {
  if (process.env.AMEM_PROJECT) return `project:${process.env.AMEM_PROJECT}`;
  try {
    let dir = process.cwd();
    while (dir !== path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, ".git"))) {
        // Use full path to avoid collisions between repos with the same basename
        return `project:${dir}`;
      }
      dir = path.dirname(dir);
    }
  } catch {}
  return "global";
}

const db = createDatabase(DB_PATH);
ensureSecurePermissions(DB_PATH);
const currentProject = detectProject();

// Pre-warm embeddings in the background so first query is fast
import { preloadEmbeddings, generateEmbedding } from "./embeddings.js";
preloadEmbeddings();

// Background task: generate embeddings for memories that don't have them yet
async function backfillEmbeddings(): Promise<void> {
  try {
    const all = db.getAll();
    const missing = all.filter(m => !m.embedding);
    if (missing.length === 0) return;
    let filled = 0;
    for (const mem of missing.slice(0, 50)) { // Process up to 50 per startup
      const emb = await generateEmbedding(mem.content);
      if (emb) {
        db.updateEmbedding(mem.id, emb);
        filled++;
      } else {
        break; // Embeddings not available
      }
    }
    if (filled > 0) {
      console.error(`[amem] Backfilled embeddings for ${filled} memories`);
    }
  } catch {}
}
// Run after a short delay to not block startup
setTimeout(() => { backfillEmbeddings().catch(() => {}); }, 3000);

// Build ANN index after embeddings are loaded
import { buildANNIndex } from "./memory.js";
setTimeout(() => {
  try {
    const index = buildANNIndex(db);
    console.error(`[amem] ANN index built: ${index.size()} vectors`);
  } catch {}
}, 5000);

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
- Sensitive data (API keys, passwords) — these are auto-redacted but avoid storing them
- Exact file contents (just reference the path)

## Privacy

- Wrap sensitive text in \`<private>...</private>\` tags — it will be stripped before storage
- API keys, tokens, and passwords are auto-redacted by pattern matching
- Never store credentials even if the user provides them

## Temporal Validity

When a fact or decision changes:
- Use **memory_expire** to mark the old memory as no longer valid (preserved for history)
- Store the new memory — contradictions are auto-detected and old versions auto-expired
- Don't delete old memories — expiry preserves the timeline for "what was true when?"

## Memory Tiers

Promote critical memories to higher tiers:
- **core** — Always injected at session start. Only the most important corrections/decisions (~500 tokens max)
- **working** — Session-scoped context, auto-surfaced for the current task
- **archival** — Default. Searchable but not auto-injected
Use memory_tier to move memories between tiers.

## Patching vs. Storing

- Memory mostly right but has a wrong detail → **memory_patch** (surgical, auto-versioned)
- Memory completely wrong → memory_forget then memory_store
- Memory outdated → **memory_expire** (preserves history) then memory_store
- Always check with memory_search or memory_recall before creating a duplicate

## Building the Knowledge Graph

After storing decisions, link connected memories with memory_relate:
- Decision "supports" Pattern (why code is written a certain way)
- Correction "caused_by" Decision (why something is off-limits)
- Topology "depends_on" Topology (how modules relate)

## Advanced Recall

- **memory_recall** — Fast semantic search (default)
- **memory_multi_recall** — Combines 4 strategies: semantic + FTS + graph traversal + temporal. Use when standard recall misses something.
- **memory_search** — Exact full-text keyword matching

## Session Management

- Use memory_log to preserve turns verbatim (append-only, nothing lost)
- At session end, call **memory_summarize** with key decisions, corrections, and a summary
- Use **memory_history** to review past session summaries`,
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

1. Call **memory_inject** with the likely topic — surfaces corrections (hard constraints) and decisions first
2. Call **reminder_check** — shows overdue and upcoming reminders
3. Check **core tier** memories with memory_tier action:list tier:core — these are always-on context
4. Call memory_context for broader preferences, patterns, and topology
5. Apply corrections as absolute constraints — they override everything else
6. Reference memories naturally: "I remember you prefer X" not "According to my memory database..."
7. If continuing previous work, call memory_log_recall or memory_history to review past sessions

## Working with Claude Code Auto-Memory

You may have two memory sources active:
1. **Claude auto-memory** — flat markdown file, one consolidated overview, auto-captured
2. **amem** — structured, typed, scored, searchable, temporal, versioned

How to handle both:
- **amem is authoritative** — it has timestamps, versioning, and confidence scores. When they conflict, trust amem.
- **Don't duplicate** — if something is already in amem (via sync or manual storage), don't re-store it from auto-memory
- **Use amem for recall** — memory_recall and memory_multi_recall are more precise than loading the entire auto-memory file
- **Let auto-memory handle the broad picture** — it's good for general project overview
- **Use amem for specifics** — corrections, decisions, patterns, and anything that needs to be scored, searched, or expired
- Use \`amem-cli sync\` to import Claude auto-memory into amem for unified access

## Tool Quick Reference

| Goal | Tool |
|------|------|
| Load context for a task | memory_inject, memory_context |
| Find something specific | memory_recall (semantic), memory_search (exact) |
| Deep search (4 strategies) | memory_multi_recall |
| Store a new memory | memory_store or memory_extract (batch) |
| Fix an existing memory | memory_patch (surgical, versioned) |
| Mark as outdated | memory_expire (preserves history) |
| Manage priority | memory_tier (core/working/archival) |
| See what changed | memory_since "7d" |
| Preserve raw conversation | memory_log |
| Summarize a session | memory_summarize |
| Review past sessions | memory_history |
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
    try {
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
    } catch (error) {
      console.error("[amem] Resource 'corrections' failed:", error instanceof Error ? error.message : String(error));
      return { contents: [{ uri: "amem://corrections", mimeType: "text/plain", text: "Error loading corrections." }] };
    }
  },
);

server.registerResource(
  "decisions",
  "amem://decisions",
  { mimeType: "text/plain", description: "Active architectural decisions and their rationale" },
  () => {
    try {
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
    } catch (error) {
      console.error("[amem] Resource 'decisions' failed:", error instanceof Error ? error.message : String(error));
      return { contents: [{ uri: "amem://decisions", mimeType: "text/plain", text: "Error loading decisions." }] };
    }
  },
);

server.registerResource(
  "profile",
  "amem://profile",
  { mimeType: "text/plain", description: "Developer profile — preferences, patterns, and tool choices" },
  () => {
    try {
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
    } catch (error) {
      console.error("[amem] Resource 'profile' failed:", error instanceof Error ? error.message : String(error));
      return { contents: [{ uri: "amem://profile", mimeType: "text/plain", text: "Error loading profile." }] };
    }
  },
);

server.registerResource(
  "summary",
  "amem://summary",
  { mimeType: "text/plain", description: "Quick summary of all stored memories" },
  () => {
    try {
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
    } catch (error) {
      console.error("[amem] Resource 'summary' failed:", error instanceof Error ? error.message : String(error));
      return { contents: [{ uri: "amem://summary", mimeType: "text/plain", text: "Error loading summary." }] };
    }
  },
);

server.registerResource(
  "log-recent",
  "amem://log/recent",
  { mimeType: "text/plain", description: "Recent raw conversation log entries — lossless, append-only history" },
  () => {
    try {
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
    } catch (error) {
      console.error("[amem] Resource 'log-recent' failed:", error instanceof Error ? error.message : String(error));
      return { contents: [{ uri: "amem://log/recent", mimeType: "text/plain", text: "Error loading recent log." }] };
    }
  },
);

server.registerResource(
  "graph-overview",
  "amem://graph",
  { mimeType: "text/plain", description: "Knowledge graph overview — all explicit memory relationships" },
  () => {
    try {
      const all = db.getAll();
      const allRelations = db.getAllRelations();
      const lines = [`# Knowledge Graph (${all.length} nodes)\n`];
      let edgeCount = 0;

      // Build lookup maps to avoid per-node DB queries
      const memById = new Map(all.map(m => [m.id, m]));
      const outgoingByNode = new Map<string, typeof allRelations>();
      for (const r of allRelations) {
        const group = outgoingByNode.get(r.fromId) ?? [];
        group.push(r);
        outgoingByNode.set(r.fromId, group);
      }

      for (const mem of all) {
        const outgoing = outgoingByNode.get(mem.id);
        if (outgoing && outgoing.length > 0) {
          lines.push(`[${mem.id.slice(0, 8)}] "${mem.content.slice(0, 60)}"`);
          for (const r of outgoing) {
            const target = memById.get(r.toId);
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
    } catch (error) {
      console.error("[amem] Resource 'graph-overview' failed:", error instanceof Error ? error.message : String(error));
      return { contents: [{ uri: "amem://graph", mimeType: "text/plain", text: "Error loading graph." }] };
    }
  },
);

server.registerResource(
  "last-session",
  "amem://last-session",
  { mimeType: "text/plain", description: "Previous session summary — what happened, key decisions, and corrections. Load this to continue where you left off." },
  () => {
    try {
      const summaries = db.getRecentSummaries(currentProject, 1);
      if (summaries.length === 0) {
        return { contents: [{ uri: "amem://last-session", mimeType: "text/plain", text: "No previous session found." }] };
      }
      const s = summaries[0];
      const lines = [
        `# Last Session (${new Date(s.createdAt).toISOString().slice(0, 16)})`,
        "",
        s.summary,
      ];
      if (s.keyDecisions.length > 0) {
        lines.push("", "## Decisions");
        for (const d of s.keyDecisions) lines.push(`- ${d}`);
      }
      if (s.keyCorrections.length > 0) {
        lines.push("", "## Corrections");
        for (const c of s.keyCorrections) lines.push(`- ${c}`);
      }
      lines.push("", `Memories extracted: ${s.memoriesExtracted}`);
      return {
        contents: [{ uri: "amem://last-session", mimeType: "text/plain", text: lines.join("\n") }],
      };
    } catch (error) {
      console.error("[amem] Resource 'last-session' failed:", error instanceof Error ? error.message : String(error));
      return { contents: [{ uri: "amem://last-session", mimeType: "text/plain", text: "Error loading last session." }] };
    }
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
