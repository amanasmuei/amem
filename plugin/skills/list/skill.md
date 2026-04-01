---
name: list
description: List all memories, optionally filtered by type. Use when the user wants to browse their stored memories or see what's in a specific category.
disable-model-invocation: true
---

# /amem:list — List Memories

List stored memories with optional type filter.

## Instructions

1. List all memories:
   ```
   amem-cli list
   ```
   If `amem-cli` is not on PATH, use:
   ```
   npx @aman_asmuei/amem list
   ```

2. Filter by type:
   ```
   amem-cli list --type correction
   amem-cli list --type decision
   amem-cli list --type pattern
   amem-cli list --type preference
   amem-cli list --type topology
   amem-cli list --type fact
   ```

3. Each entry shows: short ID, type, content, and confidence percentage.
