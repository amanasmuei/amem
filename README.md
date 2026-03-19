# Aman AI Memory

Persistent AI memory in 3 markdown files. Works with any AI. Auto-integrates with Claude Code.

Inspired by [Project-AI-MemoryCore](https://github.com/Kiyoraka/Project-AI-MemoryCore) — simplified from 9+ files to 3 core files with full automation.

## Quick Start

```bash
# Step 1: Fill in your AI identity and user profile
./setup.sh

# Step 2: If this is inside another project (subfolder), install hooks
./install.sh
```

That's it. Start a conversation and the memory system is active.

## What This Does

Your AI remembers you across conversations — your name, preferences, projects, and decisions. No database, no API keys, no setup complexity. Just markdown files that you and the AI both read and write.

## Files

```
aman-ai-memory/
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

### Lifecycle of a conversation

| Step | When | What happens | How |
|------|------|--------------|-----|
| **Load** | Conversation starts | AI reads `memory.md` + `session.md` | Automatic via CLAUDE.md |
| **Reset** | Conversation starts | Session resets, carries over previous summary | SessionStart hook |
| **Work** | During conversation | AI updates Working Notes in `session.md` | CLAUDE.md instruction |
| **Save** | User says "save" | AI does intelligent save: patterns, decisions, projects | CLAUDE.md instruction |
| **Auto-save** | Conversation ends | Working Notes copied to summary mechanically | Stop hook |
| **Validate** | After every edit | Checks structure, size, and append-only rules | PostToolUse hook |

### Two types of save

| | Auto-save (on exit) | Manual save (user says "save") |
|---|---|---|
| **What** | Copies Working Notes to End-of-Session Summary | Updates patterns, decisions, projects, summary |
| **How** | Bash script, no AI | AI with full conversation context |
| **Cost** | 0 tokens, instant | Normal AI usage |
| **When** | Every exit, automatically | When you explicitly ask |
| **Best for** | Preserving context between sessions | Recording long-term patterns and decisions |

### What each file stores

| File | What goes here | Who updates it | Resets? |
|------|----------------|----------------|---------|
| `memory.md` | AI identity, user profile, learned patterns, decision log, projects | You (setup) + AI (save) | Never — grows over time |
| `session.md` | Previous recap, current goals, working notes, session summary | AI during conversation | Every conversation |
| `diary/YYYY-MM-DD.md` | Daily session logs | AI when you ask | Never — append-only |

## Setup Guide

### Option 1: Standalone (this IS your project)

```bash
./setup.sh
```

Hooks work out of the box via `.claude/settings.json`. Start chatting.

### Option 2: Subfolder (inside another project)

```bash
# Copy into your project
cp -r aman-ai-memory/ my-project/aman-ai-memory/

# Configure
cd my-project/aman-ai-memory/
./setup.sh       # Fill in AI identity + your profile
./install.sh     # Install hooks + CLAUDE.md into host project
```

`install.sh` handles:
- Copying or merging CLAUDE.md to your project root
- Creating `.claude/settings.json` with correct paths
- Updating `.gitignore`

If your project already has a `CLAUDE.md` or `.claude/settings.json`, it will warn you and give instructions for manual merge.

## Usage Guide

### Day-to-day workflow

**Just chat normally.** The memory system works in the background. Here's what you need to know:

| What you want | What to do |
|---------------|------------|
| Start a conversation | Just start — AI loads memory automatically |
| Save important context | Say **"save"** — AI updates patterns, decisions, projects |
| Write a diary entry | Say **"write diary entry"** — AI appends to `diary/YYYY-MM-DD.md` |
| Exit without saving | Just exit — Working Notes are auto-saved mechanically |

### Tips for best results

1. **Be explicit about decisions.** Say "let's go with approach X because Y" — the AI will log it in the Decision Log when you save.
2. **Say "save" before ending important sessions.** Auto-save preserves your working notes, but only manual save captures learned patterns and decisions intelligently.
3. **Review `memory.md` occasionally.** Check that learned patterns and decisions are accurate. Delete anything wrong.
4. **Keep it under 200 lines.** If `memory.md` grows too large, archive old decisions and completed projects.

### What the AI remembers

After a few sessions, `memory.md` will contain:

- **Learned Patterns** — things the AI discovered about how you work (e.g., "prefers concise answers", "always wants tests before merging")
- **Decision Log** — choices you made and why (e.g., "chose PostgreSQL over MongoDB for the user service because of relational data needs")
- **Active Projects** — what you're working on and current status

This context is loaded at the start of every conversation, so the AI picks up where you left off.

## For Other AI Platforms (ChatGPT, Gemini, etc.)

The auto-save and validation hooks are Claude Code specific. For other platforms:

1. Run `./setup.sh` to fill in `memory.md`
2. At the **start** of each conversation, paste:
   > Read memory.md and session.md, then follow the instructions in CLAUDE.md for how to manage memory during our session.
3. At the **end** of each conversation, say:
   > Save progress to memory.md and session.md.

No automation, but the memory files work the same way.

## Diary Format

Optional. One file per day, multiple entries appended. Never edit past entries.

```markdown
## Session — HH:MM
**Topics**: [comma-separated]
**Summary**: [1-2 sentences]
**Decisions**: [any choices made]
**Learned**: [new user patterns discovered]
---
```

Archive monthly to `diary/archive/YYYY-MM/` if desired.

## Validation

Every edit to `memory.md`, `session.md`, or diary files is automatically validated:

| Check | What it catches |
|-------|----------------|
| Required sections | AI accidentally deleted a section heading |
| Table format | Decision Log or Active Projects lost their table structure |
| Placeholder check | `[AI_NAME]` still present — setup wasn't run |
| Size guard | File grew past 200 lines or shrank below 10 |
| Append-only integrity | Learned Patterns or Decision Log entries were deleted |
| Session structure | session.md missing required sections |
| Diary format | Wrong filename, missing fields, missing session header |

## Known Limitations

| Limitation | Impact | Workaround |
|------------|--------|------------|
| AI might not update Working Notes during conversation | Auto-save has nothing to copy | Say "save" manually for important sessions |
| No cross-project memory | Each project has its own memory | Share `memory.md` manually if needed |
| No semantic search | Can't query "what did we discuss about X?" | Use `grep` in diary folder |
| Context window cap | memory.md over ~200 lines loses detail | Archive old entries periodically |
| Single user only | No multi-user support | Each user needs their own copy |

## Credits

- Inspired by [Project-AI-MemoryCore](https://github.com/Kiyoraka/Project-AI-MemoryCore) by Kiyoraka Ken & Alice
- Simplified and enhanced by Aman
