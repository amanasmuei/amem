<div align="center">

# Aman AI Memory

**Persistent AI memory in markdown files. Multi-user ready.**
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

### Install (one-liner)

```bash
curl -fsSL https://raw.githubusercontent.com/amanasmuei/aman-ai-memory/main/get.sh | bash
```

Downloads everything, initializes a fresh git repo, and launches the guided setup wizard. Just answer a few questions — pick from numbered choices or press Enter for defaults.

> [!TIP]
> No terminal experience needed. Git is installed automatically as part of setup. Each install gets its own clean git history — no template commits carried over.

<details>
<summary><strong>Install into a specific folder</strong></summary>

<br>

```bash
# Custom folder name
curl -fsSL https://raw.githubusercontent.com/amanasmuei/aman-ai-memory/main/get.sh | bash -s -- my-project/ai-memory

# Or clone and run the wizard (init.sh replaces template history with a fresh repo)
git clone https://github.com/amanasmuei/aman-ai-memory.git
cd aman-ai-memory && ./init.sh
```

</details>

<details>
<summary><strong>Already have the files?</strong> — just run the wizard</summary>

<br>

```bash
./init.sh
```

Or run the steps separately:

```bash
./setup.sh       # Fill in memory.md only
./install.sh     # Install hooks into host project only
```

</details>

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
├── get.sh                 Remote installer (curl one-liner)
├── init.sh                Guided wizard (start here)
├── setup.sh               Fill in memory.md (advanced)
├── install.sh             Install hooks into host project (advanced)
├── auto-save.sh           Mechanical save on exit
├── reset-session.sh       Session reset on start
├── validate-memory.sh     Structure and integrity checks
├── archive.sh             Archive old entries from memory.md
├── add-user.sh            Add a new user profile
├── switch-user.sh         Switch active user profile
│
├── profiles/              Per-user data (multi-user mode only)
│   └── <name>/
│       ├── memory.md
│       ├── session.md
│       └── diary/
└── archive/               Archived entries (created by archive.sh)
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

### All-in-One (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/amanasmuei/aman-ai-memory/main/get.sh | bash
```

The installer downloads everything and launches the guided wizard. It handles:

- Single-user or multi-user mode selection
- Friendly questions with numbered choices (pick 1, 2, 3...)
- Sensible defaults (press Enter to skip)
- Auto-detects if you're in a subfolder and offers to install hooks
- Initializes a fresh git repo (no template history carried over)
- Shows a summary when done

### Adding to an Existing Project

```bash
# Download into your project
curl -fsSL https://raw.githubusercontent.com/amanasmuei/aman-ai-memory/main/get.sh | bash -s -- my-project/ai-memory

# Run the wizard
cd my-project/ai-memory && ./init.sh
```

> [!NOTE]
> The wizard auto-detects that you're inside another project and offers to install hooks for you.

### Other AI Platforms (ChatGPT, Gemini, etc.)

<details>
<summary>Click to expand</summary>

<br>

The auto-save and validation hooks are Claude Code specific. For other platforms:

1. Run `./init.sh` to fill in `memory.md`
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
| Archive old entries | Run **`./archive.sh`** or say "save" (AI archives automatically) |
| Add a team member | Run **`./add-user.sh <name>`** |
| Switch user profile | Run **`./switch-user.sh <name>`** |

### Tips for Best Results

> [!IMPORTANT]
> Say **"save"** before ending important sessions. Auto-save preserves your working notes, but only manual save captures learned patterns and decisions intelligently.

1. **Be explicit about decisions.** Say *"let's go with approach X because Y"* — the AI will log it in the Decision Log when you save.

2. **Review `memory.md` occasionally.** Check that learned patterns and decisions are accurate. Delete anything wrong.

3. **Keep it under 200 lines.** Run `./archive.sh` when it grows, or just say "save" — the AI archives automatically when approaching the limit.

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

## Multi-User

For teams or shared machines where multiple people need their own AI memory.

### Getting Started

**During initial setup** — the wizard asks "Just me" or "Multiple people":

```text
  How will this be used?

  1) Just me — single user
  2) Multiple people — shared project

  Pick one [1]: 2
  Your profile name [aman]:
```

Each user gets an isolated profile with their own `memory.md`, `session.md`, and `diary/`.

### Adding Users Later

Already running single-user? No problem — `add-user.sh` migrates your data automatically:

```bash
./add-user.sh alice
```

> [!NOTE]
> The first time you add a user, the script asks for a name for your **existing** profile so your data is preserved. After that, it simply creates a new empty profile.

### Switching Profiles

```bash
./switch-user.sh            # Interactive — lists all profiles, pick one
./switch-user.sh alice      # Switch directly
```

After switching, all scripts, hooks, and AI instructions work with the new profile — no reconfiguration needed.

### How It Works

Root files (`memory.md`, `session.md`, `diary/`) become **symlinks** to the active profile. This means zero changes to CLAUDE.md, hooks, or AI workflows.

```text
aman-ai-memory/
├── memory.md → profiles/aman/memory.md    (symlink)
├── session.md → profiles/aman/session.md  (symlink)
├── diary → profiles/aman/diary            (symlink)
│
└── profiles/
    ├── aman/
    │   ├── memory.md        ← AI reads/writes here when aman is active
    │   ├── session.md
    │   ├── diary/
    │   └── archive/
    └── alice/
        ├── memory.md
        ├── session.md
        ├── diary/
        └── archive/
```

### Multi-User Commands

| Command | What It Does |
| --- | --- |
| `./add-user.sh <name>` | Create a new profile (migrates single-user data if needed) |
| `./switch-user.sh` | List profiles and switch interactively |
| `./switch-user.sh <name>` | Switch to a specific profile directly |
| `./setup.sh` | Reconfigure the **active** profile's identity and preferences |

---

## Archiving

AI context windows have limits. When `memory.md` exceeds ~200 lines, details in the middle get lost. The archiving system keeps your memory lean while preserving history.

### What Gets Archived

| Entry Type | Trigger | Example |
| --- | --- | --- |
| **Completed projects** | Status is *done*, *completed*, *shipped*, *cancelled*, or *closed* | `API rewrite — Completed — shipped to prod` |
| **Old decisions** | Date older than 90 days (configurable) | `2024-11-01 — Chose PostgreSQL over MongoDB` |

Archived entries move to `archive/memory-archive.md`.

> [!IMPORTANT]
> **Archived memories are NOT lost.** The AI loads the archive file at the start of every conversation alongside `memory.md`. You don't need to do anything — old decisions and completed projects are still recalled automatically.

### How Recall Works

```text
Conversation starts
  │
  ├─ 1. Read memory.md                  ← active memory (always loaded)
  ├─ 2. Read session.md                 ← last session recap (always loaded)
  └─ 3. Read archive/memory-archive.md  ← archived history (loaded if exists)
```

| Memory type | Stored in | Loaded automatically? | Purpose |
| --- | --- | --- | --- |
| **Active** | `memory.md` | Yes, always | Current identity, patterns, active projects |
| **Archived** | `archive/memory-archive.md` | Yes, if file exists | Past decisions, completed projects |
| **Session** | `session.md` | Yes, always | Previous session recap, working notes |
| **Diary** | `diary/YYYY-MM-DD.md` | On demand | Detailed daily logs (AI checks when asked) |

Archiving keeps `memory.md` lean (under 200 lines) while the AI still has full historical context through the archive file. Think of it like moving old emails to a folder — they're organized separately but still searchable.

### Automatic (during "save")

When you say **"save"**, the AI checks the line count. If `memory.md` is approaching 200 lines, it automatically archives eligible entries before saving new ones.

### Manual

```bash
./archive.sh                # Interactive — previews what can be archived, asks to confirm
./archive.sh --days 60      # Archive decisions older than 60 days instead of the default 90
```

Example output:

```text
Memory Archive

  Current size: 187 lines (approaching 200 limit)

  Completed projects: 2
    → API rewrite
    → Auth migration

  Decisions older than 90 days: 3
    → 2024-09-15: Chose PostgreSQL over MongoDB
    → 2024-10-01: Adopted trunk-based branching
    → 2024-11-20: Moved CI to GitHub Actions

  Archive these entries? [Y/n]: y

  ✓ Archived 12 lines
  ✓ memory.md: 187 → 175 lines
  ✓ Archive: archive/memory-archive.md
```

### Accessing Archived Context

The AI can read `archive/memory-archive.md` when historical context is needed. Just ask:

> *"Check the archive — what database did we decide on last year?"*

---

## Known Limitations

| Limitation | Impact | Workaround |
| --- | --- | --- |
| AI might not update Working Notes | Auto-save has nothing to copy | Say "save" manually for important sessions |
| No cross-project memory | Each project has its own memory | Share `memory.md` manually if needed |
| No semantic search | Can't query *"what did we discuss about X?"* | Use `grep` in diary folder |
| Context window cap | `memory.md` over ~200 lines loses detail | Run `./archive.sh` — see [Archiving](#archiving) |

---

<div align="center">

## Credits

Inspired by [Project-AI-MemoryCore](https://github.com/Kiyoraka/Project-AI-MemoryCore) by Kiyoraka Ken & Alice

Simplified and enhanced by **Aman**

---

*Built for humans who want their AI to actually remember them.*

</div>
