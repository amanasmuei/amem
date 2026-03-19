<div align="center">

# Aman AI Memory

**Persistent AI memory in 3 markdown files.**
**Works with any AI. Auto-integrates with Claude Code.**

[![Claude Code](https://img.shields.io/badge/Claude_Code-Ready-6C5CE7?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJ3aGl0ZSI+PHBhdGggZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAyIDEyIDJ6bTAgMThjLTQuNDEgMC04LTMuNTktOC04czMuNTktOCA4LTggOCAzLjU5IDggOC0zLjU5IDgtOCA4eiIvPjwvc3ZnPg==)](https://claude.ai/claude-code)
[![Markdown](https://img.shields.io/badge/Storage-Markdown-000000?style=for-the-badge&logo=markdown)](https://en.wikipedia.org/wiki/Markdown)
[![License](https://img.shields.io/badge/License-Open_Source-2ECC71?style=for-the-badge)](#credits)

<br>

*Your AI remembers you across conversations — your name, preferences, projects, and decisions.*
*No database. No API keys. No setup complexity. Just markdown.*

</div>

---

## Quick Start

```bash
# Step 1 — Fill in your AI identity and user profile
./setup.sh

# Step 2 — If this is inside another project, install hooks
./install.sh
```

> [!TIP]
> That's it. Start a conversation and the memory system is active.

---

## Project Structure

```text
aman-ai-memory/
│
├── memory.md              Persistent — identity, patterns, decisions
├── session.md             Ephemeral — resets each conversation
├── diary/                 Optional — append-only session logs
│
├── CLAUDE.md              Auto-instructions for Claude Code
├── .claude/
│   └── settings.json      Hook configuration
│
├── setup.sh               Interactive setup
├── install.sh             Install hooks into host project
├── auto-save.sh           Mechanical save on exit
├── reset-session.sh       Session reset on start
└── validate-memory.sh     Structure and integrity checks
```

---

## How It Works

### Conversation Lifecycle

```text
┌─────────────────────────────────────────────────────────┐
│                    SESSION START                         │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │ Load     │───▶│ Reset        │───▶│ Ready         │  │
│  │ memory   │    │ session      │    │ to work       │  │
│  └──────────┘    └──────────────┘    └───────┬───────┘  │
│                                              │          │
│                    DURING SESSION             ▼          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  AI updates Working Notes as you make progress   │   │
│  │  You say "save" for intelligent save (optional)  │   │
│  └──────────────────────────────────┬───────────────┘   │
│                                     │                   │
│                    SESSION END      ▼                   │
│  ┌──────────────┐    ┌──────────────────────────────┐   │
│  │ Auto-save    │───▶│ Working Notes → Summary      │   │
│  │ (mechanical) │    │ Ready for next session       │   │
│  └──────────────┘    └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

| Step | When | What Happens |
| --- | --- | --- |
| **Load** | Conversation starts | AI reads `memory.md` + `session.md` |
| **Reset** | Conversation starts | Session resets, carries over previous summary |
| **Work** | During conversation | AI updates Working Notes in `session.md` |
| **Save** | User says "save" | AI does intelligent save — patterns, decisions, projects |
| **Auto-save** | Conversation ends | Working Notes copied to summary mechanically |
| **Validate** | After every edit | Checks structure, size, and append-only rules |

---

### Two Types of Save

<table>
<tr>
<th width="200"></th>
<th width="350">Auto-save (on exit)</th>
<th width="350">Manual save (user says "save")</th>
</tr>
<tr>
<td><strong>What</strong></td>
<td>Copies Working Notes to End-of-Session Summary</td>
<td>Updates patterns, decisions, projects, summary</td>
</tr>
<tr>
<td><strong>How</strong></td>
<td>Bash script — no AI involved</td>
<td>AI with full conversation context</td>
</tr>
<tr>
<td><strong>Cost</strong></td>
<td>0 tokens, instant</td>
<td>Normal AI usage</td>
</tr>
<tr>
<td><strong>When</strong></td>
<td>Every exit, automatically</td>
<td>When you explicitly ask</td>
</tr>
<tr>
<td><strong>Best for</strong></td>
<td>Preserving context between sessions</td>
<td>Recording long-term patterns and decisions</td>
</tr>
</table>

---

### What Each File Stores

| File | What Goes Here | Who Updates It | Resets? |
| --- | --- | --- | --- |
| `memory.md` | AI identity, user profile, learned patterns, decision log, projects | You (setup) + AI (save) | Never — grows over time |
| `session.md` | Previous recap, current goals, working notes, session summary | AI during conversation | Every conversation |
| `diary/YYYY-MM-DD.md` | Daily session logs | AI when you ask | Never — append-only |

---

## Setup Guide

<details>
<summary><strong>Option 1 — Standalone (this IS your project)</strong></summary>

<br>

```bash
./setup.sh
```

Hooks work out of the box via `.claude/settings.json`. Start chatting.

</details>

<details>
<summary><strong>Option 2 — Subfolder (inside another project)</strong></summary>

<br>

```bash
# Copy into your project
cp -r aman-ai-memory/ my-project/aman-ai-memory/

# Configure
cd my-project/aman-ai-memory/
./setup.sh       # Fill in AI identity + your profile
./install.sh     # Install hooks + CLAUDE.md into host project
```

`install.sh` handles:
- Copying or merging `CLAUDE.md` to your project root
- Creating `.claude/settings.json` with correct paths
- Updating `.gitignore`

> [!NOTE]
> If your project already has a `CLAUDE.md` or `.claude/settings.json`, the installer will warn you and give instructions for manual merge.

</details>

<details>
<summary><strong>Option 3 — Other AI Platforms (ChatGPT, Gemini, etc.)</strong></summary>

<br>

The auto-save and validation hooks are Claude Code specific. For other platforms:

1. Run `./setup.sh` to fill in `memory.md`
2. At the **start** of each conversation, paste:

> Read memory.md and session.md, then follow the instructions in CLAUDE.md for how to manage memory during our session.

3. At the **end** of each conversation, say:

> Save progress to memory.md and session.md.

No automation, but the memory files work the same way.

</details>

---

## Usage Guide

### Day-to-Day Workflow

| What You Want | What To Do |
| --- | --- |
| Start a conversation | Just start — AI loads memory automatically |
| Save important context | Say **"save"** |
| Write a diary entry | Say **"write diary entry"** |
| Exit without saving | Just exit — Working Notes are auto-saved |

### Tips for Best Results

> [!IMPORTANT]
> Say **"save"** before ending important sessions. Auto-save preserves your working notes, but only manual save captures learned patterns and decisions intelligently.

1. **Be explicit about decisions.** Say *"let's go with approach X because Y"* — the AI will log it in the Decision Log when you save.

2. **Review `memory.md` occasionally.** Check that learned patterns and decisions are accurate. Delete anything wrong.

3. **Keep it under 200 lines.** If `memory.md` grows too large, archive old decisions and completed projects.

---

### What the AI Remembers

After a few sessions, `memory.md` will contain:

| Section | Example |
| --- | --- |
| **Learned Patterns** | *"Prefers concise answers"*, *"Always wants tests before merging"* |
| **Decision Log** | *"Chose PostgreSQL over MongoDB — relational data needs"* |
| **Active Projects** | *"API rewrite — in progress — migrating from REST to GraphQL"* |

This context is loaded at the start of every conversation, so the AI picks up where you left off.

---

## Validation

Every edit to `memory.md`, `session.md`, or diary files is automatically validated.

| Check | What It Catches |
| --- | --- |
| Required sections | AI accidentally deleted a section heading |
| Table format | Decision Log or Active Projects lost their table structure |
| Placeholder check | `[AI_NAME]` still present — setup wasn't run |
| Size guard | File grew past 200 lines or shrank below 10 |
| Append-only integrity | Learned Patterns or Decision Log entries were deleted |
| Session structure | `session.md` missing required sections |
| Diary format | Wrong filename, missing fields, missing session header |

---

## Diary Format

<details>
<summary>View diary entry template</summary>

<br>

One file per day (`diary/YYYY-MM-DD.md`), multiple entries appended. Never edit past entries.

```markdown
## Session — HH:MM
**Topics**: [comma-separated]
**Summary**: [1-2 sentences]
**Decisions**: [any choices made]
**Learned**: [new user patterns discovered]
---
```

Archive monthly to `diary/archive/YYYY-MM/` if desired.

</details>

---

## Known Limitations

| Limitation | Impact | Workaround |
| --- | --- | --- |
| AI might not update Working Notes | Auto-save has nothing to copy | Say "save" manually for important sessions |
| No cross-project memory | Each project has its own memory | Share `memory.md` manually if needed |
| No semantic search | Can't query *"what did we discuss about X?"* | Use `grep` in diary folder |
| Context window cap | `memory.md` over ~200 lines loses detail | Archive old entries periodically |
| Single user only | No multi-user support | Each user needs their own copy |

---

<div align="center">

## Credits

Inspired by [Project-AI-MemoryCore](https://github.com/Kiyoraka/Project-AI-MemoryCore) by Kiyoraka Ken & Alice

Simplified and enhanced by **Aman**

---

*Built for humans who want their AI to actually remember them.*

</div>
