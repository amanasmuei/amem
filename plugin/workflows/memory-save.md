# Workflow: memory-save

**Purpose**: Intelligent memory persistence with dedupe and knowledge graph linking.
**Surface-agnostic**: Callable from any tool that speaks amem MCP (Claude Code, Copilot CLI, VS Code, custom agents).
**Skill binding**: `amem:remember` implements this workflow inline. Registering this file with a workflow system (e.g., aman-ecosystem's aflow via `/workflows add`) gives users an inspectable, shareable definition separate from the skill's execution.

## Triggers (intent, not exact match)

- "remember this" / "save this" / "save it"
- "don't forget" / "keep this" / "jangan lupa"
- "ingat ni" / any language equivalent expressing memory-persistence intent
- **Not** triggered by: file saves, git commits, code persistence

## Inputs

| Input | Required | Source |
|-------|----------|--------|
| `content` | yes | User utterance, or referenced prior message |
| `type` | inferred | Classification heuristic (see Phase 1) |
| `confidence` | inferred | From type |
| `tags` | inferred | 2–5 topical tags from content |
| `scope` | optional | User convention (`personal:`, `project:<name>`, etc.) |

## Phases

### 1. Classify
Determine `type` ∈ {correction, decision, preference, pattern, topology, fact}.
Confidence mapping: correction=1.0, decision=0.9, preference=0.8, pattern/topology=0.7, fact=0.6.

### 2. Dedupe
- Tool: `memory_search(query=content, limit=5)`
- Decision tree:
  - sim ≥ 0.90 & same type → **skip** (return early)
  - sim 0.75–0.89 & same type → **patch** existing via `memory_patch`
  - contradicts (opposite polarity, same subject) → **conflict** (surface to user, do not auto-resolve)
  - sim < 0.75 → **new** (proceed)

### 3. Store
- Tool: `memory_store(content, type, confidence, tags, scope?)`
- For patch path: `memory_patch(existing_id, new_content)` instead.
- Capture returned id.

### 4. Link
- Tool: `memory_recall(query=content, limit=8)` → exclude just-stored id
- For each candidate with similarity ≥ 0.70: `memory_relate(new_id, candidate_id)`
- **Hard cap**: 5 links per new memory.

### 5. Return Result
Structured object:
```json
{
  "action": "new|patched|skipped|conflict",
  "memory_id": "<id>",
  "type": "<type>",
  "confidence": 0.9,
  "linked_count": 3,
  "linked_topics": ["<tag>", ...],
  "conflict_with": null,
  "patched_from": null
}
```

## Configuration

Optional `~/.amem/config.json` keys under `remember`:
- `dedupe_threshold_skip` (default 0.90)
- `dedupe_threshold_patch` (default 0.75)
- `link_threshold` (default 0.70)
- `link_max` (default 5)
- `default_scope` (default null)
- `voice_layer` (default null — neutral default used)

## Voice Layering

Workflow returns structured result. Confirmation formatting is the caller's concern. See `examples/voices/` for companion / pragmatist / minimal templates users can adopt or fork.

## Version

- `v1.0` — initial five-phase flow (classify → dedupe → store → link → return)

## Rationale

Plain `memory_store` accumulates duplicates and produces an unconnected pile over time. The five-phase flow solves both:
- **Dedupe** keeps the store clean — same preference stored 40 times becomes one patched memory with version history.
- **Linking** builds a knowledge graph that makes recall contextually rich (you get the constellation, not just the single point).

Separating the workflow definition from the skill's execution lets teams inspect/fork the process without editing plugin code.
