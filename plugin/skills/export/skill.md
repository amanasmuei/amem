---
name: export
description: Export all memories as markdown or to a file. Use when the user wants to back up, share, or review their memories outside of amem.
disable-model-invocation: true
---

# /amem:export — Export Memories

Export all memories as markdown.

## Instructions

1. Export to stdout:
   ```
   amem-cli export
   ```

2. Export to a file:
   ```
   amem-cli export --file memories.md
   ```
   If `amem-cli` is not on PATH, use:
   ```
   npx @aman_asmuei/amem export --file memories.md
   ```

3. The export is organized by memory type (corrections first, then decisions, patterns, etc.) with confidence scores, ages, tags, and IDs.
