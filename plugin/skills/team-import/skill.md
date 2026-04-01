---
name: team-import
description: Import a teammate's exported memory file. Deduplicates automatically and lowers confidence slightly for second-hand knowledge. Use when the user receives a team memory export to import.
disable-model-invocation: true
---

# /amem:team-import — Import Team Memories

Import a teammate's exported memory file.

## Instructions

1. Preview what would be imported (dry run):
   ```
   amem-cli team-import <file> --dry-run
   ```

2. Import for real:
   ```
   amem-cli team-import <file>
   ```
   If `amem-cli` is not on PATH, use:
   ```
   npx @aman_asmuei/amem team-import <file>
   ```

3. The import:
   - Deduplicates by content hash (skips existing memories)
   - Lowers confidence by 0.1 for second-hand knowledge
   - Tags imported memories with `team-sync` and the source user ID
