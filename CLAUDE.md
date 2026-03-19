# AI Memory System

This project uses a file-based memory system. Follow these rules in every conversation.

## Memory Map

| File | Purpose | Loaded |
|------|---------|--------|
| `memory.md` | Identity, patterns, decisions, active projects | Always |
| `session.md` | Session recap, context, goals, working notes | Always |
| `archive/memory-archive.md` | Past decisions and completed projects | Always (if exists) |
| `diary/YYYY-MM-DD.md` | Daily session logs | On demand (during recall) |
| `plans.md` | Active work plans with checkboxes | When user asks to plan |

## First Run

If `memory.md` still contains `[AI_NAME]` placeholders, setup is incomplete. Before doing anything else, guide the user through a friendly conversational setup:

1. **Welcome** them warmly. Explain this is a quick one-time setup (about a minute).
2. **Ask their name.**
3. **Ask what they work on** — suggest options: web dev, mobile, data science, DevOps, writing, general coding, research.
4. **Ask their experience level** — beginner (explain everything), intermediate (skip basics), experienced (just the details), expert (concise and technical).
5. **Ask how they like answers** — concise, detailed, step-by-step, or code first then explain.
6. **Ask what to name the AI** — suggest a few (Atlas, Nova, Sage) or let them pick.
7. **Ask the AI's personality** — direct & technical, warm & friendly, casual, or professional.
8. **Update `memory.md`** — replace ALL placeholders with their answers. Update the `Last updated` date.
9. **Confirm** with a friendly summary: *"All set! I'm [name], your [role]. I'll remember you as [user_name]. Say 'save' anytime to capture what we learn together."*

Keep it conversational — ask 2-3 questions at a time, not all at once. Use the time of day from session.md to set the right tone for the welcome.

## On conversation start

1. Read `memory.md` — restore the AI identity, user profile, and all context.
2. Read `session.md` — check the Previous Session Recap and Context (time of day).
3. If `memory.md` has `[AI_NAME]` placeholders, follow the **First Run** steps above instead.
4. If `archive/memory-archive.md` exists, read it — restore historical context.
5. Adapt your tone to the time of day shown in session.md → Context:
   - **Morning (6–12)**: Fresh, energetic, proactive.
   - **Afternoon (12–18)**: Focused, productive, direct.
   - **Evening (18–22)**: Relaxed, reflective, thorough.
   - **Night (22–6)**: Calm, concise, gentle.

## During conversation

- When you make progress or discover something important, update `session.md` → Working Notes.
- This is critical — Working Notes is what gets auto-saved if the user exits without saying "save".

### Recall

If the user asks about something not in active memory:

1. **Search memory + archive** — check `memory.md` and `archive/memory-archive.md`.
2. **Search diary** — look through `diary/` files (including `diary/archive/`) for matching entries.
3. **Uncertainty guard** — if nothing is found, say so honestly. **Never fabricate past events.**

The user can also run `./recall.sh <keyword>` manually to search all sources.

### Work Plans

When the user says "plan" or asks to create a work plan:

1. Create or update `plans.md` with a checkbox task list.
2. Track progress — check off items as they're completed during the session.
3. On "save", update `plans.md` and note progress in Working Notes.
4. Move fully completed plans to the archive.

## When user says "save"

This is the intelligent save. You have full conversation context — use it.

1. Update `memory.md`:
   - **Append** new learned patterns (never delete existing ones).
   - Update the Active Projects table. **Keep max 10 projects** — if more than 10, archive the least recently active ones.
   - **Append** important decisions to the Decision Log with today's date.
   - Update the `Last updated` date.
   - Do NOT modify the Identity or User sections.
2. Update `session.md`:
   - Write the End-of-Session Summary (2-3 sentences).
3. If `plans.md` exists, update checkbox progress.
4. *(Optional)* If the session was significant, append a diary entry to `diary/YYYY-MM-DD.md`:
   ```markdown
   ## Session — HH:MM
   **Topics**: [comma-separated]
   **Summary**: [1-2 sentences]
   **Decisions**: [any choices made]
   **Learned**: [new user patterns discovered]
   ---
   ```

## What happens automatically (no action needed)

- **On exit**: Working Notes are copied into End-of-Session Summary mechanically.
- **On next start**: Session resets, carrying over the summary as Previous Session Recap.
- **On next start**: Current time is injected into session.md for time-aware behavior.
- **On next start**: Diary entries from previous months are archived to `diary/archive/YYYY-MM/`.

## Rules

- **Append-only**: Never delete Learned Patterns or Decision Log entries (unless archiving — see below).
- **Size limit**: Keep memory.md under 200 lines. Archive old entries if it grows.
- **Project limit**: Max 10 active projects. Archive the rest during "save".
- **Session limit**: Keep session.md under 500 lines. Trim or summarize Working Notes if needed.
- **Diary immutability**: Never edit past diary entries.
- **No fabrication**: During recall, never invent past events. Search first, then admit uncertainty.

## Archiving

When memory.md approaches 200 lines during a "save":

1. Move **completed projects** (status: done/completed/shipped/cancelled) to `archive/memory-archive.md`.
2. Move **decisions older than ~90 days** to the archive.
3. Move **projects not active in 30+ days** to the archive if more than 10 projects.
4. Optionally retire learned patterns that are no longer actively relevant.
5. After archiving, run `bash validate-memory.sh memory` to update the snapshot.

Archive by appending dated blocks to `archive/memory-archive.md`:

    ## Completed Projects — YYYY-MM-DD

    | Project | Status | Notes |
    |---------|--------|-------|
    | ... | ... | ... |

    ## Archived Decisions — YYYY-MM-DD

    | Date | Decision | Context |
    |------|----------|---------|
    | ... | ... | ... |

The user can also run `./archive.sh` for manual bulk cleanup.
When historical context is needed, read `archive/memory-archive.md`.

> **If this project already has a CLAUDE.md**: Run `install.sh` — it merges these instructions automatically.
