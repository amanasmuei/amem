#!/usr/bin/env node

import { createDatabase, recallMemories, MemoryType, type MemoryTypeValue } from "@aman_asmuei/amem-core";
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
  { name: "GitHub Copilot CLI", configDir: path.join(os.homedir(), ".copilot"), configFile: "mcp-config.json", configKey: "mcpServers" },
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
  { name: "GitHub Copilot", configDir: path.join(os.homedir(), ".copilot"), rulesFile: ".github/copilot-instructions.md", dirInProject: true },
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

if (command === "hooks") {
  await handleHooks(args.slice(1));
  process.exit(0);
}

if (command === "sync") {
  await handleSync(args.slice(1));
  // Workaround: @huggingface/transformers (ONNX Runtime) has a known
  // teardown crash on macOS — worker threads try to release a mutex that
  // Node has already torn down, producing
  //   libc++abi: terminating ... mutex lock failed: Invalid argument
  // and exit code 134. By this point all sync work is committed and the
  // DB is closed, so we flush stdio and hard-exit via SIGKILL before the
  // broken native destructors can run.
  await new Promise<void>((resolve) => process.stdout.write("", () => resolve()));
  await new Promise<void>((resolve) => process.stderr.write("", () => resolve()));
  process.kill(process.pid, "SIGKILL");
}

// ── Commands that need a database ───────────────────────
if (command === "doctor") {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`No memory database found at ${DB_PATH}`);
    process.exit(1);
  }
  const { runDiagnostics } = await import("@aman_asmuei/amem-core");
  const doctorDb = createDatabase(DB_PATH);
  try {
    const report = runDiagnostics(doctorDb);
    const icon = report.status === "healthy" ? "\u2713" : report.status === "warning" ? "!" : "\u2717";
    console.log(`\namem doctor — ${icon} ${report.status.toUpperCase()}\n`);
    console.log(`  Memories:    ${report.stats.totalMemories}`);
    console.log(`  Embeddings:  ${report.stats.embeddingCoverage}% coverage`);
    console.log(`  Core tier:   ${report.stats.coreTierTokens}/${report.stats.coreTierBudget} tokens`);
    console.log(`  Graph edges: ${report.stats.graphEdges}`);
    console.log(`  Stale:       ${report.stats.staleCount}`);
    if (report.stats.remindersOverdue > 0) {
      console.log(`  Overdue:     ${report.stats.remindersOverdue} reminder(s)`);
    }
    if (report.issues.length > 0) {
      console.log(`\n  Issues:`);
      for (const issue of report.issues) {
        const sev = issue.severity === "critical" ? "\u2717" : issue.severity === "warning" ? "!" : "\u00b7";
        console.log(`    ${sev} ${issue.message}`);
        console.log(`      \u2192 ${issue.suggestion}`);
      }
    }
    console.log();
  } finally {
    doctorDb.close();
  }
  process.exit(0);
}

if (command === "repair") {
  const { repairDatabase } = await import("@aman_asmuei/amem-core");
  const result = repairDatabase(DB_PATH);
  const icon = result.status === "healthy" ? "\u2713" : result.status === "repaired" ? "\u2713" : "\u2717";
  console.log(`\namem repair — ${icon} ${result.status.toUpperCase()}\n`);
  console.log(`  ${result.message}`);
  if (result.backupUsed) {
    console.log(`  Backup used: ${result.backupUsed}`);
  }
  console.log();
  process.exit(result.status === "failed" ? 1 : 0);
}

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
      case "team-export":
        await handleTeamExport(db, args.slice(1));
        break;
      case "team-import":
        await handleTeamImport(db, args.slice(1));
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
  hooks [--uninstall]  Install/uninstall automatic memory capture hooks
                       --target copilot  Install hooks for GitHub Copilot CLI
  sync [--dry-run]     Import Claude Code auto-memory into amem
  sync --to copilot    Export amem memories to .github/copilot-instructions.md
  doctor               Run health diagnostics on your memory database
  repair               Attempt to repair a corrupted database from backups
  dashboard [--port=N] Open the memory dashboard in your browser (default: 3333)

MEMORY
  recall <query>       Search memories semantically
  stats                Show memory statistics
  export [--file path] Export all memories as markdown
  list [--type TYPE]   List memories, optionally filtered by type
  forget <id>          Delete a memory by ID
  reset [--confirm]    Wipe ALL data and start fresh (requires --confirm)

TEAM
  team-export          Export shareable memories for teammates
    --dir <path>         Output directory (default: current directory)
    --user <id>          Your user identifier
  team-import <file>   Import a teammate's exported memories
    --dry-run            Preview without writing

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
  amem hooks
  amem sync
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

You have access to **amem**, a persistent memory system via MCP. You are the LLM — use your understanding to extract memories the user would want preserved.

## Session Start
1. Call \`memory_inject\` with the current task topic — surfaces corrections (MUST follow) and decisions
2. Call \`reminder_check\` — shows overdue and upcoming reminders
3. Call \`memory_context\` for broader background if needed

## Active Extraction — You Are the LLM

You are far better at understanding intent than regex. Extract memories **as they happen**, not just when explicitly asked.

### Explicit Signals (always extract immediately)
- User says "don't", "never", "stop doing" → \`correction\` (1.0)
- User says "we decided", "let's go with" → \`decision\` (0.9)
- User says "I prefer", "I always" → \`preference\` (0.8)

### Implicit Signals (extract these too — regex can't catch them)
- User **rejects your suggestion** and explains why → \`correction\` (0.95). The rejection reason is the memory, not the code.
- User **chooses between options** you presented → \`decision\` (0.85). Store which option and why.
- User **refactors your code** in a consistent way → \`pattern\` (0.7). The refactoring style is the memory.
- User **asks you to check a specific file/path** → \`topology\` (0.6). The location is worth remembering.
- User **explains context** you didn't have → \`fact\` (0.7). They're teaching you about the project.
- User **re-explains something** from a prior session → \`correction\` (0.9). If they have to repeat it, it wasn't stored.

### What Makes a Good Memory
- **Self-contained** — "Use pnpm, not npm, because of workspace support" not "Use pnpm"
- **Include the why** — "Chose Postgres over Mongo for ACID compliance" not "Uses Postgres"
- **Be specific** — "Auth middleware lives in src/middleware/auth.ts and uses JWT RS256" not "Has auth"
- **One concept per memory** — split compound statements into separate memories

## Extraction Rhythm
- **Immediately** after any correction or decision (don't wait)
- **Every ~10 exchanges** — call \`memory_extract\` with a batch of accumulated insights
- **Before ending** — final \`memory_extract\` for anything remaining
- **After significant debugging** — store what was wrong and how it was fixed as a \`pattern\`

## What NOT to Store
- Ephemeral task details ("fix the bug on line 42")
- Exact file contents or large code blocks
- API keys, passwords, tokens (auto-redacted, but avoid storing them)
- Things already in the codebase (the code is the source of truth)
- Duplicate of something already stored — use \`memory_recall\` to check first

## Rules
- **Corrections override everything** — always check for them before acting
- **Link related memories** — use \`memory_relate\` to build the knowledge graph
- **Reference naturally** — say "I remember you prefer X" not "My memory database says..."
- **Use compact recall** — \`memory_recall\` returns compact by default, use \`memory_detail\` for full content
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
// HOOKS — Automatic memory capture
// ═══════════════════════════════════════════════════════════

async function handleHooks(args: string[]) {
  const { installHooks, uninstallHooks, installHooksForTarget, uninstallHooksForTarget } = await import("./hooks.js");
  const target = getFlag(args, "--target", "-T") as "claude" | "copilot" | undefined;
  const isCopilot = target === "copilot";
  const toolName = isCopilot ? "GitHub Copilot CLI" : "Claude Code";

  if (args.includes("--uninstall") || args.includes("--remove")) {
    const result = target
      ? uninstallHooksForTarget(target)
      : uninstallHooks();
    if (result.removed.length > 0) {
      console.log(`Removed amem hooks: ${result.removed.join(", ")}`);
      console.log(`Hooks have been uninstalled from ${toolName} settings.`);
    } else {
      console.log("No amem hooks found to remove.");
    }
    return;
  }

  console.log(`Installing amem hooks for ${toolName}...\n`);

  const hookConfig = {
    captureToolUse: true,
    captureSessionEnd: true,
    captureSessionStart: true,
  };

  const result = target
    ? installHooksForTarget(hookConfig, target)
    : installHooks(hookConfig);

  console.log(`  Installed hook scripts: ${result.installed.join(", ")}`);
  console.log(`  Updated ${toolName} settings: ${result.configPath}`);
  console.log();
  console.log(`Hooks installed! ${toolName} will now automatically:`);
  console.log("  - Inject core memories at session start (SessionStart)");
  console.log("  - Capture tool observations with pattern detection (PostToolUse)");
  console.log("  - Auto-extract corrections/decisions/preferences from conversation");
  console.log("  - Summarize sessions on end (Stop)");
  if (isCopilot) {
    console.log();
    console.log("Tip: Run 'amem sync --to copilot' to export memories to copilot-instructions.md");
  }
  console.log();
  console.log(`Use 'amem-cli hooks${target ? ` --target ${target}` : ""} --uninstall' to remove hooks.`);
}

// ═══════════════════════════════════════════════════════════
// SYNC — Import Claude Code auto-memory
// ═══════════════════════════════════════════════════════════

async function handleSync(args: string[]) {
  const dryRun = args.includes("--dry-run") || args.includes("-n");
  const projectFilter = getFlag(args, "--project", "-p");
  const syncTarget = getFlag(args, "--to", "-t");

  // Need DB for sync
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const syncDb = createDatabase(DB_PATH);

  try {
    if (syncTarget === "copilot") {
      // ── Export amem → copilot-instructions.md ──────────
      const { syncToCopilot } = await import("@aman_asmuei/amem-core");

      const projectDir = projectFilter || process.cwd();
      console.log(`Syncing amem memories to Copilot instructions...`);
      if (dryRun) console.log("(dry run — no changes will be made)\n");

      const result = syncToCopilot(syncDb, {
        projectDir,
        dryRun,
        scope: `project:${projectDir}`,
      });

      if (result.memoriesExported === 0) {
        console.log("No memories to export. Store some memories first via amem MCP tools.");
        return;
      }

      console.log(`  Corrections:  ${result.sections.corrections}`);
      console.log(`  Decisions:    ${result.sections.decisions}`);
      console.log(`  Preferences:  ${result.sections.preferences}`);
      console.log(`  Patterns:     ${result.sections.patterns}`);
      console.log(`  Context:      ${result.sections.other}`);
      console.log();
      console.log(`Total: ${result.memoriesExported} memories exported`);

      if (dryRun) {
        console.log(`\nWould write to: ${result.file}`);
        console.log("Run without --dry-run to write the file.");
      } else {
        console.log(`\nWritten to: ${result.file}`);
        console.log("Copilot will read this as persistent context in your project.");
      }
      return;
    }

    // ── Default: Import Claude auto-memory → amem ──────────
    const { discoverClaudeMemories, syncFromClaude } = await import("@aman_asmuei/amem-core");

    const discovered = discoverClaudeMemories();
    if (discovered.size === 0) {
      console.log("No Claude Code auto-memory found.");
      console.log("Claude stores memory in ~/.claude/projects/*/memory/");
      return;
    }

    console.log(`Found ${discovered.size} project(s) with Claude auto-memory.`);
    if (dryRun) console.log("(dry run — no changes will be made)\n");
    else console.log();

    const result = await syncFromClaude(syncDb, projectFilter, dryRun);

    // Print results
    for (const d of result.details) {
      const icon = d.action === "imported" ? "\u2713" : d.action === "updated" ? "~" : "\u2022";
      const suffix = d.reason ? ` (${d.reason})` : "";
      console.log(`  ${icon} [${d.type}] ${d.name}${suffix}`);
    }

    console.log();
    console.log(`Imported: ${result.imported} | Skipped: ${result.skipped} | Updated: ${result.updated}`);
    console.log(`Projects scanned: ${result.projectsScanned}`);

    if (dryRun && result.imported > 0) {
      console.log("\nRun without --dry-run to import these memories.");
    }
  } finally {
    syncDb.close();
  }
}

// ═══════════════════════════════════════════════════════════
// DB-DEPENDENT COMMANDS
// ═══════════════════════════════════════════════════════════

import type { AmemDatabase } from "@aman_asmuei/amem-core";

async function handleRecall(db: AmemDatabase, args: string[]) {
  const query = args.join(" ");
  if (!query) {
    console.error("Usage: amem recall <query>");
    process.exit(1);
  }

  console.log(`Searching for: "${query}"\n`);

  try {
    // CLI uses keyword-only matching for instant results.
    // Semantic search (with embeddings) is available via the MCP server.
    const results = recallMemories(db, {
      query,
      queryEmbedding: null,
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
  } catch (error) {
    console.error(`Recall error: ${error instanceof Error ? error.message : String(error)}`);
    console.log("No memories found.");
  }
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
  try { fs.unlinkSync(DB_PATH + "-wal"); } catch { /* WAL file may not exist */ }
  try { fs.unlinkSync(DB_PATH + "-shm"); } catch { /* SHM file may not exist */ }

  console.log("All amem data has been wiped. Starting fresh.");
  console.log(`Deleted: ${DB_PATH}`);
}

// ═══════════════════════════════════════════════════════════
// TEAM SYNC
// ═══════════════════════════════════════════════════════════

async function handleTeamExport(db: AmemDatabase, args: string[]) {
  const outputDir = getFlag(args, "--dir", "-d") || process.cwd();
  const userId = getFlag(args, "--user", "-u");

  if (!userId) {
    console.error("Usage: amem team-export --user <id> [--dir <path>]");
    console.error("  --user is required to identify your exports.");
    process.exit(1);
  }

  const { exportForTeam } = await import("@aman_asmuei/amem-core");
  const result = await exportForTeam(db, outputDir, { userId });

  console.log(`Exported ${result.count} memories to ${result.file}`);
}

async function handleTeamImport(db: AmemDatabase, args: string[]) {
  const dryRun = args.includes("--dry-run") || args.includes("-n");

  // File path is the first non-flag argument
  const filePath = args.find((a) => !a.startsWith("-"));

  if (!filePath) {
    console.error("Usage: amem team-import <file> [--dry-run]");
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const { importFromTeam } = await import("@aman_asmuei/amem-core");

  if (dryRun) console.log("(dry run — no changes will be made)\n");

  const result = await importFromTeam(db, filePath, { dryRun });

  console.log(`From: ${result.from}`);
  console.log(`Imported: ${result.imported} | Skipped: ${result.skipped}`);

  if (dryRun && result.imported > 0) {
    console.log("\nRun without --dry-run to import these memories.");
  }
}
