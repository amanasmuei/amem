---
name: doctor
description: Run health diagnostics on the amem memory database. Use when the user wants to check memory health, embedding coverage, stale memories, or diagnose issues.
disable-model-invocation: true
---

# /amem:doctor — Health Diagnostics

Run health diagnostics on the amem memory database.

## Instructions

1. Run via Bash:
   ```
   node "$(npm root -g)/@aman_asmuei/amem/dist/cli.js" doctor
   ```
   If that fails, try the local path:
   ```
   npx @aman_asmuei/amem doctor
   ```

2. Present the results to the user, explaining any issues found.

3. Key metrics reported:
   - **Memories** — total count
   - **Embeddings** — percentage with semantic search enabled
   - **Core tier** — token budget usage (how much of the always-loaded context is used)
   - **Graph edges** — knowledge graph connections
   - **Stale** — memories not accessed in 60+ days with low confidence
   - **Overdue reminders** — any reminders past their due date

4. If issues are found, explain the suggestions:
   - Low embedding coverage: restart MCP server or install `@huggingface/transformers`
   - Core tier near budget: review core memories and demote less critical ones
   - Stale memories: run `memory_consolidate` to clean up
   - No corrections: suggest storing corrections when the AI makes mistakes
