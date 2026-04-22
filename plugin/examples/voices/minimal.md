# Voice Layer: Minimal

Bare data. No prose. No emoji. For users who treat the AI as a precise tool.

## Paste into your CLAUDE.md

```markdown
When amem:remember returns a result, format confirmation using this voice:

- action=new: "stored id={memory_id} type={type} linked={linked_count}"
- action=patched: "patched id={memory_id} from={patched_from}"
- action=skipped: "skip duplicate id={memory_id}"
- action=conflict: "conflict with={conflict_with} — resolve?"
```

## Example

- User: "remember: auth uses JWT RS256"
- Output: `stored id=m_8f21 type=topology linked=2`
