---
name: stats
description: Show amem memory statistics — total count, type breakdown, confidence distribution, embedding coverage. Use when the user asks about memory stats, counts, or wants an overview.
disable-model-invocation: true
---

# /amem:stats — Memory Statistics

Show memory statistics.

## Instructions

1. Run via Bash:
   ```
   amem-cli stats
   ```
   If `amem-cli` is not on PATH, use:
   ```
   npx @aman_asmuei/amem stats
   ```

2. Present the results showing:
   - Total memory count
   - Breakdown by type (correction, decision, pattern, preference, topology, fact)
   - Confidence distribution (high/medium/low)
   - Embedding coverage
