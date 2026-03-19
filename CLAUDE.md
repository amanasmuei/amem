# AI Memory System

This project uses a file-based memory system. Follow these rules in every conversation.

## On conversation start

1. Read `memory.md` — restore the AI identity, user profile, and all context.
2. Read `session.md` — check the Previous Session Recap for continuity.

## During conversation

- When you make progress or discover something important, update `session.md` → Working Notes.
- This is critical — Working Notes is what gets auto-saved if the user exits without saying "save".

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

- **Append-only**: Never delete Learned Patterns or Decision Log entries.
- **Size limit**: Keep memory.md under 200 lines. Archive stale entries if it grows.
- **Diary immutability**: Never edit past diary entries.

> **If this project already has a CLAUDE.md**: Run `install.sh` — it merges these instructions automatically.
