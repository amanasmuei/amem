#!/usr/bin/env node
// amem Stop hook — auto-summarizes session from conversation log
// Receives JSON on stdin: { session_id, ... }

import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';

// Read stdin
let input = '';
try {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  input = Buffer.concat(chunks).toString();
} catch { /* ignore */ }

let data;
try { data = JSON.parse(input); } catch { data = {}; }

const sessionId = data.session_id || 'plugin-' + new Date().toISOString().slice(0, 10);

try {
  const amemDir = process.env.AMEM_DIR || join(homedir(), '.amem');
  const dbPath = process.env.AMEM_DB || join(amemDir, 'memory.db');

  if (!existsSync(dbPath)) { process.stdout.write('{}'); process.exit(0); }

  const require = createRequire(import.meta.url);
  const Database = require('better-sqlite3');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 2000');

  const now = Date.now();
  const project = process.env.AMEM_PROJECT || 'global';

  // Log session end marker
  db.prepare(
    'INSERT INTO conversation_log (id, session_id, role, content, timestamp, project, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(randomUUID(), sessionId, 'system', '[SESSION_END]', now, project, JSON.stringify({ hook: 'Stop' }));

  // Auto-summarize from this session's log
  const entries = db.prepare(
    'SELECT role, content, metadata FROM conversation_log WHERE session_id = ? ORDER BY timestamp ASC'
  ).all(sessionId);

  if (entries.length >= 3) {
    const decisions = [];
    const corrections = [];
    const tools = new Set();
    let memoriesStored = 0;

    for (const e of entries) {
      const content = (e.content || '').toLowerCase();
      const meta = JSON.parse(e.metadata || '{}');

      if (meta.tool) tools.add(meta.tool);
      if (meta.tool === 'memory_store' || meta.tool === 'memory_extract') memoriesStored++;

      if (e.role === 'assistant' && (content.includes('decided') || content.includes('chose') || content.includes('going with'))) {
        const snippet = e.content.slice(0, 120);
        if (snippet.length > 20) decisions.push(snippet);
      }

      if (e.role === 'user' && (content.includes("don't") || content.includes('never') || content.includes('wrong') || content.includes('instead') || content.includes('actually'))) {
        const snippet = e.content.slice(0, 120);
        if (snippet.length > 10) corrections.push(snippet);
      }
    }

    const toolList = [...tools].slice(0, 10).join(', ') || 'none observed';
    const summary = 'Session with ' + entries.length + ' exchanges. Tools used: ' + toolList + '.';

    try {
      db.prepare(
        'INSERT OR REPLACE INTO session_summaries (id, session_id, summary, key_decisions, key_corrections, memories_extracted, project, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(randomUUID(), sessionId, summary, JSON.stringify(decisions.slice(0, 10)), JSON.stringify(corrections.slice(0, 10)), memoriesStored, project, now);
    } catch { /* table may not exist in older DBs */ }
  }

  db.close();
} catch {
  // Hooks must never fail loudly
}

process.stdout.write('{}');
