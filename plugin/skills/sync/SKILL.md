---
name: sync
description: Import Claude Code auto-memory into amem. Use when the user wants to sync, import, or merge their Claude auto-memory with amem's structured memory.
---

# /amem:sync — Sync Claude Auto-Memory

Import Claude Code's built-in auto-memory files into amem for unified, structured access.

## Instructions

1. Run the sync command via Bash:
   ```
   amem-cli sync
   ```

2. If the user wants a preview first:
   ```
   amem-cli sync --dry-run
   ```

3. Report the results: how many imported, skipped (duplicates), and from how many projects.

4. After sync, call `memory_stats` to show the updated memory count.

## What it does

- Reads `~/.claude/projects/*/memory/*.md` files
- Parses YAML frontmatter (name, description, type)
- Maps Claude types to amem types:
  - `feedback` → `correction` (confidence 1.0)
  - `project` → `decision` (confidence 0.85)
  - `user` → `preference` (confidence 0.8)
  - `reference` → `topology` (confidence 0.7)
- Deduplicates by content hash
- Stores with `source: "claude-auto-memory"` tag

## Important

- This is non-destructive — it only adds to amem, never modifies Claude auto-memory
- Duplicates are automatically skipped
- Safe to run multiple times
