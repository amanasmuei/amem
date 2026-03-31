#!/usr/bin/env node

import { createDatabase } from "./database.js";
import { recallMemories, MemoryType, type MemoryTypeValue } from "./memory.js";
import { generateEmbedding } from "./embeddings.js";
import { formatAge, TYPE_ORDER } from "./tools/index.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const AMEM_DIR = process.env.AMEM_DIR || path.join(os.homedir(), ".amem");
const DB_PATH = process.env.AMEM_DB || path.join(AMEM_DIR, "memory.db");

// ── Declarations needed before command dispatch ─────────

interface ToolConfig {
  name: string;
  configDir: string;
  configFile: string;
  configKey: string;
}

const AI_TOOLS: ToolConfig[] = [
  { name: "Claude Code", configDir: path.join(os.homedir(), ".claude"), configFile: "settings.json", configKey: "mcpServers" },
  { name: "Cursor", configDir: path.join(os.homedir(), ".cursor"), configFile: "mcp.json", configKey: "mcpServers" },
  { name: "Windsurf", configDir: path.join(os.homedir(), ".windsurf"), configFile: "mcp.json", configKey: "mcpServers" },
  { name: "GitHub Copilot CLI", configDir: path.join(os.homedir(), ".github-copilot"), configFile: "mcp.json", configKey: "mcpServers" },
];

interface RulesTarget {
  name: string;
  configDir: string;
  rulesFile: string;
  dirInProject?: boolean;
}

const RULES_TARGETS: RulesTarget[] = [
  { name: "Claude Code", configDir: path.join(os.homedir(), ".claude"), rulesFile: "CLAUDE.md" },
  { name: "Cursor", configDir: path.join(os.homedir(), ".cursor"), rulesFile: ".cursorrules" },
  { name: "Windsurf", configDir: path.join(os.homedir(), ".windsurf"), rulesFile: ".windsurfrules" },
  { name: "GitHub Copilot", configDir: path.join(os.homedir(), ".github-copilot"), rulesFile: ".github/copilot-instructions.md", dirInProject: true },
];

function getFlag(args: string[], long: string, short: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === long || args[i] === short) && args[i + 1]) {
      return args[i + 1];
    }
    if (args[i].startsWith(long + "=")) {
      return args[i].slice(long.length + 1);
    }
  }
  return undefined;
}

// ── Command dispatch ────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === "help" || command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

// ── Commands that don't need a database ─────────────────
if (command === "init") {
  handleInit(args.slice(1));
  process.exit(0);
}

if (command === "rules") {
  handleRules(args.slice(1));
  process.exit(0);
}

// ── Commands that need a database ───────────────────────
if (command === "dashboard") {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`No memory database found at ${DB_PATH}`);
    console.error("Run 'amem init' first, or start the Amem MCP server.");
    process.exit(1);
  }
  const { startDashboard } = await import("./dashboard.js");
  const db = createDatabase(DB_PATH);
  const portArg = args.find(a => a.startsWith("--port="));
  const port = portArg ? parseInt(portArg.split("=")[1], 10) : 3333;
  startDashboard(db, port);
  // Dashboard keeps running — don't close db
} else {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`No memory database found at ${DB_PATH}`);
    console.error("Start the Amem MCP server first, or set AMEM_DB to your database path.");
    process.exit(1);
  }

  const db = createDatabase(DB_PATH);

  try {
    switch (command) {
      case "recall":
      case "search":
        await handleRecall(db, args.slice(1));
        break;
      case "stats":
        handleStats(db);
        break;
      case "export":
        handleExport(db, args.slice(1));
        break;
      case "forget":
      case "delete":
        handleForget(db, args.slice(1));
        break;
      case "list":
      case "ls":
        handleList(db, args.slice(1));
        break;
      case "reset":
        handleReset(db, args.slice(1));
        break;
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

// ═══════════════════════════════════════════════════════════
// HELP
// ═══════════════════════════════════════════════════════════

function printHelp() {
  console.log(`
amem — The memory layer for AI coding tools

USAGE
  amem <command> [options]

SETUP
  init                 Auto-configure amem for detected AI tools
  rules [--tool NAME]  Generate auto-extraction rules for AI tools
  dashboard [--port=N] Open the memory dashboard in your browser (default: 3333)

MEMORY
  recall <query>       Search memories semantically
  stats                Show memory statistics
  export [--file path] Export all memories as markdown
  list [--type TYPE]   List memories, optionally filtered by type
  forget <id>          Delete a memory by ID
  reset [--confirm]    Wipe ALL data and start fresh (requires --confirm)

OTHER
  help                 Show this help

MEMORY TYPES
  correction  Don't do X (highest priority)
  decision    Architectural choices + rationale
  pattern     Coding style / habits
  preference  Tool / style preferences
  topology    Where things are in the codebase
  fact        General knowledge (lowest priority)

EXAMPLES
  amem init
  amem rules
  amem dashboard
  amem recall "authentication approach"
  amem stats
  amem list --type correction
  amem export --file memories.md
  amem forget abc12345
`.trim());
}

// ═══════════════════════════════════════════════════════════
// INIT — Auto-configure AI tools
// ═══════════════════════════════════════════════════════════

function handleInit(args: string[]) {
  const toolFilter = getFlag(args, "--tool", "-t");
  let configured = 0;
  let skipped = 0;

  console.log("Detecting AI tools...\n");

  for (const tool of AI_TOOLS) {
    if (toolFilter && !tool.name.toLowerCase().includes(toolFilter.toLowerCase())) continue;

    if (!fs.existsSync(tool.configDir)) {
      console.log(`  \u2717 ${tool.name} — not installed`);
      continue;
    }

    const configPath = path.join(tool.configDir, tool.configFile);
    let config: Record<string, unknown> = {};

    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, "utf-8").trim();
        if (raw) config = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        console.log(`  \u2717 ${tool.name} — could not parse ${tool.configFile}`);
        continue;
      }
    }

    const servers = (config[tool.configKey] ?? {}) as Record<string, unknown>;
    if (servers.amem) {
      console.log(`  \u2713 ${tool.name} — already configured`);
      skipped++;
      continue;
    }

    servers.amem = {
      command: "npx",
      args: ["-y", "@aman_asmuei/amem"],
    };
    config[tool.configKey] = servers;

    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    console.log(`  \u2713 ${tool.name} — configured (${configPath})`);
    configured++;
  }

  console.log();
  if (configured > 0) {
    console.log(`Configured ${configured} tool${configured > 1 ? "s" : ""}. Restart your AI tools to activate amem.`);
  } else if (skipped > 0) {
    console.log("All detected tools are already configured.");
  } else {
    console.log("No supported AI tools detected. Install Claude Code, Cursor, Windsurf, or GitHub Copilot CLI first.");
  }
}

// ═══════════════════════════════════════════════════════════
// RULES — Generate auto-extraction rules
// ═══════════════════════════════════════════════════════════

function getRulesContent(): string {
  return `# Amem — Persistent Memory Rules

You have access to **amem**, a persistent memory system via MCP. Use it proactively.

## Session Start
1. Call \`memory_inject\` with the current task topic — surfaces corrections (hard constraints) and decisions
2. Call \`reminder_check\` — shows overdue and upcoming reminders
3. Call \`memory_context\` for broader background if needed

## During Conversation
- **User corrects you** → \`memory_store\` as \`correction\` (confidence: 1.0)
- **Architecture decision made** → \`memory_store\` as \`decision\` (confidence: 0.9)
- **Coding pattern observed** → \`memory_store\` as \`pattern\` (confidence: 0.7)
- **Tool/style preference expressed** → \`memory_store\` as \`preference\` (confidence: 0.8)
- **Codebase location revealed** → \`memory_store\` as \`topology\` (confidence: 0.7)
- **Project fact established** → \`memory_store\` as \`fact\` (confidence: 0.6)

## Every ~10 Exchanges
Call \`memory_extract\` with a batch of memories from the conversation so far.

## Before Ending
Call \`memory_extract\` to capture any remaining insights.

## Rules
- **Corrections override everything** — always check for them before acting
- **Be specific** — "Uses Tailwind with custom theme in src/styles" not "Has CSS"
- **Be self-contained** — each memory should make sense without conversation context
- **Never store** — API keys, passwords, ephemeral task details, or exact file contents
- **Check before storing** — use \`memory_recall\` to avoid duplicates
- **Link related memories** — use \`memory_relate\` to build the knowledge graph
- **Reference naturally** — say "I remember you prefer X" not "My memory database says..."
`.trimEnd();
}

function handleRules(args: string[]) {
  const toolFilter = getFlag(args, "--tool", "-t");
  const customPath = getFlag(args, "--path", "-p");

  if (customPath) {
    const dir = path.dirname(customPath);
    if (dir !== ".") fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(customPath, getRulesContent() + "\n");
    console.log(`\u2713 Rules written to ${customPath}`);
    return;
  }

  let written = 0;
  console.log("Generating amem rules...\n");

  for (const target of RULES_TARGETS) {
    if (toolFilter && !target.name.toLowerCase().includes(toolFilter.toLowerCase())) continue;

    if (!fs.existsSync(target.configDir)) {
      console.log(`  \u2717 ${target.name} — not installed`);
      continue;
    }

    const rulesPath = target.dirInProject
      ? path.resolve(target.rulesFile)
      : path.resolve(target.rulesFile);

    // Don't overwrite existing rules files — append amem section
    if (fs.existsSync(rulesPath)) {
      const existing = fs.readFileSync(rulesPath, "utf-8");
      if (existing.includes("amem") || existing.includes("memory_inject")) {
        console.log(`  \u2713 ${target.name} — already has amem rules (${target.rulesFile})`);
        continue;
      }
      fs.writeFileSync(rulesPath, existing + "\n\n" + getRulesContent() + "\n");
      console.log(`  \u2713 ${target.name} — appended to ${target.rulesFile}`);
    } else {
      const dir = path.dirname(rulesPath);
      if (dir !== ".") fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(rulesPath, getRulesContent() + "\n");
      console.log(`  \u2713 ${target.name} — created ${target.rulesFile}`);
    }
    written++;
  }

  console.log();
  if (written > 0) {
    console.log(`Generated rules for ${written} tool${written > 1 ? "s" : ""}. Your AI will now use amem proactively.`);
  } else {
    console.log("No rules written. Use --path to write to a custom location.");
  }
}

// ═══════════════════════════════════════════════════════════
// DB-DEPENDENT COMMANDS
// ═══════════════════════════════════════════════════════════

import type { AmemDatabase } from "./database.js";

async function handleRecall(db: AmemDatabase, args: string[]) {
  const query = args.join(" ");
  if (!query) {
    console.error("Usage: amem recall <query>");
    process.exit(1);
  }

  console.log(`Searching for: "${query}"\n`);

  const queryEmbedding = await generateEmbedding(query);
  const results = recallMemories(db, {
    query,
    queryEmbedding,
    limit: 20,
  });

  if (results.length === 0) {
    console.log("No memories found.");
    return;
  }

  for (const r of results) {
    const age = formatAge(r.createdAt);
    const conf = (r.confidence * 100).toFixed(0);
    const typeTag = r.type.toUpperCase().padEnd(11);
    console.log(`  ${typeTag} ${r.content}`);
    console.log(`             Score: ${r.score.toFixed(3)} | Confidence: ${conf}% | Age: ${age} | ID: ${r.id.slice(0, 8)}`);
    if (r.tags.length > 0) {
      console.log(`             Tags: ${r.tags.join(", ")}`);
    }
    console.log();
  }

  console.log(`${results.length} memories found.`);
}

function handleStats(db: AmemDatabase) {
  const stats = db.getStats();
  const confStats = db.getConfidenceStats();

  console.log("Amem Memory Statistics\n");
  console.log(`  Total memories: ${stats.total}`);
  console.log(`  Database: ${DB_PATH}`);
  console.log();

  if (stats.total === 0) {
    console.log("  No memories stored yet.");
    return;
  }

  console.log("  By type:");
  for (const t of TYPE_ORDER) {
    const count = stats.byType[t] || 0;
    if (count > 0) {
      const bar = "\u2588".repeat(Math.min(count, 40));
      console.log(`    ${t.padEnd(12)} ${bar} ${count}`);
    }
  }

  console.log();
  console.log("  Confidence:");
  console.log(`    High (\u226580%)   ${confStats.high}`);
  console.log(`    Medium (50-79%) ${confStats.medium}`);
  console.log(`    Low (<50%)    ${confStats.low}`);

  console.log();
  const withEmbeddings = db.getEmbeddingCount();
  console.log(`  Embeddings: ${withEmbeddings}/${stats.total} memories have embeddings`);
}

function handleExport(db: AmemDatabase, args: string[]) {
  const outputPath = getFlag(args, "--file", "-f");

  const all = db.getAll();
  if (all.length === 0) {
    console.log("No memories to export.");
    return;
  }

  let md = `# Amem Memory Export\n\n`;
  md += `*Exported: ${new Date().toISOString()}*\n`;
  md += `*Total: ${all.length} memories*\n\n`;

  for (const t of TYPE_ORDER) {
    const memories = all.filter(m => m.type === t);
    if (memories.length === 0) continue;

    md += `## ${t.charAt(0).toUpperCase() + t.slice(1)}s\n\n`;
    for (const m of memories) {
      const conf = (m.confidence * 100).toFixed(0);
      const age = formatAge(m.createdAt);
      md += `- **${m.content}**\n`;
      md += `  Confidence: ${conf}% | Age: ${age} | Tags: [${m.tags.join(", ")}] | ID: ${m.id.slice(0, 8)}\n\n`;
    }
  }

  if (outputPath) {
    fs.writeFileSync(outputPath, md);
    console.log(`Exported ${all.length} memories to ${outputPath}`);
  } else {
    process.stdout.write(md);
  }
}

function handleList(db: AmemDatabase, args: string[]) {
  const typeFilter = getFlag(args, "--type", "-t");

  let memories;
  if (typeFilter) {
    const validTypes = Object.values(MemoryType);
    if (!validTypes.includes(typeFilter as MemoryTypeValue)) {
      console.error(`Invalid type: ${typeFilter}. Valid types: ${validTypes.join(", ")}`);
      process.exit(1);
    }
    memories = db.searchByType(typeFilter as MemoryTypeValue);
  } else {
    memories = db.getAll();
  }

  if (memories.length === 0) {
    console.log("No memories found.");
    return;
  }

  for (const m of memories) {
    const conf = (m.confidence * 100).toFixed(0);
    const typeTag = m.type.toUpperCase().padEnd(11);
    console.log(`  ${m.id.slice(0, 8)}  ${typeTag} ${m.content}  (${conf}%)`);
  }
  console.log(`\n${memories.length} memories.`);
}

function handleForget(db: AmemDatabase, args: string[]) {
  const id = args[0];
  if (!id) {
    console.error("Usage: amem forget <memory-id>");
    console.error("Use 'amem list' to see memory IDs.");
    process.exit(1);
  }

  // Support short IDs via SQL prefix match (no full table scan)
  const fullId = db.resolveId(id);
  if (!fullId) {
    console.error(`No memory found matching ID: ${id}`);
    process.exit(1);
  }

  const match = db.getById(fullId);
  db.deleteMemory(fullId);
  console.log(`Deleted: "${match?.content}" (${match?.type})`);
}

function handleReset(db: AmemDatabase, args: string[]) {
  const confirm = args.includes("--confirm");

  if (!confirm) {
    const stats = db.getStats();
    const logCount = db.getLogCount();
    console.log("This will permanently delete:");
    console.log(`  - ${stats.total} memories`);
    console.log(`  - ${logCount} conversation log entries`);
    console.log(`  - All version history, relations, and reminders`);
    console.log(`  - Database: ${DB_PATH}`);
    console.log();
    console.log("Run with --confirm to proceed:");
    console.log("  amem-cli reset --confirm");
    return;
  }

  db.close();

  // Delete the database file and WAL/SHM files
  fs.unlinkSync(DB_PATH);
  try { fs.unlinkSync(DB_PATH + "-wal"); } catch {}
  try { fs.unlinkSync(DB_PATH + "-shm"); } catch {}

  console.log("All amem data has been wiped. Starting fresh.");
  console.log(`Deleted: ${DB_PATH}`);
}
