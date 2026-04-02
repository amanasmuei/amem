---
name: export
description: Export all memories as markdown or to a file. Use when the user wants to back up, share, or review their memories outside of amem.
---

# Export Memories

Export all memories as markdown.

## Instructions

1. Export to stdout:
   ```
   npx @aman_asmuei/amem export
   ```

2. Export to a file:
   ```
   npx @aman_asmuei/amem export --file memories.md
   ```

3. The export is organized by memory type (corrections first, then decisions, patterns, etc.) with confidence scores, ages, tags, and IDs.
