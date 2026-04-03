import path from "node:path";
import os from "node:os";
import fs from "node:fs";

export interface HookConfig {
  captureToolUse: boolean;
  captureSessionEnd: boolean;
  captureSessionStart: boolean;
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

  if (config.captureSessionStart) {
    hooks.SessionStart = [{
      matcher: "",
      hooks: [{
        type: "command",
        command: getSessionStartCommand(),
        timeout: 10000,
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

function getSessionStartCommand(): string {
  const scriptPath = getHookScriptPath("session-start.mjs");
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

  if (config.captureSessionStart) {
    const scriptPath = path.join(hooksDir, "session-start.mjs");
    fs.writeFileSync(scriptPath, getSessionStartScript(dbPath));
    if (process.platform !== "win32") fs.chmodSync(scriptPath, 0o755);
    installed.push("session-start.mjs");
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

  for (const name of ["post-tool-use.mjs", "session-end.mjs", "session-start.mjs"]) {
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
// amem PostToolUse hook — enhanced passive capture with pattern detection
// Auto-generated by amem. Do not edit manually.

import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';

const toolName = process.env.TOOL_NAME || '';
const toolInput = process.env.TOOL_INPUT || '';
const toolOutput = process.env.TOOL_OUTPUT || '';

// Skip amem's own tools to avoid infinite loops
if (toolName.startsWith('memory_') || toolName.startsWith('reminder_')) {
  process.exit(0);
}

if (!toolName || !toolInput || toolInput.length < 10) {
  process.exit(0);
}

// ── Pattern detection for auto-extraction ──────────────────
// Detect memory-worthy signals from user messages in tool input
const CORRECTION_PATTERNS = [
  /\\b(?:don'?t|never|stop|wrong|incorrect|mistake|instead of)\\b/i,
  /\\b(?:always use|must use|should use|prefer|no,\\s|actually,?)\\b/i,
];

const DECISION_PATTERNS = [
  /\\b(?:let'?s go with|we'?ll use|decided to|choosing|went with|decision)\\b/i,
  /\\b(?:architecture|approach|strategy|design)\\b/i,
];

const PREFERENCE_PATTERNS = [
  /\\b(?:i prefer|i like|i want|please use|my preference|i always)\\b/i,
];

function detectMemorySignal(text) {
  const lower = text.toLowerCase();
  for (const p of CORRECTION_PATTERNS) {
    if (p.test(text)) return { type: 'correction', confidence: 0.7 };
  }
  for (const p of DECISION_PATTERNS) {
    if (p.test(text)) return { type: 'decision', confidence: 0.6 };
  }
  for (const p of PREFERENCE_PATTERNS) {
    if (p.test(text)) return { type: 'preference', confidence: 0.6 };
  }
  return null;
}

// ── Extractive compression for large observations ──────────
function compress(text, maxLen) {
  if (!text || text.length <= maxLen) return text || '';
  // Keep first and last portions, skip the middle
  const half = Math.floor(maxLen / 2) - 10;
  return text.slice(0, half) + '\\n[...compressed...]\\n' + text.slice(-half);
}

try {
  const require = createRequire(import.meta.url);
  const Database = require('better-sqlite3');
  const db = new Database('${escaped}');
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 2000');

  const now = Date.now();
  const sessionId = process.env.CLAUDE_SESSION_ID || 'hook-' + new Date().toISOString().slice(0, 10);
  const project = process.env.AMEM_PROJECT || 'global';

  // Compress large tool output for log storage (10x reduction target)
  const compressedOutput = compress(toolOutput, 500);
  const content = 'Tool: ' + toolName + '\\nInput: ' + compress(toolInput, 300) + (compressedOutput ? '\\nOutput: ' + compressedOutput : '');
  const metadata = JSON.stringify({ hook: 'PostToolUse', tool: toolName, inputLen: toolInput.length, outputLen: toolOutput.length });

  // Log all tool uses (compressed)
  db.prepare(
    'INSERT INTO conversation_log (id, session_id, role, content, timestamp, project, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(randomUUID(), sessionId, 'system', content, now, project, metadata);

  // ── Auto-extract memories from detected patterns ──────────
  const signal = detectMemorySignal(toolInput);
  if (signal) {
    // Extract the key content — use first 500 chars of the input as the memory
    const memContent = toolInput.slice(0, 500).trim();
    const contentHash = createHash('sha256').update(memContent).digest('hex').slice(0, 16);

    // Check for duplicates by content hash (16-char prefix, matching insertMemory)
    const existing = db.prepare('SELECT id FROM memories WHERE content_hash = ?').get(contentHash);
    if (!existing) {
      const memId = randomUUID();
      db.prepare(
        'INSERT INTO memories (id, content, content_hash, type, tags, confidence, access_count, created_at, last_accessed, source, scope, valid_from, tier) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(memId, memContent, contentHash, signal.type, '["auto-captured"]', signal.confidence, 0, now, now, 'hook:PostToolUse', project, now, 'archival');
    }
  }

  db.close();
} catch {
  process.exit(0);
}
`;
}

function getSessionStartScript(dbPath: string): string {
  const escaped = dbPath.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `#!/usr/bin/env node
// amem SessionStart hook — auto-injects core memories at session start
// Auto-generated by amem. Do not edit manually.

import { createRequire } from 'node:module';

try {
  const require = createRequire(import.meta.url);
  const Database = require('better-sqlite3');
  const db = new Database('${escaped}');
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 2000');

  const now = Date.now();

  // Load core tier memories (always-on context)
  const coreMemories = db.prepare(
    "SELECT content, type, confidence FROM memories WHERE tier = 'core' AND (valid_until IS NULL OR valid_until > ?) ORDER BY CASE type WHEN 'correction' THEN 0 WHEN 'decision' THEN 1 ELSE 2 END, confidence DESC"
  ).all(now);

  // Load recent corrections (even if not in core tier)
  const corrections = db.prepare(
    "SELECT content, confidence FROM memories WHERE type = 'correction' AND tier != 'core' AND (valid_until IS NULL OR valid_until > ?) ORDER BY confidence DESC LIMIT 10"
  ).all(now);

  // Load overdue reminders
  const reminders = db.prepare(
    "SELECT content, due_at FROM reminders WHERE completed = 0 AND due_at IS NOT NULL AND due_at <= ? ORDER BY due_at ASC LIMIT 5"
  ).all(now);

  // Build injection context
  const lines = [];

  if (coreMemories.length > 0) {
    lines.push('## Core Context (always active)');
    for (const m of coreMemories) {
      const prefix = m.type === 'correction' ? 'CONSTRAINT' : m.type.toUpperCase();
      lines.push('- [' + prefix + '] ' + m.content);
    }
    lines.push('');
  }

  if (corrections.length > 0) {
    lines.push('## Active Corrections');
    for (const c of corrections) {
      lines.push('- ' + c.content);
    }
    lines.push('');
  }

  if (reminders.length > 0) {
    lines.push('## Overdue Reminders');
    for (const r of reminders) {
      const due = new Date(r.due_at).toISOString().slice(0, 10);
      lines.push('- [DUE ' + due + '] ' + r.content);
    }
    lines.push('');
  }

  db.close();

  if (lines.length > 0) {
    // Output to stdout — Claude Code captures this as context
    console.log('[amem] Session context loaded:');
    console.log(lines.join('\\n'));
  }
} catch {
  // Silent failure — don't block session start
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
import { randomUUID, createHash } from 'node:crypto';

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

  // ── Auto-extract memories using heuristic patterns ──────────
  const EXTRACT_PATTERNS = [
    { type: 'correction', confidence: 0.95, patterns: [
      /\\b(?:don'?t|never|stop|no,?\\s+(?:don'?t|never|not))\\b.*\\b(?:use|do|add|include|write|put|make|create)\\b/i,
      /\\b(?:always|must|should always|never ever)\\b.*\\b(?:use|do|add|include|write|make)\\b/i,
      /\\bthat'?s (?:wrong|incorrect|not right)\\b/i,
      /\\bno,?\\s+(?:that|this|it) (?:should|needs to|must)\\b/i,
    ]},
    { type: 'decision', confidence: 0.85, patterns: [
      /\\b(?:we (?:decided|chose|agreed)|let'?s (?:go with|use|stick with))\\b/i,
      /\\b(?:the (?:decision|approach|plan|strategy) is)\\b/i,
      /\\b(?:we'?re (?:going to|gonna)|we'll)\\b.*\\b(?:use|switch to|migrate to|adopt)\\b/i,
    ]},
    { type: 'preference', confidence: 0.80, patterns: [
      /\\b(?:i (?:prefer|like to|want(?:ed)? to|tend to))\\b/i,
      /\\bmy (?:preference|style|approach|convention) is\\b/i,
    ]},
    { type: 'pattern', confidence: 0.70, patterns: [
      /\\b(?:in this (?:project|repo|codebase)|our (?:convention|standard|pattern|practice))\\b/i,
      /\\bwe (?:usually|typically|always|normally)\\b/i,
    ]},
  ];

  const insertMem = db.prepare(
    'INSERT INTO memories (id, content, content_hash, type, tags, confidence, access_count, created_at, last_accessed, source, scope, valid_from, tier) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const checkHash = db.prepare('SELECT id FROM memories WHERE content_hash = ?');

  let autoExtracted = 0;
  for (const e of entries) {
    if (e.role !== 'user') continue;
    const text = (e.content || '').trim();
    if (text.length < 15) continue;

    for (const group of EXTRACT_PATTERNS) {
      let matched = false;
      for (const p of group.patterns) {
        if (p.test(text)) {
          matched = true;
          break;
        }
      }
      if (!matched) continue;

      const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
      if (checkHash.get(hash)) break; // Already stored

      insertMem.run(
        randomUUID(), text, hash, group.type,
        '["auto-extracted","hook"]', group.confidence,
        0, now, now, 'hook:SessionEnd', project, now, 'archival'
      );
      autoExtracted++;
      break; // One match per message
    }
  }

  const toolList = [...tools].slice(0, 10).join(', ') || 'none observed';
  const summary = 'Session with ' + entries.length + ' exchanges. Tools used: ' + toolList + '.' + (autoExtracted > 0 ? ' Auto-extracted ' + autoExtracted + ' memories.' : '');

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
