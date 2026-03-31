# Copilot Instructions for amem

## Build, Test, Lint

```bash
npm run build                                # tsc — must produce zero errors
npm test                                     # vitest run — full suite (199 tests)
npx vitest run tests/memory.test.ts          # single test file
npx vitest run -t "should compute score"     # single test by name
npm run dev                                  # tsc --watch
```

No linter is configured. The TypeScript compiler (`strict: true`) is the primary safety net.

## Architecture

amem is an MCP server that gives AI coding tools persistent, searchable memory backed by SQLite. It communicates over stdio and exposes 21 tools, 6 resources, and 2 prompts via the MCP protocol.

### Module dependency chain

```
index.ts  — entry point: MCP server init, project detection, resource/prompt registration, auto-backup
  ├── database.ts  — SQLite layer: 7 tables, prepared statements, FTS5 triggers, migrations
  │     └── transaction(), resolveId(), resolveReminderId(), getAllRelations() — centralized DB ops
  ├── tools/       — 21 MCP tool registrations, split by domain:
  │     ├── index.ts      — registerTools() orchestrator + re-exports (TYPE_ORDER, formatAge)
  │     ├── helpers.ts    — shared constants (SHORT_ID_LENGTH, CHARACTER_LIMIT) and utilities
  │     ├── memory.ts     — 11 core tools: store, recall, detail, context, forget, extract, stats, export, inject, consolidate, patch
  │     ├── versions.ts   — memory_versions tool
  │     ├── log.ts        — memory_log, memory_log_recall tools
  │     ├── graph.ts      — memory_relate, memory_since, memory_search tools
  │     └── reminders.ts  — reminder_set, reminder_list, reminder_check, reminder_complete tools
  ├── memory.ts    — ranking engine (scoring, consolidation, recall, explain mode)
  ├── schemas.ts   — Zod output schemas (discriminated unions)
  ├── embeddings.ts — HuggingFace all-MiniLM-L6-v2 (optional, graceful fallback)
  └── cli.ts  — standalone CLI entry point (read-only DB operations)
```

### Data flow

1. **Startup** (`index.ts`): Create SQLite DB with WAL mode → auto-backup (keeps last 3) → detect project scope from `AMEM_PROJECT` env var or git repo walk-up → register tools, resources, prompts
2. **Tool call** (`tools/*.ts`): Validate input (`.strict()` Zod) → DB operations → rank/score results → return `{ content: [{ type: "text", text }], structuredContent }`
3. **Ranking** (`memory.ts`): `score = relevance × recency × confidence × importance`
   - `recency = 0.995 ^ hoursSinceAccess` (exponential decay)
   - `relevance`: cosine similarity if embeddings available, keyword match (0.75) or broad fallback (0.5) otherwise
   - With `explain: true`, returns per-memory breakdown of all four scoring factors
4. **Embeddings** (`embeddings.ts`): Lazy-loaded singleton via dynamic `import()` of optional `@huggingface/transformers`. Returns `null` if unavailable — ranking degrades gracefully to keyword matching. Failures logged to stderr with `[amem]` prefix.

### Database tables

- `memories` — core store with embedding BLOBs and scope column
- `memories_fts` / `log_fts` — FTS5 virtual tables, auto-synced via INSERT/UPDATE/DELETE triggers
- `conversation_log` — append-only raw conversation turns
- `memory_versions` — immutable snapshots for patch audit trail
- `memory_relations` — knowledge graph edges (typed, directional, weighted)
- `reminders` — cross-session task queue with due dates

### Project scoping

`GLOBAL_TYPES = ["correction", "preference", "pattern"]` — always scope `"global"`, surface in every project. Other types (`decision`, `topology`, `fact`) are auto-scoped to the detected project. Queries filter: `WHERE scope = 'global' OR scope = ?`.

### Memory type constants

Adding a new memory type requires updating all four of these:

```typescript
// memory.ts
MemoryType = { CORRECTION, DECISION, PATTERN, PREFERENCE, TOPOLOGY, FACT } as const;
IMPORTANCE_WEIGHTS = { correction: 1.0, decision: 0.85, pattern: 0.7, preference: 0.7, topology: 0.5, fact: 0.4 };

// tools/helpers.ts
TYPE_ORDER = ["correction", "decision", "pattern", "preference", "topology", "fact"];  // display order

// tools/index.ts
GLOBAL_TYPES = ["correction", "preference", "pattern"];  // auto-scope to "global"
```

### Consolidation thresholds

- **Merge**: cosine similarity > 0.85 → keep higher confidence, boost by +0.1. Batched by type (corrections are never merged). All mutations wrapped in a single `db.transaction()` for atomicity.
- **Prune**: stale > 60 days AND confidence < 0.3 AND access count < N (all three required; never prunes corrections). `min_access_count` is configurable via `memory_consolidate` tool.
- **Promote**: access count ≥ 5 AND confidence < 0.8 → boost to 0.9

### Short ID matching

Tools that accept memory IDs support 8-character prefix matching via `db.resolveId(partialId)` in database.ts (SQL `LIKE` prefix match, returns `null` if 0 or 2+ matches). Display uses `shortId(id)` helper (defined in `tools/helpers.ts`). The `SHORT_ID_LENGTH` constant is `8`.

### Transactions

`db.transaction(fn)` wraps synchronous operations in a SQLite transaction (rollback on error). For async work (like embedding generation), pre-compute async results first, then batch all DB writes inside `db.transaction()`. See `memory_extract` in `tools/memory.ts` for the canonical pattern.

### Auto-backup

On startup, `backupDatabase()` in `index.ts` copies the DB to `~/.amem/backups/memory-{timestamp}.db`, keeping the last 3 backups and deleting older ones.

## Conventions

### TypeScript

- **Strict mode** with no `@ts-ignore` escape hatches
- **ESM only** — `"type": "module"`. All imports use `.js` extensions: `import { createDatabase } from "./database.js"`
- **Dynamic import** for optional deps: `await import("@huggingface/transformers")`
- **Error narrowing**: always `error instanceof Error ? error.message : String(error)` in catch blocks

### Zod schemas

- **Input schemas** (inline in `tools/*.ts`): always `.strict()` — reject unknown fields
- **Output schemas** (schemas.ts): lenient, using discriminated unions for multi-outcome responses (e.g., `StoreResultSchema` has `action: "stored" | "conflict_resolved"`)

### Adding an MCP tool

1. Define its output schema in `schemas.ts`
2. Add the `registerTool` call in the appropriate `tools/*.ts` sub-module
3. If creating a new tool group, create a new sub-module and register it in `tools/index.ts`

Every tool follows this structure:

```typescript
server.registerTool(
  "tool_name",
  {
    title: "Human Title",
    description: "...",
    inputSchema: z.object({ /* fields */ }).strict(),
    outputSchema: SomeResultSchema,
    annotations: {
      readOnlyHint: boolean,     // true if tool only reads
      destructiveHint: boolean,  // true if tool can delete data
      idempotentHint: boolean,   // true if safe to call repeatedly
      openWorldHint: false,      // always false — local DB only
    },
  },
  async (args) => {
    return { content: [{ type: "text", text: "..." }], structuredContent: { ... } };
  },
);
```

### Database layer

- All queries use prepared statements (`better-sqlite3`)
- FTS5 queries wrap in try/catch with fallback to `LIKE` — special characters can break FTS5 syntax. Failures logged with `[amem]` prefix.
- Embeddings stored as `Float32Array` → `Buffer` BLOBs
- Schema migrations are defensive: check with `PRAGMA table_info()` before `ALTER TABLE`
- Batch operations (extract, consolidation) use `db.transaction()` for atomicity

### Testing

Tests live in two places by design:
- **`src/*.test.ts`** — unit tests of core algorithms (no MCP server mocking)
- **`tests/*.test.ts`** — integration tests with real temp databases on disk

Patterns:
- Each test gets a fresh temp DB: `path.join(os.tmpdir(), \`amem-test-${Date.now()}.db\`)`
- Cleanup in `afterEach`: close DB then `fs.unlinkSync(dbPath)`
- No external service mocks — all real SQLite
- Embeddings tested with synthetic `Float32Array` vectors
- Test timeout: 30 seconds (vitest.config.ts)
- Scale tests with 1000+ memories in `tests/hardening.test.ts`

### CI

- Tests run on Node 18, 20, and 22 matrix
- Release: CI passes → `npm publish --access public` on GitHub release event
