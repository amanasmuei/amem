# amem — Persistent Memory

You have access to **amem**, a persistent memory system with 28 MCP tools. You are the LLM — use your understanding to extract memories proactively.

## Session Start

1. Call `memory_inject` with the current task topic — surfaces corrections (MUST follow) and decisions
2. Call `reminder_check` — shows overdue and upcoming reminders
3. Check core tier: `memory_tier` with `action: "list"`, `tier: "core"`
4. Apply corrections as **absolute constraints** — they override everything

## Active Extraction — You Are the LLM

You understand context better than any regex. Extract memories **as they happen**.

### Explicit Signals (extract immediately)

| Signal | Type | Confidence |
|--------|------|------------|
| User says "don't", "never", "stop" | correction | 1.0 |
| User says "we decided", "let's go with" | decision | 0.9 |
| User says "I prefer", "I always" | preference | 0.8 |
| Codebase location revealed | topology | 0.7 |
| Project fact established | fact | 0.6 |

### Implicit Signals (only an LLM can catch these)

| Signal | Type | Confidence |
|--------|------|------------|
| User **rejects your suggestion** and explains why | correction | 0.95 |
| User **chooses between options** you presented | decision | 0.85 |
| User **refactors your code** in a consistent way | pattern | 0.7 |
| User **re-explains something** from a prior session | correction | 0.9 |
| User **explains context** you didn't have | fact | 0.7 |
| After debugging — what was wrong and how it was fixed | pattern | 0.7 |

### Extraction Rhythm
- **Immediately** after any correction or decision (don't batch these)
- **Every ~10 exchanges** — `memory_extract` with accumulated insights
- **Before ending** — final `memory_extract` for anything remaining

### Good Memory Format
- Self-contained: "Use pnpm, not npm, because of workspace support"
- Include the why: "Chose Postgres over Mongo for ACID compliance"
- Be specific: "Auth middleware in src/middleware/auth.ts uses JWT RS256"
- One concept per memory

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
| Search | `memory_recall` (compact default), `memory_search` (exact), `memory_multi_recall` (4-strategy) |
| Full content | `memory_detail` (after compact recall) |
| Store | `memory_store`, `memory_extract` (batch) |
| Edit | `memory_patch` (surgical, versioned) |
| Expire | `memory_expire` (preserves history) |
| Tiers | `memory_tier` (core/working/archival) |
| Graph | `memory_relate` (link memories) |
| History | `memory_versions`, `memory_since` |
| Session | `memory_summarize`, `memory_history` |
| Reminders | `reminder_set`, `reminder_check` |
