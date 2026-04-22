# Voice Layers

The `amem:remember` skill returns a **structured result**, not a formatted confirmation. This separates *what happened* (shared) from *how it's said* (personal).

Pick a voice below or fork one. Paste the template into your personal `~/.claude/CLAUDE.md`, project `CLAUDE.md`, or an equivalent instruction file for your tool.

| Voice | Style | Best for |
|-------|-------|----------|
| [minimal](minimal.md) | Bare data, no prose | Pragmatic users, CI/automation |
| [pragmatist](pragmatist.md) | Concise prose, no emoji | Professional contexts |
| [companion](companion.md) | Warm, light emoji, multilingual-friendly | Personal AI, long-term partners |

## How it works

1. User says "remember this: we chose Postgres for ACID"
2. `amem:remember` runs the 5-phase flow → returns `{action: "new", linked_count: 3, ...}`
3. Your voice layer reads the result and formats the confirmation

Without a voice layer, the skill emits a neutral default (see SKILL.md). The voice layer is purely additive.

## Writing your own

A voice layer is just a mapping from `action` (one of: `new`, `patched`, `skipped`, `conflict`) to a confirmation string, optionally templated with fields from the result.

Available fields:
- `{action}` — new | patched | skipped | conflict
- `{type}` — correction | decision | preference | pattern | topology | fact
- `{linked_count}` — integer
- `{linked_topics}` — list of tag strings
- `{conflict_with}` — id or null
- `{memory_id}` — id of the stored/patched memory
