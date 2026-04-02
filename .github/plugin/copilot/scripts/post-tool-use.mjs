#!/usr/bin/env node
// amem postToolUse hook — captures tool observations into persistent memory

import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync, existsSync } from 'node:fs';

let input = '';
try {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  input = Buffer.concat(chunks).toString();
} catch {
  process.stdout.write('{}');
  process.exit(0);
}

let data;
try { data = JSON.parse(input); } catch { process.stdout.write('{}'); process.exit(0); }

// Handle both Claude Code format (tool_name) and Copilot format (toolName/tool_name)
const toolName = data.tool_name || data.toolName || '';
const toolInput = typeof data.tool_input === 'string'
  ? data.tool_input
  : typeof data.toolInput === 'string'
    ? data.toolInput
    : JSON.stringify(data.tool_input || data.toolInput || data.input || '');
const sessionId = data.session_id || data.sessionId || 'copilot-' + new Date().toISOString().slice(0, 10);

// Skip amem's own tools to avoid infinite loops
if (toolName.startsWith('memory_') || toolName.startsWith('reminder_')) {
  process.stdout.write('{}');
  process.exit(0);
}

// Skip noisy/low-value tools
const SKIP = new Set(['Read', 'Glob', 'Grep', 'LS', 'Bash', 'Write', 'Edit', 'read_file', 'write_file', 'search_files', 'list_directory']);
if (SKIP.has(toolName) || !toolName || toolInput.length < 10) {
  process.stdout.write('{}');
  process.exit(0);
}

try {
  const amemDir = process.env.AMEM_DIR || join(homedir(), '.amem');
  const dbPath = process.env.AMEM_DB || join(amemDir, 'memory.db');
  mkdirSync(amemDir, { recursive: true });

  if (!existsSync(dbPath)) { process.stdout.write('{}'); process.exit(0); }

  const require = createRequire(import.meta.url);
  const Database = require('better-sqlite3');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 2000');

  const content = 'Tool: ' + toolName + '\nInput: ' + toolInput.slice(0, 500);
  const metadata = JSON.stringify({ hook: 'postToolUse', tool: toolName });
  const project = process.env.AMEM_PROJECT || 'global';

  db.prepare(
    'INSERT INTO conversation_log (id, session_id, role, content, timestamp, project, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(randomUUID(), sessionId, 'system', content, Date.now(), project, metadata);

  db.close();
} catch {
  // Hooks must never fail loudly
}

process.stdout.write('{}');
