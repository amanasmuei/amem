---
name: recall
description: Search memories quickly. Use when the user asks "what do you remember about", "recall", "search memory", or wants to find past decisions, corrections, or context.
---

# Quick Memory Search

The user wants to find memories. Search amem and present results clearly.

## Instructions

1. Take the user's query as the search terms.

2. Call `memory_recall` with:
   - `query`: the search terms
   - `limit`: 10
   - `compact`: true (for efficiency)

3. If results are found, present them clearly:
   - Show type, content preview, and confidence
   - Offer to show full details for any specific memory

4. If no results, try `memory_multi_recall` for a deeper 4-strategy search.

5. If still nothing, suggest the user store some memories first.

## Examples

- "what do you remember about auth?" → searches for authentication-related memories
- "recall TypeScript rules" → finds corrections and patterns about TypeScript
- "search memory for database decisions" → finds database-related decisions
