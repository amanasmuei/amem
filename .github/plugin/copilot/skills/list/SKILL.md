---
name: list
description: List all memories, optionally filtered by type. Use when the user wants to browse their stored memories or see what's in a specific category.
---

# List Memories

List stored memories with optional type filter.

## Instructions

1. List all memories:
   ```
   npx @aman_asmuei/amem list
   ```

2. Filter by type:
   ```
   npx @aman_asmuei/amem list --type correction
   npx @aman_asmuei/amem list --type decision
   npx @aman_asmuei/amem list --type pattern
   npx @aman_asmuei/amem list --type preference
   npx @aman_asmuei/amem list --type topology
   npx @aman_asmuei/amem list --type fact
   ```

3. Each entry shows: short ID, type, content, and confidence percentage.
