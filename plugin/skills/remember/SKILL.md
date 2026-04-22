---
name: remember
description: Persist a memory with intelligence — classify, dedupe against existing memories, store with metadata, and link to related entries. Use when the user says "remember this", "save this", "don't forget", "keep this", "save it", or equivalent intent in any language. Do NOT fire for file saves, git commits, or code persistence — only knowledge/memory persistence.
---

# /amem:remember — Smart Memory Save

The user wants to persist something worth remembering. Run the 5-phase flow below. Do not shortcut to a bare `memory_store` call — dedupe and linking are what make this skill worth more than the raw MCP tool.

## The 5-Phase Flow

### Phase 1: Classify

From `$ARGUMENTS` (or the referenced content if the user said "save that" / "remember what I just said"), determine:

| Field | How |
|-------|-----|
| **content** | The self-contained statement to store. Rewrite for clarity if needed. Include the *why* when available. |
| **type** | `correction` (user correcting you) · `decision` (architecture/tool choice) · `preference` (tool/style preference) · `pattern` (recurring approach) · `topology` (codebase location) · `fact` (general knowledge) |
| **confidence** | `1.0` corrections · `0.9` decisions · `0.8` preferences · `0.7` patterns/topology · `0.6` facts |
| **tags** | 2–5 topical tags. Infer from content. |
| **scope** | Optional. If the user has a scope convention (`personal:`, `project:<name>`, `work:`, `dev:<tool>`), use it. Otherwise omit. |

### Phase 2: Dedupe

**Always run before storing.** Without this, memory accumulates duplicates over weeks.

1. Call `memory_search` with the content as query, `limit: 5`
2. Inspect top result similarity:
   - **Similarity ≥ 0.90 AND same type** → likely duplicate. Action: `skipped`. Return early.
   - **Similarity 0.75–0.89 AND same type** → drift / update. Action: `patched`. Use `memory_patch` on the existing memory id instead of creating new.
   - **Contradicts existing** (opposite polarity, same subject) → Action: `conflict`. Surface to user, do NOT auto-resolve. Ask which wins.
   - **Similarity < 0.75** → Action: `new`. Proceed to Phase 3.

### Phase 3: Store

Call `memory_store` with the classified fields. Capture the returned memory id.

For `patched` action, use `memory_patch` instead — preserves version history.

### Phase 4: Link

Build the knowledge graph automatically. Prevents memories from becoming orphaned islands.

1. Call `memory_recall` with the new content, `limit: 8`, filter out the just-stored id.
2. For each candidate with similarity ≥ 0.70, call `memory_relate` to create an edge.
3. **Cap at 5 links.** More than that is noise, not signal.

Skip linking entirely for `skipped` action.

### Phase 5: Return Structured Result

**Do NOT format a personality-laden confirmation yourself.** Return the structured result below and let the user's voice layer (if any) format it. If no voice layer is configured, emit the neutral default.

```
{
  "action": "new" | "patched" | "skipped" | "conflict",
  "memory_id": "<id>",
  "type": "<type>",
  "confidence": <float>,
  "linked_count": <int>,
  "linked_topics": ["<tag>", ...],
  "conflict_with": "<id>" | null,
  "patched_from": "<id>" | null
}
```

## Default Neutral Voice

Use these one-liners unless the user has a voice layer configured (see `examples/voices/` in the amem plugin):

- `new` → *"Saved. {linked_count} related memories linked."*
- `patched` → *"Updated existing memory — drift detected, versioned."*
- `skipped` → *"Already in memory. Skipped."*
- `conflict` → *"Conflicts with existing: '{existing_content_preview}'. Which should I keep?"*

## Configuration

Reads optional `~/.amem/config.json`:

```json
{
  "remember": {
    "dedupe_threshold_skip": 0.90,
    "dedupe_threshold_patch": 0.75,
    "link_threshold": 0.70,
    "link_max": 5,
    "default_scope": null,
    "voice_layer": null
  }
}
```

Missing config → defaults above. All knobs optional.

## Examples

| User says | Classify | Expected path |
|-----------|----------|---------------|
| "remember: never use `any` in TypeScript" | correction, 1.0 | Phase 2 finds no duplicate → `new` + link to existing TS memories |
| "save this — we chose PostgreSQL for ACID" | decision, 0.9 | Phase 2 may find prior DB discussion → `new` + link |
| "don't forget I prefer pnpm over npm" | preference, 0.8 | If already stored → `skipped` |
| "remember the auth module is in src/middleware/auth.ts" | topology, 0.7 | If path changed from prior memory → `patched` |
| "save it — actually we went with Mongo now" | decision, 0.9 | If prior decision said Postgres → `conflict`, ask user |

## Important

- `memory_store` alone is not enough — dedupe and linking are the value.
- Never auto-resolve `conflict`. Surface it.
- Patches preserve history via `memory_patch`; never overwrite raw.
- Link cap is a hard limit — noise kills graph utility.
- Companion skills: see also `/amem:recall` for retrieval, `/amem:context` for session load.

## For Workflow Users

This skill implements the `memory-save` workflow (see `workflows/memory-save.md` in the amem plugin). Users of workflow-aware tools (e.g., aman-ecosystem's aflow) can register that workflow to inspect/share the flow definition separately from the skill.
