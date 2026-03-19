# AI Memory Template

Persistent AI memory in 3 markdown files. Works with any AI. Auto-integrates with Claude Code.

## Quick Start

```bash
# 1. Fill in your identity
./setup.sh

# 2. If this is inside another project (subfolder), install hooks:
./install.sh
```

## Files

```
ai-memory-template/
├── CLAUDE.md            # Auto-instructions for Claude Code
├── memory.md            # Persistent: identity + user + patterns + decisions
├── session.md           # Ephemeral: auto-resets each conversation
├── diary/               # Optional: append-only session logs
├── auto-save.sh         # Copies Working Notes to summary on exit
├── reset-session.sh     # Resets session on conversation start
├── validate-memory.sh   # Validates memory after every edit
├── setup.sh             # Interactive setup (fill in memory.md)
└── install.sh           # Install hooks into host project
```

## How It Works

| Step | When | What happens | How |
|------|------|--------------|-----|
| **Load** | Conversation starts | AI reads `memory.md` + `session.md` | CLAUDE.md |
| **Reset** | Conversation starts | Session resets, carries over previous summary | SessionStart hook |
| **Work** | During conversation | AI updates Working Notes in `session.md` | CLAUDE.md |
| **Save** | User says "save" | AI does intelligent save: patterns, decisions, projects | CLAUDE.md |
| **Auto-save** | Conversation ends | Working Notes copied to summary mechanically | Stop hook |
| **Validate** | After every edit | Checks structure, size, append-only rules | PostToolUse hook |

### Two types of save

| | Auto-save (on exit) | Manual save (user says "save") |
|---|---|---|
| **What** | Copies Working Notes → End-of-Session Summary | Updates patterns, decisions, projects, summary |
| **How** | Bash script, no AI | AI with full conversation context |
| **Cost** | 0 tokens, <0.01s | Normal AI usage |
| **When** | Every exit | When user explicitly asks |

## Two Usage Modes

### Standalone (template IS the project)

Just run `./setup.sh`. Hooks work out of the box.

### Subfolder (template inside another project)

```bash
cp -r ai-memory-template/ my-project/ai-memory-template/
cd my-project/ai-memory-template/
./setup.sh      # fill in identity
./install.sh    # install hooks + CLAUDE.md into host project
```

## For Other AI Platforms

Paste this at the start of each conversation:

> Read memory.md and session.md, then follow the instructions in CLAUDE.md.

## Diary Format

One file per day (`diary/YYYY-MM-DD.md`), multiple entries appended. Never edit past entries.

```markdown
## Session — HH:MM
**Topics**: [comma-separated]
**Summary**: [1-2 sentences]
**Decisions**: [any choices made]
**Learned**: [new user patterns discovered]
---
```
