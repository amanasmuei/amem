---
name: stats
description: Show amem memory statistics — total count, type breakdown, confidence distribution, embedding coverage. Use when the user asks about memory stats, counts, or wants an overview.
---

# Memory Statistics

Show memory statistics.

## Instructions

1. Call `memory_stats` tool to get counts and type breakdown.

2. Present the results showing:
   - Total memory count
   - Breakdown by type (correction, decision, pattern, preference, topology, fact)
   - Any additional stats available

3. If the user wants more detail, suggest using `memory_consolidate` with `dryRun: true` for a health report.
