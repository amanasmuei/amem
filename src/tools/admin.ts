import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  type AmemDatabase,
  type AmemConfig,
  AmemConfigSchema,
  RESTART_REQUIRED_CONFIG_KEYS,
  DANGEROUS_CONFIG_KEYS,
  runDiagnostics,
  generateEmbedding,
  loadConfig,
  saveConfig,
  getDefaultConfig,
  getConfigPath,
  resetConfigCache,
  syncFromClaude,
  exportForTeam,
  importFromTeam,
  syncToCopilot,
} from "@aman_asmuei/amem-core";

// ── Helpers ──────────────────────────────────────────────

/**
 * Create a timestamped backup of the DB file before any mutating repair.
 * Reuses amem's existing backups/ directory convention.
 * Returns the backup path, or null if the DB file doesn't exist.
 */
function createPreRepairBackup(dbPath: string): string | null {
  if (!fs.existsSync(dbPath)) return null;
  const backupDir = path.join(path.dirname(dbPath), "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `memory-prerepair-${Date.now()}.db`);
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}

/**
 * Run SQLite's integrity_check against a read-only second connection.
 * Safe to call while the main amem server has the DB open (WAL mode allows concurrent readers).
 */
function runIntegrityCheck(dbPath: string): { ok: boolean; details: string[] } {
  try {
    const ro = new Database(dbPath, { readonly: true, fileMustExist: true });
    const rows = ro.pragma("integrity_check") as { integrity_check: string }[];
    ro.close();
    const details = rows.map(r => r.integrity_check);
    return { ok: details.length === 1 && details[0] === "ok", details };
  } catch (err) {
    return { ok: false, details: [err instanceof Error ? err.message : String(err)] };
  }
}

/**
 * Find relation edges whose fromId or toId no longer exist in memories.
 */
function findOrphanRelations(db: AmemDatabase): { id: string; fromId: string; toId: string; reason: string }[] {
  const orphans: { id: string; fromId: string; toId: string; reason: string }[] = [];
  const relations = db.getAllRelations();
  const existingIds = new Set(db.getAll().map(m => m.id));
  for (const r of relations) {
    const missingFrom = !existingIds.has(r.fromId);
    const missingTo = !existingIds.has(r.toId);
    if (missingFrom || missingTo) {
      orphans.push({
        id: r.id,
        fromId: r.fromId,
        toId: r.toId,
        reason: [missingFrom && "fromId missing", missingTo && "toId missing"].filter(Boolean).join(", "),
      });
    }
  }
  return orphans;
}

// ── Config helpers ──────────────────────────────────────
// AmemConfigSchema, RESTART_REQUIRED_CONFIG_KEYS, and DANGEROUS_CONFIG_KEYS
// are imported from amem-core — single source of truth. Keep only the
// path-walking and diff helpers here; they're MCP-tool-specific.

/**
 * Walk a dot-path into a plain object. Returns undefined if any segment is missing.
 */
function getByPath(obj: unknown, dotPath: string): unknown {
  if (dotPath === "") return obj;
  const parts = dotPath.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/**
 * Immutably set a value at a dot-path, returning a new object.
 * Throws if an intermediate segment is not an object.
 */
function setByPath<T extends object>(obj: T, dotPath: string, value: unknown): T {
  const parts = dotPath.split(".");
  const clone = structuredClone(obj) as Record<string, unknown>;
  let cur: Record<string, unknown> = clone;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = cur[key];
    if (next === null || typeof next !== "object" || Array.isArray(next)) {
      throw new Error(`Path segment "${parts.slice(0, i + 1).join(".")}" is not an object`);
    }
    const nextClone = { ...(next as Record<string, unknown>) };
    cur[key] = nextClone;
    cur = nextClone;
  }
  cur[parts[parts.length - 1]] = value;
  return clone as T;
}

/**
 * Back up config.json before mutation. Returns backup path, or null if file doesn't exist.
 */
function backupConfig(): string | null {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return null;
  const backupPath = `${configPath}.prerepair-${Date.now()}.bak`;
  fs.copyFileSync(configPath, backupPath);
  return backupPath;
}

/**
 * Compute a shallow diff between two configs at leaf paths.
 */
function diffConfig(before: AmemConfig, after: AmemConfig): Array<{ key: string; from: unknown; to: unknown }> {
  const diffs: Array<{ key: string; from: unknown; to: unknown }> = [];
  function walk(a: unknown, b: unknown, prefix: string): void {
    if (typeof a !== "object" || a === null || Array.isArray(a) ||
        typeof b !== "object" || b === null || Array.isArray(b)) {
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        diffs.push({ key: prefix, from: a, to: b });
      }
      return;
    }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k);
    }
  }
  walk(before, after, "");
  return diffs;
}

// ── Registration ─────────────────────────────────────────

export function registerAdminTools(
  server: McpServer,
  db: AmemDatabase,
  dbPath: string,
): void {

  // ── memory_doctor (read-only) ──────────────────────────
  server.registerTool(
    "memory_doctor",
    {
      title: "Diagnose Memory Store",
      description: `Run read-only health diagnostics on the amem database.

Reports:
  - Total memories, embedding coverage, stale count, orphaned graph nodes
  - Core tier token budget usage
  - SQLite integrity_check result
  - A list of issues with severity (info/warning/critical) and suggested fixes

This tool is completely safe — it never mutates the database. Use the output
to decide whether to call memory_repair with specific actions.

Returns:
  Structured diagnostic report with status, stats, and issues.`,
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const report = runDiagnostics(db);
        const integrity = runIntegrityCheck(dbPath);

        const lines: string[] = [
          `# Memory Doctor Report`,
          ``,
          `**Status:** ${report.status}`,
          `**Integrity:** ${integrity.ok ? "ok" : "FAILED — " + integrity.details.join("; ")}`,
          ``,
          `## Stats`,
          `- Total memories: ${report.stats.totalMemories}`,
          `- Embedding coverage: ${report.stats.embeddingCoverage}%`,
          `- Core tier: ${report.stats.coreTierTokens} / ${report.stats.coreTierBudget} tokens`,
          `- Stale memories: ${report.stats.staleCount}`,
          `- Orphaned graph nodes: ${report.stats.orphanedGraphNodes}`,
          `- Graph edges: ${report.stats.graphEdges}`,
          `- Overdue reminders: ${report.stats.remindersOverdue}`,
          ``,
          `## By Type`,
          ...Object.entries(report.stats.byType).map(([t, n]) => `- ${t}: ${n}`),
        ];

        if (report.issues.length > 0) {
          lines.push(``, `## Issues (${report.issues.length})`);
          for (const issue of report.issues) {
            lines.push(`- [${issue.severity.toUpperCase()}] ${issue.type}: ${issue.message}`);
            lines.push(`  → ${issue.suggestion}`);
          }
        } else {
          lines.push(``, `## Issues`, `None — all checks passed.`);
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: {
            status: report.status,
            integrity: { ok: integrity.ok, details: integrity.details },
            stats: report.stats,
            issues: report.issues,
          },
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error running diagnostics: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );

  // ── memory_repair (dry-run by default) ─────────────────
  server.registerTool(
    "memory_repair",
    {
      title: "Repair Memory Store",
      description: `Perform safe, targeted repairs on the amem database.

Args:
  - actions (array): Which repairs to perform. Supported:
      * "integrity_check"       — read-only SQLite PRAGMA integrity_check
      * "backfill_embeddings"   — generate embeddings for memories missing them
      * "clean_orphan_relations"— delete graph edges pointing to missing memories
  - dryRun (boolean): If true (DEFAULT), report what WOULD change without
                      touching the database. Set to false to actually apply.
  - limit (number, optional): Cap the number of items processed per action (default 100).

Safety:
  - Dry-run is the default. You must explicitly pass dryRun:false to mutate.
  - Before any mutation, a timestamped backup is written to <amem>/backups/
    with filename memory-prerepair-<timestamp>.db
  - Catastrophic corruption (integrity_check fails on the main DB) is NOT
    handled here — stop the MCP server and run 'amem repair' from the CLI.

Returns:
  Per-action report of what was found and what changed, plus the backup path if created.`,
      inputSchema: z.object({
        actions: z.array(
          z.enum(["integrity_check", "backfill_embeddings", "clean_orphan_relations"])
        ).min(1).describe("Which repair actions to run"),
        dryRun: z.boolean().default(true).describe("If true, report without mutating. DEFAULT: true."),
        limit: z.number().int().positive().max(1000).default(100).describe("Max items per action"),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ actions, dryRun, limit }) => {
      try {
        const results: Record<string, unknown> = {};
        let backupPath: string | null = null;

        // Determine if any requested action is mutating
        const mutating = !dryRun && actions.some(a => a !== "integrity_check");
        if (mutating) {
          backupPath = createPreRepairBackup(dbPath);
        }

        // ── integrity_check (always read-only) ──
        if (actions.includes("integrity_check")) {
          const r = runIntegrityCheck(dbPath);
          results.integrity_check = r;
        }

        // ── clean_orphan_relations ──
        if (actions.includes("clean_orphan_relations")) {
          const orphans = findOrphanRelations(db).slice(0, limit);
          let removed = 0;
          if (!dryRun) {
            for (const o of orphans) {
              db.removeRelation(o.id);
              removed++;
            }
          }
          results.clean_orphan_relations = {
            found: orphans.length,
            removed,
            dryRun,
            sample: orphans.slice(0, 10),
          };
        }

        // ── backfill_embeddings ──
        if (actions.includes("backfill_embeddings")) {
          const all = db.getAll();
          const missing = all.filter(m => !m.embedding).slice(0, limit);
          let filled = 0;
          const filledIds: string[] = [];
          if (!dryRun) {
            for (const mem of missing) {
              const emb = await generateEmbedding(mem.content);
              if (!emb) break; // embeddings unavailable — stop cleanly
              db.updateEmbedding(mem.id, emb);
              filledIds.push(mem.id);
              filled++;
            }
          }
          results.backfill_embeddings = {
            found: missing.length,
            filled,
            dryRun,
            sampleIds: (dryRun ? missing.map(m => m.id) : filledIds).slice(0, 10),
          };
        }

        // ── Format text output ──
        const lines: string[] = [
          `# Memory Repair Report`,
          ``,
          `**Mode:** ${dryRun ? "DRY RUN (no changes written)" : "APPLIED"}`,
        ];
        if (backupPath) lines.push(`**Backup:** ${backupPath}`);
        lines.push(``);

        for (const action of actions) {
          const r = results[action] as Record<string, unknown>;
          lines.push(`## ${action}`);
          lines.push("```json");
          lines.push(JSON.stringify(r, null, 2));
          lines.push("```");
          lines.push("");
        }

        if (dryRun && mutating === false && actions.some(a => a !== "integrity_check")) {
          lines.push(`_To apply these changes, re-run with dryRun: false._`);
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: {
            dryRun,
            backupPath,
            results,
          },
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error during repair: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );

  // ── memory_config (get/set with dry-run + whitelist) ──
  server.registerTool(
    "memory_config",
    {
      title: "Get / Set Amem Configuration",
      description: `Read or modify the amem configuration file with safety guardrails.

Args:
  - action (enum): "list" | "get" | "set" | "reset"
      * "list"  — return the full effective config (no other args needed)
      * "get"   — return a single value at the given key (requires 'key')
      * "set"   — set a single value at the given key (requires 'key' + 'value')
      * "reset" — reset a single key to its default (requires 'key'), or
                  the ENTIRE config if key is omitted AND confirm:true is passed
  - key (string, optional): Dot-path into config, e.g. "retrieval.semanticWeight"
  - value (any, optional): New value for 'set' — must match the expected type
  - dryRun (boolean): If true (DEFAULT for set/reset), report what WOULD change
                      without writing. Set to false to apply.
  - confirm (boolean): Required for full-config reset. Ignored otherwise.
  - force (boolean): Required to modify "dangerous" keys (embeddingDimensions)
                     that would corrupt existing data. Default false.

Safety:
  - Only whitelisted keys are accepted — every value is validated against a
    Zod schema mirroring AmemConfig. Unknown keys, wrong types, or out-of-range
    values (weights must be 0..1, etc.) are rejected.
  - Regex patterns in privacy.redactPatterns are compiled before save.
  - Before any write, config.json is backed up to
    <amem>/config.json.prerepair-<timestamp>.bak
  - Dangerous keys (embeddingDimensions) require force:true — changing them
    would invalidate every stored embedding.
  - Some keys (embeddingModel, embeddingCacheSize) require an amem server
    restart to take effect; the response will flag this.

Returns:
  Before/after diff, restart-required warnings, and the backup path if created.`,
      inputSchema: z.object({
        action: z.enum(["list", "get", "set", "reset"]),
        key: z.string().optional().describe("Dot-path into config, e.g. 'retrieval.rerankerEnabled'"),
        value: z.unknown().optional().describe("New value for 'set'"),
        dryRun: z.boolean().default(true).describe("If true, report without writing. DEFAULT: true."),
        confirm: z.boolean().default(false).describe("Required for full-config reset"),
        force: z.boolean().default(false).describe("Required for dangerous keys like embeddingDimensions"),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ action, key, value, dryRun, confirm, force }) => {
      try {
        const current = loadConfig();
        const configPath = getConfigPath();

        // ── list ──
        if (action === "list") {
          return {
            content: [{
              type: "text" as const,
              text: `# Amem Config\n\n**Path:** ${configPath}\n\n\`\`\`json\n${JSON.stringify(current, null, 2)}\n\`\`\``,
            }],
            structuredContent: { configPath, config: current },
          };
        }

        // ── get ──
        if (action === "get") {
          if (!key) {
            return { isError: true, content: [{ type: "text" as const, text: `Error: 'get' requires 'key'` }] };
          }
          const val = getByPath(current, key);
          if (val === undefined) {
            return { isError: true, content: [{ type: "text" as const, text: `Error: unknown key "${key}"` }] };
          }
          return {
            content: [{ type: "text" as const, text: `**${key}** = ${JSON.stringify(val)}` }],
            structuredContent: { key, value: val },
          };
        }

        // ── set ──
        if (action === "set") {
          if (!key) {
            return { isError: true, content: [{ type: "text" as const, text: `Error: 'set' requires 'key'` }] };
          }
          if (value === undefined) {
            return { isError: true, content: [{ type: "text" as const, text: `Error: 'set' requires 'value'` }] };
          }

          // Reject unknown keys early
          if (getByPath(current, key) === undefined) {
            return { isError: true, content: [{ type: "text" as const, text: `Error: unknown key "${key}"` }] };
          }

          // Dangerous key gate
          const topKey = key.split(".")[0];
          if ((DANGEROUS_CONFIG_KEYS.has(key) || DANGEROUS_CONFIG_KEYS.has(topKey)) && !force) {
            return {
              isError: true,
              content: [{
                type: "text" as const,
                text: `Error: "${key}" is a dangerous key — changing it would corrupt existing embeddings. Pass force:true to override (not recommended).`,
              }],
            };
          }

          // Build candidate and validate whole config
          let candidate: AmemConfig;
          try {
            candidate = setByPath(current, key, value);
          } catch (e) {
            return {
              isError: true,
              content: [{ type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
            };
          }
          const parsed = AmemConfigSchema.safeParse(candidate);
          if (!parsed.success) {
            return {
              isError: true,
              content: [{
                type: "text" as const,
                text: `Validation failed:\n${parsed.error.issues.map(i => `  - ${i.path.join(".")}: ${i.message}`).join("\n")}`,
              }],
            };
          }

          const diffs = diffConfig(current, parsed.data);
          const restartKeys = diffs
            .map(d => d.key)
            .filter(k => RESTART_REQUIRED_CONFIG_KEYS.has(k) || RESTART_REQUIRED_CONFIG_KEYS.has(k.split(".")[0]));

          let backupPath: string | null = null;
          if (!dryRun && diffs.length > 0) {
            backupPath = backupConfig();
            saveConfig(parsed.data);
            resetConfigCache();
          }

          const lines: string[] = [
            `# Config ${dryRun ? "DRY RUN" : "UPDATED"}`,
            ``,
            `**Mode:** ${dryRun ? "DRY RUN (no changes written)" : "APPLIED"}`,
          ];
          if (backupPath) lines.push(`**Backup:** ${backupPath}`);
          lines.push(``, `## Changes`);
          if (diffs.length === 0) {
            lines.push(`_No change — value is already ${JSON.stringify(value)}._`);
          } else {
            for (const d of diffs) {
              lines.push(`- **${d.key}**: ${JSON.stringify(d.from)} → ${JSON.stringify(d.to)}`);
            }
          }
          if (restartKeys.length > 0) {
            lines.push(``, `⚠ **Restart required** for these keys to fully take effect: ${restartKeys.join(", ")}`);
          }
          if (dryRun && diffs.length > 0) {
            lines.push(``, `_To apply, re-run with dryRun: false._`);
          }

          return {
            content: [{ type: "text" as const, text: lines.join("\n") }],
            structuredContent: { dryRun, backupPath, diffs, restartRequired: restartKeys },
          };
        }

        // ── reset ──
        if (action === "reset") {
          const defaults = getDefaultConfig();

          // Full-config reset requires explicit confirm
          if (!key) {
            if (!confirm) {
              return {
                isError: true,
                content: [{
                  type: "text" as const,
                  text: `Error: full-config reset requires confirm:true. To reset a single key, pass 'key'.`,
                }],
              };
            }
            const diffs = diffConfig(current, defaults);
            let backupPath: string | null = null;
            if (!dryRun && diffs.length > 0) {
              backupPath = backupConfig();
              saveConfig(defaults);
              resetConfigCache();
            }
            const lines = [
              `# Config ${dryRun ? "DRY RUN — FULL RESET" : "FULL RESET APPLIED"}`,
              ``,
              backupPath ? `**Backup:** ${backupPath}` : ``,
              ``,
              `## Changes (${diffs.length})`,
              ...diffs.map(d => `- **${d.key}**: ${JSON.stringify(d.from)} → ${JSON.stringify(d.to)}`),
            ].filter(Boolean);
            if (dryRun && diffs.length > 0) lines.push(``, `_To apply, re-run with dryRun: false._`);
            return {
              content: [{ type: "text" as const, text: lines.join("\n") }],
              structuredContent: { dryRun, backupPath, diffs, fullReset: true },
            };
          }

          // Single-key reset
          const defaultVal = getByPath(defaults, key);
          if (defaultVal === undefined) {
            return { isError: true, content: [{ type: "text" as const, text: `Error: unknown key "${key}"` }] };
          }
          const topKey = key.split(".")[0];
          if ((DANGEROUS_CONFIG_KEYS.has(key) || DANGEROUS_CONFIG_KEYS.has(topKey)) && !force) {
            return {
              isError: true,
              content: [{ type: "text" as const, text: `Error: "${key}" is a dangerous key — pass force:true to override.` }],
            };
          }

          const candidate = setByPath(current, key, defaultVal);
          const parsed = AmemConfigSchema.safeParse(candidate);
          if (!parsed.success) {
            return {
              isError: true,
              content: [{
                type: "text" as const,
                text: `Validation failed:\n${parsed.error.issues.map(i => `  - ${i.path.join(".")}: ${i.message}`).join("\n")}`,
              }],
            };
          }
          const diffs = diffConfig(current, parsed.data);
          let backupPath: string | null = null;
          if (!dryRun && diffs.length > 0) {
            backupPath = backupConfig();
            saveConfig(parsed.data);
            resetConfigCache();
          }
          const lines = [
            `# Config ${dryRun ? "DRY RUN" : "RESET"}: ${key}`,
            ``,
            backupPath ? `**Backup:** ${backupPath}` : ``,
            ``,
            diffs.length === 0
              ? `_Already at default (${JSON.stringify(defaultVal)})._`
              : diffs.map(d => `- **${d.key}**: ${JSON.stringify(d.from)} → ${JSON.stringify(d.to)}`).join("\n"),
          ].filter(Boolean);
          if (dryRun && diffs.length > 0) lines.push(``, `_To apply, re-run with dryRun: false._`);
          return {
            content: [{ type: "text" as const, text: lines.join("\n") }],
            structuredContent: { dryRun, backupPath, diffs, key, resetTo: defaultVal },
          };
        }

        return {
          isError: true,
          content: [{ type: "text" as const, text: `Unknown action: ${action as string}` }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error in memory_config: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );

  // ── memory_sync (cross-system import/export) ──────────
  server.registerTool(
    "memory_sync",
    {
      title: "Sync Memory Across Systems",
      description: `Import or export memories between amem and other systems.

Supported flows:
  - source="claude"   direction="in"  — import Claude Code auto-memory into amem
  - source="copilot"  direction="out" — write amem section into .github/copilot-instructions.md
  - source="team"     direction="out" — export a team-shareable JSON file
  - source="team"     direction="in"  — import a teammate's exported JSON file

Args:
  - source (enum): "claude" | "copilot" | "team"
  - direction (enum): "in" | "out" (only certain combinations are valid — see above)
  - dryRun (boolean): If true (DEFAULT), preview without writing. Set to false to apply.
  - projectFilter (string, optional): For source="claude" direction="in", only sync
      projects whose path contains this substring.
  - filePath (string, optional): For source="team":
      * direction="out": output directory (default: <amem>/team-exports/)
      * direction="in":  path to the exported JSON file (REQUIRED)
  - userId (string, optional): For source="team" direction="out", tag the export
      with this user id (REQUIRED for team export).
  - minConfidence (number, optional): For source="copilot" or "team" direction="out",
      only export memories at or above this confidence (0..1).
  - projectDir (string, optional): For source="copilot" direction="out", target
      project directory (default: current working directory).

Safety:
  - Dry-run is the default for ALL directions. You must explicitly pass dryRun:false.
  - Before any amem DB write (claude-in, team-in), the current DB file is copied to
    <amem>/backups/memory-prerepair-<timestamp>.db
  - Imports are idempotent — running twice does not duplicate memories (content
    hashes are checked).
  - Team imports lower confidence by 0.1 and tag memories with team-sync + from:<user>.
  - Claude imports are tagged with claude-sync and the original Claude type.
  - Copilot output wraps the amem section in <!-- amem:start/end --> markers,
    preserving any existing non-amem content in copilot-instructions.md.

Returns:
  Per-source report with counts, affected items, and the backup path if created.`,
      inputSchema: z.object({
        source: z.enum(["claude", "copilot", "team"]),
        direction: z.enum(["in", "out"]),
        dryRun: z.boolean().default(true).describe("If true, preview without writing. DEFAULT: true."),
        projectFilter: z.string().optional().describe("For claude-in: restrict to projects matching this substring"),
        filePath: z.string().optional().describe("For team-in: path to import file. For team-out: output directory."),
        userId: z.string().optional().describe("For team-out: required user identifier"),
        minConfidence: z.number().min(0).max(1).optional().describe("Minimum confidence filter for exports"),
        projectDir: z.string().optional().describe("For copilot-out: target project directory"),
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true, // Idempotent by content hash on 2nd run
        openWorldHint: true,  // Touches filesystem outside the amem dir
      },
    },
    async ({ source, direction, dryRun, projectFilter, filePath, userId, minConfidence, projectDir }) => {
      try {
        // Validate source/direction combinations up front
        const combo = `${source}/${direction}`;
        const valid = new Set(["claude/in", "copilot/out", "team/in", "team/out"]);
        if (!valid.has(combo)) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: `Error: unsupported combination source=${source} direction=${direction}. Valid: claude/in, copilot/out, team/in, team/out.`,
            }],
          };
        }

        // Pre-write backup for any flow that mutates the amem DB (claude-in, team-in)
        let backupPath: string | null = null;
        const mutatesDb = !dryRun && (combo === "claude/in" || combo === "team/in");
        if (mutatesDb) {
          backupPath = createPreRepairBackup(dbPath);
        }

        // ── claude/in ──
        if (combo === "claude/in") {
          const result = await syncFromClaude(db, projectFilter, dryRun);
          const lines = [
            `# Sync: Claude → amem`,
            ``,
            `**Mode:** ${dryRun ? "DRY RUN" : "APPLIED"}`,
          ];
          if (backupPath) lines.push(`**Backup:** ${backupPath}`);
          lines.push(
            ``,
            `- Projects scanned: ${result.projectsScanned}`,
            `- Imported: ${result.imported}`,
            `- Skipped: ${result.skipped}`,
            ``,
          );
          if (result.details.length > 0) {
            lines.push(`## Details (first 20)`);
            for (const d of result.details.slice(0, 20)) {
              lines.push(`- [${d.action}] ${d.name} (${d.type})${d.reason ? ` — ${d.reason}` : ""}`);
            }
          }
          if (dryRun && result.imported > 0) {
            lines.push(``, `_To apply, re-run with dryRun: false._`);
          }
          return {
            content: [{ type: "text" as const, text: lines.join("\n") }],
            structuredContent: { source, direction, dryRun, backupPath, result },
          };
        }

        // ── team/out ──
        if (combo === "team/out") {
          if (!userId) {
            return {
              isError: true,
              content: [{ type: "text" as const, text: `Error: team/out requires userId` }],
            };
          }
          const outDir = filePath ?? path.join(path.dirname(dbPath), "team-exports");
          if (dryRun) {
            // Count what would be exported without writing
            const all = db.getAll();
            const allowed = ["correction", "decision", "pattern", "topology", "fact"];
            const wouldExport = all.filter(m => {
              if (m.type === "preference" && m.scope !== "global") return false;
              if (!allowed.includes(m.type)) return false;
              if (minConfidence !== undefined && m.confidence < minConfidence) return false;
              return true;
            });
            return {
              content: [{
                type: "text" as const,
                text: `# Sync: amem → team (DRY RUN)\n\n**Would export:** ${wouldExport.length} memories to ${outDir}\n\n_To apply, re-run with dryRun: false._`,
              }],
              structuredContent: { source, direction, dryRun, wouldExport: wouldExport.length, outDir },
            };
          }
          const { file, count } = await exportForTeam(db, outDir, { userId, minConfidence });
          return {
            content: [{
              type: "text" as const,
              text: `# Sync: amem → team\n\n**Exported:** ${count} memories\n**File:** ${file}`,
            }],
            structuredContent: { source, direction, dryRun, file, count },
          };
        }

        // ── team/in ──
        if (combo === "team/in") {
          if (!filePath) {
            return {
              isError: true,
              content: [{ type: "text" as const, text: `Error: team/in requires filePath (path to exported JSON)` }],
            };
          }
          if (!fs.existsSync(filePath)) {
            return {
              isError: true,
              content: [{ type: "text" as const, text: `Error: file not found: ${filePath}` }],
            };
          }
          const result = await importFromTeam(db, filePath, { dryRun });
          const lines = [
            `# Sync: team → amem`,
            ``,
            `**Mode:** ${dryRun ? "DRY RUN" : "APPLIED"}`,
            `**From:** ${result.from}`,
          ];
          if (backupPath) lines.push(`**Backup:** ${backupPath}`);
          lines.push(
            ``,
            `- Imported: ${result.imported}`,
            `- Skipped (duplicates): ${result.skipped}`,
          );
          if (dryRun && result.imported > 0) {
            lines.push(``, `_To apply, re-run with dryRun: false._`);
          }
          return {
            content: [{ type: "text" as const, text: lines.join("\n") }],
            structuredContent: { source, direction, dryRun, backupPath, result },
          };
        }

        // ── copilot/out ──
        if (combo === "copilot/out") {
          const result = syncToCopilot(db, {
            projectDir,
            minConfidence,
            dryRun,
          });
          const lines = [
            `# Sync: amem → copilot-instructions.md`,
            ``,
            `**Mode:** ${dryRun ? "DRY RUN" : "APPLIED"}`,
            `**File:** ${result.file}`,
            ``,
            `## Sections`,
            `- Corrections: ${result.sections.corrections}`,
            `- Decisions: ${result.sections.decisions}`,
            `- Preferences: ${result.sections.preferences}`,
            `- Patterns: ${result.sections.patterns}`,
            `- Other: ${result.sections.other}`,
            ``,
            `**Total exported:** ${result.memoriesExported}`,
          ];
          if (dryRun && result.memoriesExported > 0) {
            lines.push(``, `_To apply, re-run with dryRun: false._`);
          }
          return {
            content: [{ type: "text" as const, text: lines.join("\n") }],
            structuredContent: { source, direction, dryRun, result },
          };
        }

        // Unreachable
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Unreachable: ${combo}` }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: `Error in memory_sync: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    },
  );
}
