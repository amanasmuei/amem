#!/usr/bin/env node
// amem SessionStart hook — ensures dependencies are installed
// Runs once at the start of each session

import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(__dirname, '..');
const nodeModules = join(pluginRoot, 'node_modules');

try {
  if (!existsSync(join(nodeModules, 'better-sqlite3'))) {
    execFileSync('npm', ['install', '--production', '--no-audit', '--no-fund'], {
      cwd: pluginRoot,
      stdio: 'ignore',
      timeout: 25000,
    });
  }
} catch {
  // Non-fatal — MCP server still works via npx
}

// Output empty JSON (required by hook protocol)
process.stdout.write('{}');
