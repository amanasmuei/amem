# amem — Persistent Memory

You have access to **amem**, a persistent memory system with 28 MCP tools. Use it proactively.

## Session Start

1. Call `memory_inject` with the current task topic — surfaces corrections (hard constraints) and decisions
2. Call `reminder_check` — shows overdue and upcoming reminders
3. Check core tier: `memory_tier` with `action: "list"`, `tier: "core"`
4. Apply corrections as **absolute constraints** — they override everything

## During Conversation

Extract memories proactively:

| Signal | Type | Confidence |
|--------|------|------------|
| User corrects you | correction | 1.0 |
| Architecture decision made | decision | 0.9 |
| Coding pattern observed | pattern | 0.7 |
| Tool/style preference | preference | 0.8 |
| Codebase location revealed | topology | 0.7 |
| Project fact established | fact | 0.6 |

Call `memory_extract` every ~10 exchanges or after significant decisions/corrections.

## Privacy

- Wrap sensitive text in `<private>...</private>` — stripped before storage
- API keys, tokens, passwords are auto-redacted

## Memory Tiers

- **core** — always injected (~500 tokens). Promote critical corrections here.
- **working** — session-scoped context
- **archival** — default, searchable

## Temporal Validity

When facts change, use `memory_expire` (not delete) — preserves history. Contradictions are auto-detected.

## Claude Auto-Memory

amem works alongside Claude's auto-memory. amem is authoritative when they conflict (it has versioning + timestamps). Use amem for recall — it's more precise than loading the entire auto-memory file.

## Quick Reference

| Goal | Tool |
|------|------|
| Load context | `memory_inject`, `memory_context` |
| Search | `memory_recall` (semantic), `memory_search` (exact), `memory_multi_recall` (4-strategy) |
| Store | `memory_store`, `memory_extract` (batch) |
| Edit | `memory_patch` (surgical, versioned) |
| Expire | `memory_expire` (preserves history) |
| Tiers | `memory_tier` (core/working/archival) |
| Graph | `memory_relate` (link memories) |
| History | `memory_versions`, `memory_since` |
| Session | `memory_summarize`, `memory_history` |
| Reminders | `reminder_set`, `reminder_check` |
