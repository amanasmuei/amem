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

## What Is This?

Every time you start a new conversation with an AI (ChatGPT, Claude, Gemini), it forgets everything about you. Your name, your projects, your preferences — gone.

**Aman AI Memory fixes this.** It gives your AI a set of files where it stores what it learns about you. Next conversation, it reads those files and picks up right where you left off.

- **It remembers your name** and how you like to work
- **It tracks your projects** and decisions you've made
- **It learns your style** over time, adapting to your preferences
- **It works with any AI** — Claude Code has full automation, others work with copy-paste
- **Your data stays on your computer** — no cloud, no accounts, just plain text files

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

## Your First Conversation

There are two ways to get started — pick whichever feels more comfortable:

### Option A: Just start talking (recommended for beginners)

1. **Open Claude Code** in your project folder
2. **Say hello** — the AI detects this is your first time and walks you through setup
3. **Answer a few questions** — your name, what you work on, what to call the AI
4. **Done!** The AI remembers you from now on

The AI asks questions conversationally, 2-3 at a time. No forms, no commands — just a friendly chat.

### Option B: Run the setup wizard first

```bash
./init.sh
```

The wizard asks the same questions with numbered choices. Good if you prefer filling things in quickly before your first conversation.

### After Setup

1. **Chat normally** — the AI quietly takes notes as you work together
2. **Say "save"** before ending important sessions — this tells the AI to remember what it learned
3. **Next time**, the AI greets you by name and remembers everything from before

That's it. No commands to memorize. Just talk naturally and say "save" when it matters.

> [!TIP]
> **Using ChatGPT, Gemini, or another AI?** At the start of each conversation, paste: *"Read memory.md and session.md, then follow the instructions in CLAUDE.md."* At the end, say: *"Save progress."*

---

## Quick Reference

**Things you can say to the AI:**

| Say this | What happens |
| --- | --- |
| *(just start talking)* | AI loads your memory and continues where you left off |
| **"save"** | AI saves what it learned — patterns, decisions, projects |
| **"write diary entry"** | AI creates a dated log of today's session |
| **"plan"** | AI creates a work plan with checkboxes to track |
| *"what did we decide about X?"* | AI searches its memory and diary for past context |

**Scripts you can run in the terminal (optional — the AI handles most of this):**

| Command | What it does |
| --- | --- |
| `./recall.sh <word>` | Search all memory files for a keyword |
| `./archive.sh` | Clean up old entries when memory gets full |
| `./add-user.sh <name>` | Add another person's profile |
| `./switch-user.sh` | Switch between profiles |
| `./setup.sh` | Reconfigure your AI's name and personality |

---

## Project Structure

<details>
<summary>Click to view all files</summary>

<br>

```text
aman-ai-memory/
│
├── memory.md              Your AI's long-term memory (identity, patterns, decisions)
├── session.md             Current conversation notes (resets each time)
├── plans.md               Work plans with checkboxes (created when you say "plan")
├── diary/                 Daily session logs (optional)
├── archive/               Old entries moved here to keep memory lean
│
├── CLAUDE.md              Instructions the AI follows automatically
├── .claude/
│   └── settings.json      Automation hooks (runs behind the scenes)
│
├── get.sh                 Remote installer (the curl one-liner)
├── init.sh                Setup wizard (start here)
├── setup.sh               Configure your AI's identity
├── install.sh             Install into an existing project
├── auto-save.sh           Saves your notes when conversation ends
├── reset-session.sh       Prepares a fresh session on start
├── validate-memory.sh     Checks memory files aren't corrupted
├── archive.sh             Moves old entries to archive
├── recall.sh              Searches memory for past context
├── add-user.sh            Adds a new user profile
├── switch-user.sh         Switches between user profiles
│
├── profiles/              Per-user data (multi-user mode only)
│   └── <name>/
│       ├── memory.md
│       ├── session.md
│       └── diary/
└── archive/               Archived entries (created by archive.sh)
```

</details>

---

## How It Works

Here's what happens behind the scenes during each conversation:

### Conversation Lifecycle

```text
┌──────────────────────────────────────────────────────────────┐
│                      SESSION START                            │
│  ┌─────────────┐   ┌────────────────┐   ┌────────────────┐  │
│  │ Load memory │──▶│ Reset session  │──▶│ Ready to work  │  │
│  │ + archive   │   │ + inject time  │   │ (time-aware)   │  │
│  └─────────────┘   │ + archive diary│   └───────┬────────┘  │
│                     └────────────────┘           │           │
│                      DURING SESSION              ▼           │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  AI updates Working Notes as you make progress        │   │
│  │  AI can recall past context from diary and archive    │   │
│  │  You say "save" for intelligent save (optional)       │   │
│  │  You say "plan" to create a tracked work plan         │   │
│  └───────────────────────────────────┬───────────────────┘   │
│                                      │                       │
│                      SESSION END     ▼                       │
│  ┌──────────────┐   ┌────────────────────────────────────┐   │
│  │ Auto-save    │──▶│ Working Notes → Summary            │   │
│  │ (mechanical) │   │ Ready for next session             │   │
│  └──────────────┘   └────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

| Step | When | What Happens |
| --- | --- | --- |
| **Load** | Conversation starts | AI reads `memory.md` + `session.md` + `archive/memory-archive.md` |
| **Reset** | Conversation starts | Session resets, injects current time, archives old diary months |
| **Adapt** | Conversation starts | AI adapts tone to time of day (morning/afternoon/evening/night) |
| **Work** | During conversation | AI updates Working Notes, can recall from diary and archive |
| **Plan** | User says "plan" | AI creates or updates `plans.md` with tracked checkboxes |
| **Save** | User says "save" | AI saves patterns, decisions, projects (max 10), archives old entries |
| **Auto-save** | Conversation ends | Working Notes copied to summary mechanically |
| **Validate** | After every edit | Checks structure, size limits (200/500 lines), and append-only rules |

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
| `memory.md` | AI identity, user profile, learned patterns, decision log, projects (max 10) | You (setup) + AI (save) | Never — grows over time |
| `session.md` | Previous recap, time context, goals, working notes, session summary | AI during conversation | Every conversation |
| `diary/YYYY-MM-DD.md` | Daily session logs | AI when you ask | Never — append-only |
| `archive/memory-archive.md` | Archived decisions and completed projects | AI (during archive) | Never — append-only |
| `plans.md` | Active work plans with checkboxes | AI when you say "plan" | When plans complete |

---

## Detailed Setup Guide

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

> [!TIP]
> **You can skip the wizard entirely.** If you prefer, just open Claude Code and start talking — the AI will walk you through setup conversationally on your first conversation. See [Your First Conversation](#your-first-conversation).

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

1. Run `./init.sh` to fill in `memory.md` (or edit `memory.md` directly — replace the `[AI_NAME]` and `[YOUR_NAME]` placeholders with your details)
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
| Create a work plan | Say **"plan"** — AI creates `plans.md` with checkboxes |
| Search past context | Run **`./recall.sh <keyword>`** or ask the AI |
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

Every edit to memory files is automatically checked in the background. You don't need to do anything — if something goes wrong, the AI is told to fix it.

<details>
<summary>View all validation checks</summary>

<br>

| Check | What It Catches |
| --- | --- |
| Required sections | AI accidentally deleted a section heading |
| Table format | Decision Log or Active Projects lost their table structure |
| Placeholder check | `[AI_NAME]` still present — setup not complete (AI will guide you through it) |
| Size guard | `memory.md` over 200 lines or `session.md` over 500 lines |
| Append-only integrity | Learned Patterns or Decision Log entries were deleted |
| Session structure | `session.md` missing required sections |
| Diary format | Wrong filename, missing fields, missing session header |

</details>

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

Previous months are automatically archived to `diary/archive/YYYY-MM/` at the start of each conversation.

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

## Advanced Features

### Time-Aware Behavior

The AI adapts its communication style based on the time of day. The current time is automatically injected into `session.md` at the start of each conversation — no configuration needed.

| Time | Tone |
| --- | --- |
| **Morning** (6–12) | Fresh, energetic, proactive |
| **Afternoon** (12–18) | Focused, productive, direct |
| **Evening** (18–22) | Relaxed, reflective, thorough |
| **Night** (22–6) | Calm, concise, gentle |

### Memory Recall

Can't remember when you made a decision? The recall system searches across all memory sources:

```bash
./recall.sh PostgreSQL       # Search for a keyword
./recall.sh "API rewrite"    # Search for a phrase
./recall.sh auth migration   # Multiple keywords (OR)
```

The AI also does this automatically — if you ask about something not in active memory, it searches diary entries and the archive before responding. It will **never fabricate past events** — it searches for evidence first, and says "I'm not sure" if nothing is found.

```text
Memory Recall — searching for: PostgreSQL

Diary entries:

  2026-03-15
    L5: **Decisions**: Chose PostgreSQL over MongoDB for relational data
    L8: Discussed migration plan from SQLite

Archive (memory-archive.md):
  L12: | 2025-12-01 | Chose PostgreSQL over MongoDB | relational data needs |

Current memory (memory.md):
  L28: - User prefers PostgreSQL for relational workloads
```

### Work Plans

Say **"plan"** to create a tracked work plan:

```markdown
# Plans

## API Migration — started 2026-03-19

- [x] Design new schema
- [x] Write migration script
- [ ] Test with staging data
- [ ] Deploy to production
- [ ] Monitor for 48 hours
```

Plans persist in `plans.md` across sessions. Progress is updated when you say "save". Completed plans are moved to the archive.

### Smart Project Management (LRU)

Active projects are capped at **10** in `memory.md`. The AI manages this automatically during "save":

- Projects not mentioned in 30+ days are archived
- Completed projects are always archived
- Archived projects are still searchable via recall

This prevents `memory.md` from growing unbounded while keeping recent work front and center.

### Diary Auto-Archiving

Diary entries from previous months are automatically moved to `diary/archive/YYYY-MM/` at the start of each conversation. Current month entries stay in `diary/` for quick access.

```text
diary/
  2026-03-15.md        ← current month, stays here
  2026-03-18.md
  archive/
    2026-01/           ← previous months, auto-archived
      2026-01-05.md
      2026-01-12.md
    2026-02/
      2026-02-03.md
```

Archived diary entries are still searchable via `./recall.sh` and by the AI during recall.

### Session Size Guard

`session.md` is capped at **500 lines**. If Working Notes grow past this, the validation system warns you to save or trim. This prevents session bloat that degrades AI performance.

---

## FAQ

<details>
<summary><strong>Do I need to know how to code?</strong></summary>

<br>

No. You don't even need to run the setup wizard — just start a conversation and the AI will ask you a few friendly questions to get set up. After that, you just talk normally. The only "technical" thing is running the install command once to download the files.

</details>

<details>
<summary><strong>What if I forget to say "save"?</strong></summary>

<br>

Your working notes are automatically saved when the conversation ends. But only a manual "save" captures learned patterns and decisions intelligently. For casual conversations, auto-save is fine. For important sessions where you made decisions, say "save" before leaving.

</details>

<details>
<summary><strong>Can I use this with ChatGPT, Gemini, or other AIs?</strong></summary>

<br>

Yes! The automation (auto-save, validation) is Claude Code specific, but the memory files work with any AI. At the start of each conversation, paste:

> *"Read memory.md and session.md, then follow the instructions in CLAUDE.md for how to manage memory during our session."*

At the end, say: *"Save progress to memory.md and session.md."*

</details>

<details>
<summary><strong>What if memory gets too big?</strong></summary>

<br>

The AI handles this automatically during "save" by archiving old entries. You can also run `./archive.sh` manually. **Archived memories are NOT lost** — they're moved to a separate file that the AI still reads at the start of every conversation.

</details>

<details>
<summary><strong>Can multiple people use this on the same project?</strong></summary>

<br>

Yes! Run `./add-user.sh alice` to add a new profile. Each person gets their own separate memory, diary, and session. Switch between people with `./switch-user.sh`. See the [Multi-User](#multi-user) section for details.

</details>

<details>
<summary><strong>Is my data sent anywhere?</strong></summary>

<br>

No. Everything stays in plain text files on your computer. The AI reads these files during your conversation — they're never uploaded to any external service. You own and control your data completely.

</details>

<details>
<summary><strong>Can I edit the memory files manually?</strong></summary>

<br>

Yes! They're plain text (markdown) files. Open them in any text editor to review, correct, or delete entries. Just keep the section headings (lines starting with `##`) intact.

</details>

<details>
<summary><strong>What's the difference between memory, session, and diary?</strong></summary>

<br>

Think of it like this:

- **Memory** (`memory.md`) = your AI's brain — who you are, what you prefer, what you're working on. Persists forever.
- **Session** (`session.md`) = a sticky note for the current conversation. Thrown away and replaced each time.
- **Diary** (`diary/`) = a journal. One entry per day, never edited. Good for looking back at what happened.

</details>

---

## Troubleshooting

| Problem | Solution |
| --- | --- |
| AI doesn't remember me | Make sure you're in the right folder. Open `memory.md` — does it have your name? If not, just start a new conversation and the AI will guide you through setup. |
| "memory.md not found" error | Make sure you're inside the ai-memory folder. If the file is missing, run `./init.sh` to create it. |
| AI keeps asking my name | Setup wasn't completed. Start a new conversation — the AI will detect this and walk you through it. Or run `./setup.sh` manually. |
| Memory feels incomplete | Say **"save"** more often. Auto-save only captures working notes, not learned patterns. |
| "memory.md is over 200 lines" | Run `./archive.sh` to move old entries to the archive. Nothing is lost. |
| Session feels slow or repetitive | Session might be too long. Say **"save"**, then start a new conversation. |
| Wrong user profile active | Run `./switch-user.sh` to see who's active and switch if needed. |
| AI invents things that didn't happen | Say *"check the archive"* or *"search for X"* — the AI is instructed to search, not fabricate. |

---

## Known Limitations

| Limitation | Impact | Workaround |
| --- | --- | --- |
| AI might not update Working Notes | Auto-save has nothing to copy | Say "save" manually for important sessions |
| No cross-project memory | Each project has its own memory | Share `memory.md` manually if needed |
| Keyword search only | Recall uses keyword matching, not semantic search | Use specific keywords with `./recall.sh` |
| Context window cap | Very large archives may exceed AI context | Keep `memory.md` lean via archiving; archive is loaded but prioritized lower |

---

<div align="center">

## Credits

Inspired by [Project-AI-MemoryCore](https://github.com/Kiyoraka/Project-AI-MemoryCore) by Kiyoraka Ken & Alice

Simplified and enhanced by **Aman**

---

*Built for humans who want their AI to actually remember them.*

</div>
