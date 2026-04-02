# amem + Claude Code — Integration Guide

The deepest amem integration. Plugin install gives you 28 MCP tools, 15 AI skills, lifecycle hooks, and auto-memory sync.

## Prerequisites

- [Claude Code](https://claude.ai/code) installed
- Node.js 18+

## Install

```bash
/plugin marketplace add amanasmuei/amem
/plugin install amem
```

Done. Everything is auto-configured.

## What You Get

| Component | Description |
|-----------|-------------|
| **28 MCP tools** | Store, recall, search, patch, expire, relate, and more |
| **15 AI skills** | `remember`, `recall`, `context`, `sync`, `dashboard`, `stats`, `doctor`, `export`, `list`, `init`, `rules`, `hooks`, `team-import`, `team-export` |
| **Lifecycle hooks** | PostToolUse (auto-captures tool observations), Stop (auto-summarizes sessions) |
| **CLAUDE.md** | Injected every session — teaches the AI to use amem proactively |
| **Auto-memory sync** | Import Claude's built-in auto-memory into amem for unified access |

## Quick Start

### 1. Store your first memory

Just tell Claude naturally:

> "Remember: never use any type in TypeScript — always use proper interfaces"

Claude will call `memory_store` with type `correction` and confidence `1.0`.

### 2. Start a new session and recall

In a new conversation:

> "What do you remember about TypeScript?"

Claude will search amem and surface your correction.

### 3. See hooks in action

Work normally for a session. When you end it, the Stop hook auto-summarizes what happened. Next session:

> "What happened last session?"

Claude calls `memory_history` to show the summary.

### 4. Load context for a task

> "Load context for the authentication module"

Claude runs the full context sequence: `memory_inject` → `reminder_check` → core tier → `memory_context`.

### 5. Sync Claude auto-memory

If you've been using Claude Code's built-in auto-memory:

> "Sync my Claude memory"

Or via CLI:
```bash
amem-cli sync              # Import all projects
amem-cli sync --dry-run    # Preview first
```

### 6. Launch the dashboard

> "Open the memory dashboard"

Or via CLI:
```bash
amem-cli dashboard
```

Opens at `localhost:3333` with interactive knowledge graph, memory browser, and session timeline.

## Skills Reference

| Skill | What it does |
|-------|-------------|
| `amem:remember` | Store a memory with auto-detected type and confidence |
| `amem:recall` | Search with progressive disclosure, falls back to multi-strategy |
| `amem:context` | Load corrections, decisions, reminders, and core tier for a topic |
| `amem:sync` | Import Claude auto-memory into amem |
| `amem:dashboard` | Launch web dashboard |
| `amem:stats` | Show memory count and type breakdown |
| `amem:doctor` | Run health diagnostics |
| `amem:export` | Export memories as markdown |
| `amem:list` | List memories with optional type filter |
| `amem:init` | Auto-configure AI tools |
| `amem:rules` | Generate extraction rules |
| `amem:hooks` | Install lifecycle hooks |

## How Hooks Work

**PostToolUse** — After every significant tool call (not Read/Write/Bash), the hook logs it to amem's conversation log. This builds a searchable record of what happened.

**Stop** — When the session ends, the hook:
1. Marks the session end
2. Scans the conversation log for decisions and corrections
3. Stores a structured summary with key decisions, corrections, and tool usage

## Claude Auto-Memory + amem

Both can coexist. amem is authoritative when they conflict because it has:
- Typed memories with confidence scores
- Version history
- Temporal validity
- Structured search

Run `amem-cli sync` periodically to import Claude's auto-memory into amem.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Plugin not found | Run `/plugin marketplace add amanasmuei/amem` first |
| Tools not appearing | Restart Claude Code, check `amem-cli stats` |
| No semantic search | Embeddings download on first use (~80MB). Wait or check `amem-cli doctor` |
| Hooks not firing | Run `amem-cli hooks` to reinstall, or check `/plugin list` |
| Database locked | Another process has the DB open. Close other amem instances |
