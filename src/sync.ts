/**
 * Sync engine: imports Claude Code auto-memory files into amem.
 *
 * Claude Code stores auto-memory as markdown files with YAML frontmatter:
 *   ~/.claude/projects/<escaped-path>/memory/MEMORY.md   (index)
 *   ~/.claude/projects/<escaped-path>/memory/<name>.md    (individual memories)
 *
 * Frontmatter format:
 *   ---
 *   name: <title>
 *   description: <one-line summary>
 *   type: user | feedback | project | reference
 *   ---
 *   <markdown body>
 *
 * Type mapping (Claude auto-memory → amem):
 *   feedback   → correction  (user corrections, constraints)
 *   project    → decision    (project-level decisions, architecture)
 *   user       → preference  (user profile, preferences)
 *   reference  → topology    (pointers to external resources, codebase locations)
 */

import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import type { AmemDatabase } from "./database.js";
import type { MemoryTypeValue } from "./memory.js";
import { generateEmbedding } from "./embeddings.js";

// ── Type mapping ────────────────────────────────────────

const CLAUDE_TO_AMEM_TYPE: Record<string, MemoryTypeValue> = {
  feedback: "correction",
  project: "decision",
  user: "preference",
  reference: "topology",
};

const CLAUDE_TO_CONFIDENCE: Record<string, number> = {
  feedback: 1.0,    // Corrections are high-confidence
  project: 0.85,
  user: 0.8,
  reference: 0.7,
};

// ── Frontmatter parser ──────────────────────────────────

interface ClaudeMemoryFile {
  name: string;
  description: string;
  type: string;
  body: string;
  filePath: string;
}

function parseFrontmatter(content: string, filePath: string): ClaudeMemoryFile | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return null;

  const frontmatter = match[1];
  const body = match[2].trim();

  // Simple YAML key-value parser (no dependency needed)
  const fields: Record<string, string> = {};
  for (const line of frontmatter.split("\n")) {
    const kv = line.match(/^(\w+)\s*:\s*(.+)$/);
    if (kv) fields[kv[1]] = kv[2].trim();
  }

  if (!fields.name || !fields.type) return null;

  return {
    name: fields.name,
    description: fields.description || "",
    type: fields.type,
    body,
    filePath,
  };
}

// ── Discovery ───────────────────────────────────────────

/**
 * Find all Claude auto-memory directories.
 * Returns map of project path → memory directory.
 */
export function discoverClaudeMemories(): Map<string, string> {
  const claudeDir = path.join(os.homedir(), ".claude", "projects");
  const results = new Map<string, string>();

  if (!fs.existsSync(claudeDir)) return results;

  try {
    for (const entry of fs.readdirSync(claudeDir)) {
      const memDir = path.join(claudeDir, entry, "memory");
      if (fs.existsSync(memDir) && fs.statSync(memDir).isDirectory()) {
        // Decode project path from directory name
        const projectPath = entry.replace(/^-/, "/").replace(/-/g, "/");
        results.set(projectPath, memDir);
      }
    }
  } catch {
    // Permission errors etc.
  }

  return results;
}

/**
 * Read all memory files from a Claude auto-memory directory.
 */
export function readClaudeMemoryDir(memDir: string): ClaudeMemoryFile[] {
  const files: ClaudeMemoryFile[] = [];

  try {
    for (const name of fs.readdirSync(memDir)) {
      if (name === "MEMORY.md") continue; // Skip index file
      if (!name.endsWith(".md")) continue;

      const filePath = path.join(memDir, name);
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = parseFrontmatter(content, filePath);
      if (parsed) files.push(parsed);
    }
  } catch {
    // Read errors
  }

  return files;
}

// ── Sync engine ─────────────────────────────────────────

export interface SyncResult {
  imported: number;
  skipped: number;
  updated: number;
  details: Array<{
    action: "imported" | "skipped" | "updated";
    name: string;
    type: string;
    reason?: string;
  }>;
  projectsScanned: number;
}

/**
 * Sync Claude auto-memory into amem.
 *
 * @param db - amem database
 * @param projectFilter - only sync this project path (optional, syncs all if omitted)
 * @param dryRun - preview without writing (default: false)
 */
export async function syncFromClaude(
  db: AmemDatabase,
  projectFilter?: string,
  dryRun = false,
): Promise<SyncResult> {
  const discovered = discoverClaudeMemories();
  const result: SyncResult = {
    imported: 0,
    skipped: 0,
    updated: 0,
    details: [],
    projectsScanned: 0,
  };

  for (const [projectPath, memDir] of discovered) {
    if (projectFilter && !projectPath.includes(projectFilter)) continue;
    result.projectsScanned++;

    const files = readClaudeMemoryDir(memDir);
    const scope = `project:${projectPath}`;

    for (const file of files) {
      const amemType = CLAUDE_TO_AMEM_TYPE[file.type];
      if (!amemType) {
        result.skipped++;
        result.details.push({
          action: "skipped",
          name: file.name,
          type: file.type,
          reason: `Unknown Claude memory type: ${file.type}`,
        });
        continue;
      }

      // Build the memory content: combine name + body for richness
      const content = file.body.length > 0
        ? `${file.name}: ${file.body}`
        : file.name;

      // Truncate very long memories (Claude project overviews can be huge)
      const truncated = content.length > 5000
        ? content.slice(0, 5000) + "\n\n[truncated from Claude auto-memory]"
        : content;

      // Check for existing duplicate by content hash
      const existing = db.findByContentHash(truncated);
      if (existing) {
        result.skipped++;
        result.details.push({
          action: "skipped",
          name: file.name,
          type: amemType,
          reason: "Already exists in amem (content hash match)",
        });
        continue;
      }

      // Check for semantic near-duplicate by name
      const nameMatch = db.fullTextSearch(file.name, 1);
      if (nameMatch.length > 0 && nameMatch[0].content.includes(file.name.split(":")[0])) {
        result.skipped++;
        result.details.push({
          action: "skipped",
          name: file.name,
          type: amemType,
          reason: `Similar memory already exists: "${nameMatch[0].content.slice(0, 60)}..."`,
        });
        continue;
      }

      if (dryRun) {
        result.imported++;
        result.details.push({
          action: "imported",
          name: file.name,
          type: amemType,
          reason: "(dry run)",
        });
        continue;
      }

      // Generate embedding and store
      const embedding = await generateEmbedding(truncated);
      const confidence = CLAUDE_TO_CONFIDENCE[file.type] ?? 0.7;

      // Use global scope for user/feedback, project scope for project/reference
      const memScope = (file.type === "user" || file.type === "feedback") ? "global" : scope;

      const tags = ["claude-sync", file.type];
      if (file.description) {
        // Extract potential tags from description
        const words = file.description.toLowerCase().split(/[\s,\-]+/);
        for (const w of words) {
          if (w.length > 3 && w.length < 20 && !tags.includes(w)) {
            tags.push(w);
            if (tags.length >= 8) break;
          }
        }
      }

      db.insertMemory({
        content: truncated,
        type: amemType,
        tags,
        confidence,
        source: "claude-auto-memory",
        embedding,
        scope: memScope,
      });

      result.imported++;
      result.details.push({
        action: "imported",
        name: file.name,
        type: amemType,
      });
    }
  }

  return result;
}
