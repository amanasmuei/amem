# AI Memory System

This project uses a file-based memory system. Follow these rules in every conversation.

## On conversation start

1. Read `memory.md` — restore the AI identity, user profile, and all context.
2. Read `session.md` — check the Previous Session Recap for continuity.

## On conversation end (when user says "save" or the session ends)

1. Read `session.md` Working Notes first — if it still says `[empty]`, skip saving.
2. Update `memory.md`:
   - **Append** new learned patterns (never delete existing ones).
   - Update the Active Projects table.
   - **Append** important decisions to the Decision Log with today's date.
   - Update the `Last updated` date.
   - Do NOT modify the Identity or User sections.
3. Update `session.md`:
   - Write the End-of-Session Summary (2-3 sentences).
4. *(Optional)* If the session was significant, append a diary entry to `diary/YYYY-MM-DD.md`:
   ```markdown
   ## Session — HH:MM
   **Topics**: [comma-separated]
   **Summary**: [1-2 sentences]
   **Decisions**: [any choices made]
   **Learned**: [new user patterns discovered]
   ---
   ```

## Rules

- **Append-only**: Never delete Learned Patterns or Decision Log entries.
- **Size limit**: Keep memory.md under 200 lines. Archive stale entries if it grows.
- **Diary immutability**: Never edit past diary entries.
- **Skip if trivial**: If nothing meaningful happened, don't update memory.

> **If this project already has a CLAUDE.md**: Run `install.sh` — it merges these instructions automatically.
