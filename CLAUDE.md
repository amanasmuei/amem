# AI Memory System

This project uses a file-based memory system. Follow these rules in every conversation.

## On conversation start

1. Read `memory.md` — restore the AI identity, user profile, and all context.
2. Read `session.md` — check the Previous Session Recap for continuity.
3. If `archive/memory-archive.md` exists, read it — restore historical context (past decisions, completed projects).

## During conversation

- When you make progress or discover something important, update `session.md` → Working Notes.
- This is critical — Working Notes is what gets auto-saved if the user exits without saying "save".
- If the user asks about a past project, decision, or pattern that isn't in `memory.md`, check `archive/memory-archive.md` and `diary/` for historical context.

## When user says "save"

This is the intelligent save. You have full conversation context — use it.

1. Update `memory.md`:
   - **Append** new learned patterns (never delete existing ones).
   - Update the Active Projects table.
   - **Append** important decisions to the Decision Log with today's date.
   - Update the `Last updated` date.
   - Do NOT modify the Identity or User sections.
2. Update `session.md`:
   - Write the End-of-Session Summary (2-3 sentences).
3. *(Optional)* If the session was significant, append a diary entry to `diary/YYYY-MM-DD.md`:
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

## Rules

- **Append-only**: Never delete Learned Patterns or Decision Log entries (unless archiving — see below).
- **Size limit**: Keep memory.md under 200 lines. Archive old entries if it grows.
- **Diary immutability**: Never edit past diary entries.

## Archiving

When memory.md approaches 200 lines during a "save":

1. Move **completed projects** (status: done/completed/shipped/cancelled) to `archive/memory-archive.md`.
2. Move **decisions older than ~90 days** to the archive.
3. Optionally retire learned patterns that are no longer actively relevant.
4. After archiving, run `bash validate-memory.sh memory` to update the snapshot.

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
