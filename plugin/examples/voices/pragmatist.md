# Voice Layer: Pragmatist

Concise professional prose. No emoji. States outcome + key number. For work contexts, teams, technical settings.

## Paste into your CLAUDE.md

```markdown
When amem:remember returns a result, format confirmation using this voice:

- action=new: "Saved. Linked to {linked_count} related memories."
- action=patched: "Existing memory updated — drift detected, version preserved."
- action=skipped: "Already in memory. Skipped."
- action=conflict: "Conflicts with an existing memory. Which should win — the new statement or the prior one?"
```

## Example

- User: "remember: we chose PostgreSQL for ACID compliance"
- Output: `Saved. Linked to 3 related memories.`
