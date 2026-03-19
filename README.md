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
├── validate-memory.sh   # Auto-validates memory after every edit
├── reset-session.sh     # Auto-resets session on conversation start
├── setup.sh             # Interactive setup (fill in memory.md)
└── install.sh           # Install hooks into host project
```

## How It Works

| Step | When | What happens |
|------|------|--------------|
| **Load** | Conversation starts | AI reads `memory.md` + `session.md` |
| **Reset** | Conversation starts | `session.md` auto-resets (carries over previous summary or working notes) |
| **Work** | During conversation | Just chat normally |
| **Save** | Conversation ends | AI auto-saves (skips if nothing meaningful happened) |
| **Validate** | After every edit | Checks structure, size, append-only rules, diary format |

## Two Usage Modes

### Standalone (template IS the project)

Just run `./setup.sh`. Hooks work out of the box via `.claude/settings.json`.

### Subfolder (template inside another project)

```bash
cp -r ai-memory-template/ my-project/ai-memory-template/
cd my-project/ai-memory-template/
./setup.sh      # fill in identity
./install.sh    # install hooks + CLAUDE.md into host project
```

`install.sh` handles:
- Copying/merging CLAUDE.md to project root
- Creating `.claude/settings.json` with correct paths
- Updating `.gitignore`

## For Other AI Platforms

Paste this at the start of each conversation:

> Read memory.md and session.md, then follow the instructions in CLAUDE.md for how to manage memory during our session.

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
