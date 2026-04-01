---
name: remember
description: Store a memory quickly. Use when the user says "remember this", "store this", "don't forget", or wants to save a correction, decision, pattern, or preference.
---

# /amem:remember — Quick Memory Store

The user wants to store a memory. Parse their input and call the appropriate amem tool.

## Instructions

1. Parse `$ARGUMENTS` to determine:
   - **Content**: What to remember
   - **Type**: correction (user correcting you), decision (architecture choice), pattern (coding style), preference (tool choice), topology (codebase location), fact (general knowledge)
   - **Confidence**: 1.0 for corrections, 0.9 for decisions, 0.7-0.8 for others

2. Call `memory_store` with the parsed fields.

3. If the memory relates to an existing one, also call `memory_relate` to link them.

## Examples

- `/amem:remember never use any type in TypeScript` → correction, confidence 1.0
- `/amem:remember we chose PostgreSQL for ACID compliance` → decision, confidence 0.9
- `/amem:remember I prefer pnpm over npm` → preference, confidence 0.8
- `/amem:remember auth module is in src/auth/` → topology, confidence 0.7

## Important

- Always use `memory_store`, not `memory_extract` for single memories
- Set appropriate tags based on the content
- If this sounds like a correction ("don't", "never", "stop"), type = correction, confidence = 1.0
