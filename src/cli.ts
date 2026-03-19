#!/usr/bin/env node

import { createDatabase } from "./database.js";
import { recallMemories, MemoryType, IMPORTANCE_WEIGHTS, type MemoryTypeValue } from "./memory.js";
import { generateEmbedding } from "./embeddings.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const ENGRAM_DIR = process.env.ENGRAM_DIR || path.join(os.homedir(), ".engram");
const DB_PATH = process.env.ENGRAM_DB || path.join(ENGRAM_DIR, "memory.db");

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === "help" || command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

if (!fs.existsSync(DB_PATH)) {
  console.error(`No memory database found at ${DB_PATH}`);
  console.error("Start the Engram MCP server first, or set ENGRAM_DB to your database path.");
  process.exit(1);
}

const db = createDatabase(DB_PATH);

try {
  switch (command) {
    case "recall":
    case "search":
      await handleRecall(args.slice(1));
      break;
    case "stats":
      handleStats();
      break;
    case "export":
      handleExport(args.slice(1));
      break;
    case "forget":
    case "delete":
      handleForget(args.slice(1));
      break;
    case "list":
    case "ls":
      handleList(args.slice(1));
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
} finally {
  db.close();
}

function printHelp() {
  console.log(`
engram — The memory layer for AI coding tools

USAGE
  engram <command> [options]

COMMANDS
  recall <query>       Search memories semantically
  stats                Show memory statistics
  export [--file path] Export all memories as markdown
  list [--type TYPE]   List memories, optionally filtered by type
  forget <id>          Delete a memory by ID
  help                 Show this help

MEMORY TYPES
  correction  Don't do X (highest priority)
  decision    Architectural choices + rationale
  pattern     Coding style / habits
  preference  Tool / style preferences
  topology    Where things are in the codebase
  fact        General knowledge (lowest priority)

EXAMPLES
  engram recall "authentication approach"
  engram stats
  engram list --type correction
  engram export --file memories.md
  engram forget abc12345
`.trim());
}

async function handleRecall(args: string[]) {
  const query = args.join(" ");
  if (!query) {
    console.error("Usage: engram recall <query>");
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

function handleStats() {
  const stats = db.getStats();
  const all = db.getAll();

  console.log("Engram Memory Statistics\n");
  console.log(`  Total memories: ${stats.total}`);
  console.log(`  Database: ${DB_PATH}`);
  console.log();

  if (stats.total === 0) {
    console.log("  No memories stored yet.");
    return;
  }

  console.log("  By type:");
  const typeOrder: MemoryTypeValue[] = ["correction", "decision", "pattern", "preference", "topology", "fact"];
  for (const t of typeOrder) {
    const count = stats.byType[t] || 0;
    if (count > 0) {
      const bar = "\u2588".repeat(Math.min(count, 40));
      console.log(`    ${t.padEnd(12)} ${bar} ${count}`);
    }
  }

  console.log();

  // Confidence distribution
  const highConf = all.filter(m => m.confidence >= 0.8).length;
  const medConf = all.filter(m => m.confidence >= 0.5 && m.confidence < 0.8).length;
  const lowConf = all.filter(m => m.confidence < 0.5).length;
  console.log("  Confidence:");
  console.log(`    High (\u226580%)   ${highConf}`);
  console.log(`    Medium (50-79%) ${medConf}`);
  console.log(`    Low (<50%)    ${lowConf}`);

  console.log();

  // Embedding coverage
  const withEmbeddings = db.getAllWithEmbeddings().length;
  console.log(`  Embeddings: ${withEmbeddings}/${stats.total} memories have embeddings`);

  // Age stats
  if (all.length > 0) {
    const oldest = Math.min(...all.map(m => m.createdAt));
    const newest = Math.max(...all.map(m => m.createdAt));
    console.log(`  Oldest memory: ${formatAge(oldest)}`);
    console.log(`  Newest memory: ${formatAge(newest)}`);
  }
}

function handleExport(args: string[]) {
  let outputPath: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--file" || args[i] === "-f") && args[i + 1]) {
      outputPath = args[i + 1];
      break;
    }
  }

  const all = db.getAll();
  if (all.length === 0) {
    console.log("No memories to export.");
    return;
  }

  const typeOrder: MemoryTypeValue[] = ["correction", "decision", "pattern", "preference", "topology", "fact"];
  let md = `# Engram Memory Export\n\n`;
  md += `*Exported: ${new Date().toISOString()}*\n`;
  md += `*Total: ${all.length} memories*\n\n`;

  for (const t of typeOrder) {
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

function handleList(args: string[]) {
  let typeFilter: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--type" || args[i] === "-t") && args[i + 1]) {
      typeFilter = args[i + 1];
      break;
    }
  }

  let memories;
  if (typeFilter) {
    const validTypes = Object.values(MemoryType);
    if (!validTypes.includes(typeFilter as any)) {
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

function handleForget(args: string[]) {
  const id = args[0];
  if (!id) {
    console.error("Usage: engram forget <memory-id>");
    console.error("Use 'engram list' to see memory IDs.");
    process.exit(1);
  }

  // Support short IDs (first 8 chars)
  const all = db.getAll();
  const match = all.find(m => m.id.startsWith(id));

  if (!match) {
    console.error(`No memory found matching ID: ${id}`);
    process.exit(1);
  }

  db.deleteMemory(match.id);
  console.log(`Deleted: "${match.content}" (${match.type})`);
}

function formatAge(timestamp: number): string {
  const ms = Date.now() - timestamp;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
