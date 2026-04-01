import path from "node:path";
import os from "node:os";
import fs from "node:fs";

export interface HookConfig {
  captureToolUse: boolean;
  captureSessionEnd: boolean;
}

/** Check if a hook entry was created by amem (by inspecting nested hooks[].command) */
function isAmemHookEntry(entry: Record<string, unknown>): boolean {
  const nested = entry.hooks as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(nested)) {
    return nested.some(h => String(h.command ?? "").includes("amem"));
  }
  // Legacy flat format
  return String(entry.command ?? "").includes("amem") || String(entry.description ?? "").includes("amem:");
}

/**
 * Generate Claude Code hook configuration for automatic memory capture.
 *
 * Claude Code hooks format:
 * { "PostToolUse": [{ "matcher": "", "hooks": [{ "type": "command", "command": "..." }] }] }
 */
export function generateHooksConfig(config: HookConfig): Record<string, unknown[]> {
  const hooks: Record<string, unknown[]> = {};

  if (config.captureToolUse) {
    hooks.PostToolUse = [{
      matcher: "",  // Match all tools — the script filters internally
      hooks: [{
        type: "command",
        command: getPostToolUseCommand(),
        timeout: 10000,
      }],
    }];
  }

  if (config.captureSessionEnd) {
    hooks.Stop = [{
      matcher: "",
      hooks: [{
        type: "command",
        command: getStopCommand(),
        timeout: 15000,
      }],
    }];
  }

  return hooks;
}

function getPostToolUseCommand(): string {
  const scriptPath = getHookScriptPath("post-tool-use.mjs");
  return `node "${scriptPath}"`;
}

function getStopCommand(): string {
  const scriptPath = getHookScriptPath("session-end.mjs");
  return `node "${scriptPath}"`;
}

function getHookScriptPath(name: string): string {
  const amemDir = process.env.AMEM_DIR || path.join(os.homedir(), ".amem");
  return path.join(amemDir, "hooks", name);
}

/**
 * Install hook scripts to ~/.amem/hooks/ and configure Claude Code settings.
 */
export function installHooks(config: HookConfig): { installed: string[]; configPath: string } {
  const amemDir = process.env.AMEM_DIR || path.join(os.homedir(), ".amem");
  const hooksDir = path.join(amemDir, "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });

  const installed: string[] = [];
  const dbPath = process.env.AMEM_DB || path.join(amemDir, "memory.db");

  if (config.captureToolUse) {
    const scriptPath = path.join(hooksDir, "post-tool-use.mjs");
    fs.writeFileSync(scriptPath, getPostToolUseScript(dbPath));
    if (process.platform !== "win32") fs.chmodSync(scriptPath, 0o755);
    installed.push("post-tool-use.mjs");
  }

  if (config.captureSessionEnd) {
    const scriptPath = path.join(hooksDir, "session-end.mjs");
    fs.writeFileSync(scriptPath, getSessionEndScript(dbPath));
    if (process.platform !== "win32") fs.chmodSync(scriptPath, 0o755);
    installed.push("session-end.mjs");
  }

  // Update Claude Code settings.json with hook configuration
  const claudeDir = path.join(os.homedir(), ".claude");
  const settingsPath = path.join(claudeDir, "settings.json");

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      const raw = fs.readFileSync(settingsPath, "utf-8").trim();
      if (raw) settings = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // Start fresh if corrupted
    }
  }

  const hooksConfig = generateHooksConfig(config);
  const existingHooks = (settings.hooks ?? {}) as Record<string, unknown[]>;

  // Merge amem hooks with existing hooks (don't overwrite user hooks)
  for (const [event, newHooks] of Object.entries(hooksConfig)) {
    const existing = (existingHooks[event] ?? []) as Array<Record<string, unknown>>;
    // Remove any previous amem hooks (detect by command containing "amem" in nested hooks array)
    const filtered = existing.filter(h => !isAmemHookEntry(h));
    existingHooks[event] = [...filtered, ...newHooks];
  }

  settings.hooks = existingHooks;
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");

  return { installed, configPath: settingsPath };
}

/**
 * Remove amem hooks from Claude Code settings and delete hook scripts.
 */
export function uninstallHooks(): { removed: string[] } {
  const amemDir = process.env.AMEM_DIR || path.join(os.homedir(), ".amem");
  const hooksDir = path.join(amemDir, "hooks");
  const removed: string[] = [];

  for (const name of ["post-tool-use.mjs", "session-end.mjs"]) {
    const scriptPath = path.join(hooksDir, name);
    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath);
      removed.push(name);
    }
  }

  // Remove amem hooks from Claude Code settings
  const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
  if (fs.existsSync(settingsPath)) {
    try {
      const raw = fs.readFileSync(settingsPath, "utf-8").trim();
      if (raw) {
        const settings = JSON.parse(raw) as Record<string, unknown>;
        const hooks = (settings.hooks ?? {}) as Record<string, Array<Record<string, unknown>>>;
        for (const event of Object.keys(hooks)) {
          hooks[event] = hooks[event].filter(h => !isAmemHookEntry(h));
          if (hooks[event].length === 0) delete hooks[event];
        }
        settings.hooks = hooks;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
      }
    } catch {
      // Can't parse settings — skip
    }
  }

  return { removed };
}

// ── Hook Script Templates ──────────────────────────────

function getPostToolUseScript(dbPath: string): string {
  const escaped = dbPath.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `#!/usr/bin/env node
// amem PostToolUse hook - captures tool observations for persistent memory
// Auto-generated by amem. Do not edit manually.

import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const toolName = process.env.TOOL_NAME || '';
const toolInput = process.env.TOOL_INPUT || '';

// Skip amem's own tools to avoid infinite loops
if (toolName.startsWith('memory_') || toolName.startsWith('reminder_')) {
  process.exit(0);
}

// Skip noisy/low-value tools
const SKIP_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS', 'Bash']);
if (SKIP_TOOLS.has(toolName)) {
  process.exit(0);
}

if (!toolName || !toolInput || toolInput.length < 10) {
  process.exit(0);
}

try {
  const require = createRequire(import.meta.url);
  const Database = require('better-sqlite3');
  const db = new Database('${escaped}');
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 2000');

  const id = randomUUID();
  const now = Date.now();
  const sessionId = process.env.CLAUDE_SESSION_ID || 'hook-' + new Date().toISOString().slice(0, 10);
  const project = process.env.AMEM_PROJECT || 'global';

  const content = 'Tool: ' + toolName + '\\nInput: ' + toolInput.slice(0, 500);
  const metadata = JSON.stringify({ hook: 'PostToolUse', tool: toolName });

  db.prepare(
    'INSERT INTO conversation_log (id, session_id, role, content, timestamp, project, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, sessionId, 'system', content, now, project, metadata);

  db.close();
} catch {
  process.exit(0);
}
`;
}

function getSessionEndScript(dbPath: string): string {
  const escaped = dbPath.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `#!/usr/bin/env node
// amem Stop hook - auto-summarizes session from conversation log
// Auto-generated by amem. Do not edit manually.

import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

try {
  const require = createRequire(import.meta.url);
  const Database = require('better-sqlite3');
  const db = new Database('${escaped}');
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 2000');

  const now = Date.now();
  const sessionId = process.env.CLAUDE_SESSION_ID || 'hook-' + new Date().toISOString().slice(0, 10);
  const project = process.env.AMEM_PROJECT || 'global';

  // Log the session end marker
  db.prepare(
    'INSERT INTO conversation_log (id, session_id, role, content, timestamp, project, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(randomUUID(), sessionId, 'system', '[SESSION_END]', now, project, JSON.stringify({ hook: 'Stop' }));

  // Auto-summarize: analyze this session's log entries
  const entries = db.prepare(
    'SELECT role, content, metadata FROM conversation_log WHERE session_id = ? ORDER BY timestamp ASC'
  ).all(sessionId);

  if (entries.length < 3) { db.close(); process.exit(0); }

  // Extract signals from the session
  const decisions = [];
  const corrections = [];
  const tools = new Set();
  let memoriesStored = 0;

  for (const e of entries) {
    const content = (e.content || '').toLowerCase();
    const meta = JSON.parse(e.metadata || '{}');

    // Count tool observations
    if (meta.tool) tools.add(meta.tool);

    // Detect memory storage events
    if (meta.tool === 'memory_store' || meta.tool === 'memory_extract') memoriesStored++;

    // Detect decisions (heuristic: contains decision keywords in assistant messages)
    if (e.role === 'assistant' && (content.includes('decided') || content.includes('chose') || content.includes('going with') || content.includes('decision'))) {
      const snippet = e.content.slice(0, 120);
      if (snippet.length > 20) decisions.push(snippet);
    }

    // Detect corrections (heuristic: user says don't/never/wrong/instead)
    if (e.role === 'user' && (content.includes("don't") || content.includes('never') || content.includes('wrong') || content.includes('instead') || content.includes('no,') || content.includes('actually'))) {
      const snippet = e.content.slice(0, 120);
      if (snippet.length > 10) corrections.push(snippet);
    }
  }

  const toolList = [...tools].slice(0, 10).join(', ') || 'none observed';
  const summary = 'Session with ' + entries.length + ' exchanges. Tools used: ' + toolList + '.';

  // Store the summary (upsert)
  try {
    db.prepare(
      'INSERT OR REPLACE INTO session_summaries (id, session_id, summary, key_decisions, key_corrections, memories_extracted, project, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      randomUUID(), sessionId, summary,
      JSON.stringify(decisions.slice(0, 10)),
      JSON.stringify(corrections.slice(0, 10)),
      memoriesStored, project, now
    );
  } catch {
    // session_summaries table might not exist yet in older DBs
  }

  db.close();
} catch {
  process.exit(0);
}
`;
}
