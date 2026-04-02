# amem + GitHub Copilot CLI — Integration Guide

First-class amem integration for Copilot CLI. Plugin install gives you 28 MCP tools, 7 AI skills, and lifecycle hooks.

## Prerequisites

- [GitHub Copilot CLI](https://github.blog/changelog/2026-02-25-github-copilot-cli-is-now-generally-available/) installed
- Node.js 18+
- Active GitHub Copilot subscription

## Install

```bash
copilot plugin marketplace add amanasmuei/amem
copilot plugin install amem
```

Done. amem is now available in every Copilot CLI session.

## What You Get

| Component | Description |
|-----------|-------------|
| **28 MCP tools** | Store, recall, search, patch, expire, relate, and more |
| **7 AI skills** | `remember`, `recall`, `context`, `stats`, `doctor`, `export`, `list` |
| **Lifecycle hooks** | postToolUse (auto-captures tool observations), sessionEnd (auto-summarizes) |
| **AGENTS.md** | Injected every session — teaches Copilot to use amem proactively |

## Quick Start

### 1. Store your first memory

Tell Copilot naturally:

> "Remember: never use any type in TypeScript — always use proper interfaces"

Copilot will call `memory_store` with type `correction` and confidence `1.0`.

### 2. Start a new session and recall

In a new conversation:

> "What do you remember about TypeScript?"

Copilot will search amem and surface your correction.

### 3. See hooks in action

Work normally for a session. When you end it, the sessionEnd hook auto-summarizes what happened. Next session:

> "What happened last session?"

Copilot calls `memory_history` to show the summary.

### 4. Load context for a task

> "Load context for the authentication module"

Copilot runs: `memory_inject` → `reminder_check` → core tier → `memory_context`.

## Skills Reference

| Skill | What it does |
|-------|-------------|
| `remember` | Store a memory with auto-detected type and confidence |
| `recall` | Search with progressive disclosure, falls back to multi-strategy |
| `context` | Load corrections, decisions, reminders, and core tier for a topic |
| `stats` | Show memory count and type breakdown |
| `doctor` | Run health diagnostics |
| `export` | Export memories as markdown |
| `list` | List memories with optional type filter |

## How Hooks Work

**postToolUse** — After every significant tool call, the hook logs it to amem's conversation log. Skips noisy tools (Read, Write, Bash) and amem's own tools.

**sessionEnd** — When the session ends, the hook:
1. Marks the session end in the log
2. Scans for decisions and corrections
3. Stores a structured summary

## Comparison with Claude Code

| Feature | Claude Code | Copilot CLI |
|---------|:-----------:|:-----------:|
| MCP tools | 28 | 28 |
| AI skills | 15 | 7 |
| Auto-capture hooks | Yes | Yes |
| Session summarize | Yes | Yes |
| Auto-memory sync | Yes | — |
| Dashboard skill | Yes | — |
| Plugin marketplace | Yes | Yes |

The 8 extra Claude Code skills are Claude-specific features (sync, hooks, init, rules, dashboard, team-import, team-export) or available via CLI commands.

## CLI Commands (Work Everywhere)

These commands work regardless of which AI tool you use:

```bash
amem-cli stats                    # Memory statistics
amem-cli list                     # List all memories
amem-cli list --type correction   # Filter by type
amem-cli recall "auth"            # Search memories
amem-cli export --file backup.md  # Export to file
amem-cli doctor                   # Health diagnostics
amem-cli dashboard                # Web dashboard (localhost:3333)
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Plugin not found | Run `copilot plugin marketplace add amanasmuei/amem` first |
| Tools not appearing | Restart Copilot CLI session |
| No semantic search | Embeddings download on first use (~80MB). Check `amem-cli doctor` |
| Database locked | Another process has the DB open. Close other amem instances |
| Hooks not firing | Check `copilot plugin list` to verify amem is installed |
