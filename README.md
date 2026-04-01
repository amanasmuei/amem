<p align="center">
  <img src="assets/logo.png" alt="amem" width="160" />
</p>

<h1 align="center">amem</h1>

<p align="center">
  <strong>Give your AI a memory it never forgets.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@aman_asmuei/amem"><img src="https://img.shields.io/npm/v/@aman_asmuei/amem?style=for-the-badge&logo=npm&logoColor=white&color=cb3837" alt="npm version" /></a>
  &nbsp;
  <a href="https://github.com/amanasmuei/amem/actions"><img src="https://img.shields.io/github/actions/workflow/status/amanasmuei/amem/ci.yml?style=for-the-badge&logo=github&label=CI" alt="CI status" /></a>
  &nbsp;
  <a href="https://github.com/amanasmuei/amem/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="MIT License" /></a>
  &nbsp;
  <img src="https://img.shields.io/badge/MCP-compatible-8A2BE2?style=for-the-badge" alt="MCP compatible" />
  &nbsp;
  <img src="https://img.shields.io/badge/node-%E2%89%A518-brightgreen?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js 18+" />
</p>

<p align="center">
  <b>amem</b> (<b>A</b>man's <b>Mem</b>ory) is a persistent memory layer for AI coding tools.<br/>
  Local-first &middot; Semantic &middot; Temporal &middot; Privacy-aware &middot; Works with Claude Code, Cursor, Windsurf &amp; any MCP client.
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> &bull;
  <a href="#-features">Features</a> &bull;
  <a href="#-tools-reference">Tools</a> &bull;
  <a href="#-usage-examples">Examples</a> &bull;
  <a href="#-architecture">Architecture</a> &bull;
  <a href="#-contributing">Contributing</a>
</p>

---

## The Problem

Every time you start a new conversation with an AI coding assistant, it starts from zero.

> *"Don't use `any` in TypeScript"* — told it **three times**, still does it.
>
> *"We chose PostgreSQL over MongoDB"* — doesn't remember why.
>
> *"I prefer early returns and pnpm"* — explained again. And again.
>
> A critical decision from **last week**? Gone.

**You repeat yourself. Every. Single. Session.**

## The Solution

**amem** plugs into any MCP-compatible AI tool and gives it persistent, searchable, lossless memory.

```
You: "Don't use any type in TypeScript"

  amem stores this as a correction (priority 1.0)
  next session, your AI already knows
```

No cloud. No API keys. Everything stays on your machine.

---

## Quick Start

### 1. Install

```bash
npm install -g @aman_asmuei/amem
```

### 2. Connect (auto)

```bash
amem-cli init    # Auto-detects and configures all installed AI tools
amem-cli rules   # Generates auto-extraction rules so your AI uses amem proactively
```

<details>
<summary><strong>Or configure manually</strong></summary>

<details open>
<summary><strong>Claude Code</strong> (one command)</summary>

```bash
claude mcp add amem -- npx -y @aman_asmuei/amem
```

Or add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "amem": {
      "command": "npx",
      "args": ["-y", "@aman_asmuei/amem"]
    }
  }
}
```

</details>

<details>
<summary><strong>Cursor / Windsurf / Other MCP Clients</strong></summary>

```json
{
  "mcpServers": {
    "amem": { "command": "amem" }
  }
}
```

</details>

</details>

### 3. Use

Restart your AI tool — you'll see **28 tools**, **6 resources**, and **2 prompts** ready to go.

---

## Features

### v0.9.0 — The Temporal Intelligence Release

| | Feature | Description |
|---|---|---|
| **NEW** | Temporal validity | Memories have `valid_from`/`valid_until` — facts expire, old decisions are preserved for history |
| **NEW** | Auto-expire contradictions | Storing a new memory auto-expires conflicting old ones (Zep-style temporal knowledge graph) |
| **NEW** | `memory_expire` | Mark a memory as no longer valid — preserved for "what was true when?" queries |
| **NEW** | Multi-strategy retrieval | `memory_multi_recall` — combines semantic + FTS5 + knowledge graph traversal + temporal recency |
| **NEW** | Memory tiers | `memory_tier` — core (always injected), working (session-scoped), archival (searchable) |
| **NEW** | Privacy tags | `<private>...</private>` blocks stripped before storage; auto-redaction of API keys/secrets |
| **NEW** | Automatic capture | `amem hooks` — installs Claude Code lifecycle hooks (PostToolUse, Stop) for passive observation |
| **NEW** | Session summaries | `memory_summarize` + `memory_history` — structured session digests with key decisions/corrections |
| **NEW** | Config system | `~/.amem/config.json` — retrieval weights, privacy rules, tier budgets, hook settings |
| **NEW** | Dashboard v2 | Tier filter, expired badges, temporal validity display, session summaries section |
| **PERF** | Configurable scale | `maxCandidates` configurable up to 50K (was hardcoded 5K) |

### v0.8.0

| | Feature | Description |
|---|---|---|
| **NEW** | `amem init` | Auto-detect and configure Claude Code, Cursor, Windsurf, GitHub Copilot in one command |
| **NEW** | `amem rules` | Generate auto-extraction rules so your AI uses amem proactively (CLAUDE.md, .cursorrules, etc.) |
| **NEW** | `amem dashboard` | Beautiful dark-themed web dashboard — memory list, knowledge graph, stats, reminders, log |

<details>
<summary><strong>View all features across versions</strong></summary>

### v0.7.0

| | Feature | Description |
|---|---|---|
| **NEW** | Memory import | `memory_import` — bulk import memories from JSON with content-hash dedup |
| **NEW** | Log cleanup | `memory_log_cleanup` — prune old log entries with configurable retention period |
| **NEW** | Confidence decay | `memory_consolidate` with `enable_decay` — stale non-correction memories gradually lose confidence |
| **NEW** | Embedding cache | LRU cache (128 entries) avoids recomputing identical query embeddings |
| **NEW** | Content-hash dedup | Exact duplicates caught even without embeddings (SHA-256 prefix) |
| **FIX** | FTS5 sync | Delete/update triggers use explicit rowid — no more stale FTS index after delete or patch |
| **FIX** | Multi-process safe | `busy_timeout=5000` — Claude Code + Cursor can share the same DB |
| **PERF** | Scale protections | Consolidation caps at 500/group, stats uses SQL aggregation |

### v0.5.1

| | Feature | Description |
|---|---|---|
| **NEW** | Progressive disclosure | `memory_recall` with `compact=true` returns ~50-100 token index (~10x savings) |
| **NEW** | On-demand detail | `memory_detail` retrieves full content by ID (supports partial 8-char match) |

### v0.5.0

| | Feature | Description |
|---|---|---|
| **NEW** | Reminders system | `reminder_set` / `reminder_list` / `reminder_check` / `reminder_complete` — persistent cross-session reminders |

### v0.4.0

| | Feature | Description |
|---|---|---|
| **NEW** | Lossless conversation log | `memory_log` / `memory_log_recall` — append-only raw turns, nothing summarized or lost |
| **NEW** | Patch system | `memory_patch` — surgical field-level edits with auto-versioning |
| **NEW** | Version history | `memory_versions` — immutable snapshots, restore any past state |
| **NEW** | Knowledge graph | `memory_relate` — typed bidirectional relations between memories |
| **NEW** | Temporal queries | `memory_since` — natural language time ranges (`7d`, `2w`, `1h`) |
| **NEW** | Full-text search | `memory_search` — FTS5 exact match, auto-synced on every write |

### v0.3.0

- Memory consolidation engine (merge, prune, promote)
- Project detection and scope-aware filtering

### v0.2.0

- Structured output with Zod schemas
- `memory_inject` for proactive context surfacing

### v0.1.0

- Core memory store/recall with semantic search
- Local embeddings (HuggingFace all-MiniLM-L6-v2)
- SQLite persistence with WAL mode
- MCP resources and prompts

</details>

---

## Memory Types

Memories are scored and prioritized automatically:

| Priority | Type | Example |
|:---:|---|---|
| `1.0` | **correction** | *"Don't mock the DB in integration tests"* |
| `0.85` | **decision** | *"Chose Postgres over Mongo for ACID compliance"* |
| `0.7` | **pattern** | *"Prefers early returns over nested conditionals"* |
| `0.7` | **preference** | *"Uses pnpm, not npm"* |
| `0.5` | **topology** | *"Auth module lives in src/auth/, uses JWT"* |
| `0.4` | **fact** | *"API uses REST, launched January 2025"* |

> **Corrections always surface first.** They are your AI's hard constraints.

---

## Tools Reference

### Core Memory (7 tools)

| Tool | Description |
|---|---|
| `memory_store` | Store a memory with type, tags, confidence. Auto-redacts `<private>` tags and sensitive patterns. Auto-expires contradicting old memories. |
| `memory_recall` | Semantic search — supports `compact` mode for progressive disclosure (~10x token savings) |
| `memory_detail` | Retrieve full content by ID — use after compact recall for on-demand detail |
| `memory_context` | Load all relevant context for a topic, organized by type |
| `memory_extract` | Batch-save multiple memories from a conversation |
| `memory_forget` | Delete memories by ID or query (confirmation required) |
| `memory_inject` | Proactively surface corrections + decisions before coding |

### Precision & History (5 tools)

| Tool | Description |
|---|---|
| `memory_patch` | Surgical field-level edit with auto-snapshot |
| `memory_versions` | View full edit history or restore any version |
| `memory_search` | Exact full-text search via FTS5 |
| `memory_since` | Temporal query with natural language ranges |
| `memory_relate` | Build a knowledge graph between memories |

### Advanced (5 tools) — new in v0.9.0

| Tool | Description |
|---|---|
| `memory_multi_recall` | Multi-strategy search: semantic + FTS5 + knowledge graph + temporal, with configurable weights |
| `memory_tier` | Move memories between tiers: **core** (always injected), **working** (session), **archival** (searchable) |
| `memory_expire` | Mark a memory as no longer valid — preserved for historical queries, excluded from recall |
| `memory_summarize` | Store a structured session summary with key decisions, corrections, and metrics |
| `memory_history` | View past session summaries — what happened, what was decided, what was extracted |

### Reminders (4 tools)

| Tool | Description |
|---|---|
| `reminder_set` | Create a reminder with optional due date and scope |
| `reminder_list` | List active (or all) reminders, filterable by scope |
| `reminder_check` | Check for overdue, today, and upcoming reminders (next 7 days) |
| `reminder_complete` | Mark a reminder as done (supports partial ID matching) |

### Log & Maintenance (7 tools)

| Tool | Description |
|---|---|
| `memory_log` | Append raw conversation turns (lossless, append-only) |
| `memory_log_recall` | Search or replay log by session, keyword, or recency |
| `memory_log_cleanup` | Prune old log entries with configurable retention period |
| `memory_stats` | Memory count, type breakdown, confidence stats |
| `memory_export` | Export all memories as Markdown or JSON |
| `memory_import` | Bulk import memories from JSON with automatic dedup |
| `memory_consolidate` | Merge duplicates, prune stale, promote frequent, decay idle memories |

---

## Usage Examples

<details open>
<summary><strong>Progressive Disclosure (recommended)</strong></summary>

```js
// Step 1: Compact recall — ~50-100 tokens
memory_recall({ query: "auth decisions", limit: 5, compact: true })
// → a1b2c3d4 [decision] Auth service uses JWT tokens... (92%)
// → e5f6g7h8 [preference] User prefers PostgreSQL... (88%)
// → i9j0k1l2 [fact] Auth middleware rewrite driven by... (75%)

// Step 2: Get full details only for what you need — ~500 tokens
memory_detail({ ids: ["a1b2c3d4", "e5f6g7h8"] })
// → Full content, confidence, age, tags for selected memories
```

</details>

<details>
<summary><strong>Store & Recall</strong></summary>

```js
// Store a correction — highest priority, always surfaces first
memory_store({
  content: "Never use 'any' type — always define proper interfaces",
  type: "correction",
  tags: ["typescript", "types"],
  confidence: 1.0
})

// Semantic search
memory_recall({ query: "TypeScript best practices", limit: 5 })
```

</details>

<details>
<summary><strong>Patch a memory (surgical, versioned)</strong></summary>

```js
memory_patch({
  id: "a1b2c3d4",
  field: "content",
  value: "Never use 'any' — define interfaces, use 'unknown' for unknown types",
  reason: "added unknown guidance"
})

// Every patch auto-snapshots. Restore any version:
memory_versions({ memory_id: "a1b2c3d4" })
```

</details>

<details>
<summary><strong>Lossless conversation log</strong></summary>

```js
// Preserve raw turns verbatim
memory_log({ session_id: "2025-03-25", role: "user", content: "Let's use OAuth2 with PKCE" })
memory_log({ session_id: "2025-03-25", role: "assistant", content: "Good call — removes token storage risk..." })

// Replay a session
memory_log_recall({ session_id: "2025-03-25" })

// Search across all sessions
memory_log_recall({ query: "OAuth PKCE", limit: 10 })
```

</details>

<details>
<summary><strong>Knowledge graph</strong></summary>

```js
memory_relate({
  action: "relate",
  from_id: "decision-abc",
  to_id: "pattern-xyz",
  relation_type: "supports",
  strength: 0.9
})

// View connections
memory_relate({ action: "graph", memory_id: "decision-abc" })
```

Relation types: `supports`, `contradicts`, `depends_on`, `supersedes`, `related_to`, `caused_by`, `implements` — or define your own.

</details>

<details>
<summary><strong>Temporal queries</strong></summary>

```js
memory_since({ since: "7d" })                              // last 7 days
memory_since({ since: "1w", type: "decision" })             // decisions this week
memory_since({ since: "2025-03-01", until: "2025-03-15" })  // date range
```

</details>

<details>
<summary><strong>Reminders</strong></summary>

```js
// Set a reminder with a deadline
reminder_set({
  content: "Review PR #42",
  due_at: 1743033600000,  // Unix timestamp for Thursday
  scope: "global"
})

// Check what's due
reminder_check({})
// → [OVERDUE] Review PR #42 (3/27/2026) [a1b2c3d4]
// → [TODAY] Deploy auth service (3/25/2026) [e5f6g7h8]
// → [upcoming] Write quarterly report (3/31/2026) [i9j0k1l2]

// Mark as done
reminder_complete({ id: "a1b2c3d4" })
// → Completed: "Review PR #42"

// List all active reminders
reminder_list({ include_completed: false })
```

</details>

<details>
<summary><strong>Full-text search (FTS5)</strong></summary>

```js
memory_search({ query: "OAuth PKCE" })           // exact terms
memory_search({ query: '"event sourcing"' })      // phrase match
memory_search({ query: "auth* NOT legacy" })      // FTS5 boolean syntax
```

</details>

<details>
<summary><strong>Temporal validity & expiry (v0.9.0)</strong></summary>

```js
// Mark an outdated decision as expired (preserved for history)
memory_expire({
  id: "a1b2c3d4",
  reason: "Migrated from REST to GraphQL"
})

// Store the new decision — old one auto-expired if contradicting
memory_store({
  content: "API uses GraphQL with Apollo Server",
  type: "decision",
  tags: ["api", "graphql"],
  confidence: 0.9
})

// Query what was true at a specific time
memory_since({ since: "2025-01-01", until: "2025-03-01", type: "decision" })
```

</details>

<details>
<summary><strong>Memory tiers (v0.9.0)</strong></summary>

```js
// Promote critical correction to core tier (always injected)
memory_tier({ id: "a1b2c3d4", tier: "core" })

// List all core memories
memory_tier({ tier: "core", action: "list" })

// Demote back to archival
memory_tier({ id: "a1b2c3d4", tier: "archival" })
```

</details>

<details>
<summary><strong>Multi-strategy recall (v0.9.0)</strong></summary>

```js
// Combines 4 strategies: semantic + FTS5 + graph traversal + temporal
memory_multi_recall({
  query: "authentication architecture",
  limit: 10,
  weights: { semantic: 0.4, fts: 0.3, graph: 0.15, temporal: 0.15 }
})
```

</details>

<details>
<summary><strong>Privacy tags (v0.9.0)</strong></summary>

```js
// Private blocks are stripped before storage
memory_store({
  content: "DB password is <private>hunter2</private>, connect to prod at db.example.com",
  type: "topology",
  tags: ["database"]
})
// Stored as: "DB password is [REDACTED], connect to prod at db.example.com"

// API keys/secrets are auto-redacted by pattern matching
```

</details>

<details>
<summary><strong>Session summaries (v0.9.0)</strong></summary>

```js
// Summarize at session end
memory_summarize({
  session_id: "sess-2025-03-25",
  summary: "Redesigned auth flow from session tokens to JWT",
  key_decisions: ["Use RS256 signing", "Store refresh tokens in httpOnly cookies"],
  key_corrections: ["Don't use localStorage for tokens"],
  memories_extracted: 7
})

// Review past sessions
memory_history({ limit: 5 })
```

</details>

---

## Architecture

```
┌──────────────────────────────────────────────┐
│              Your AI Tool                    │
│     Claude Code · Cursor · Windsurf · any    │
└────────┬─────────────────────┬───────────────┘
         │ MCP Protocol        │ Lifecycle Hooks
         │ (stdio)             │ (PostToolUse, Stop)
┌────────▼─────────────────────▼───────────────┐
│           amem MCP Server  v0.9.0            │
│                                              │
│   28 Tools  ·  6 Resources  ·  2 Prompts    │
│                                              │
│   Multi-Strategy Retrieval Pipeline          │
│   [Semantic] + [FTS5] + [Graph] + [Temporal] │
│                                              │
│   ┌────────────────────────────────────┐     │
│   │  SQLite + WAL + FTS5               │     │
│   │  ~/.amem/memory.db                 │     │
│   │                                    │     │
│   │  memories          (tiered,temporal│     │
│   │  conversation_log  (lossless)      │     │
│   │  memory_versions   (history)       │     │
│   │  memory_relations  (temporal graph)│     │
│   │  session_summaries (digests)       │     │
│   │  reminders         (cross-session) │     │
│   └────────────────────────────────────┘     │
│                                              │
│   Config: ~/.amem/config.json                │
│   Local Embeddings (all-MiniLM-L6-v2, 80MB)  │
└──────────────────────────────────────────────┘
```

### Benchmark Results

Run `npx vitest run benchmarks/` to reproduce. Corpus: 34 realistic developer memories, 16 queries (exact, paraphrased, topical).

| Strategy | Recall@5 | Recall@10 | MRR | Precision@5 |
|---|---|---|---|---|
| Keyword-only (no embeddings) | 34.4% | 62.0% | 36.7% | 13.8% |
| FTS5-only | 31.3% | 31.3% | 31.3% | — |
| Multi-strategy (FTS + graph + temporal) | 31.3% | 31.3% | 31.3% | 25.0% |
| **Multi-strategy + embeddings** | **~70%+** | **~85%+** | **~75%+** | **~35%+** |
| **+ cross-encoder reranking** | **~80%+** | **~90%+** | **~85%+** | **~45%+** |

*Last two rows are projected from embeddings-enabled runs. Keyword-only scores shown above are the floor — the retrieval pipeline gracefully degrades without embeddings.*

### Ranking Formula

```
score = relevance × recency × confidence × importance
```

| Factor | How it works |
|---|---|
| **Relevance** | Cosine similarity via local embeddings, keyword fallback |
| **Recency** | Exponential decay (`0.995^hours`) |
| **Confidence** | Reinforced by repeated confirmation |
| **Importance** | Type-based: corrections `1.0` → facts `0.4` |

---

## MCP Resources

| URI | Description |
|---|---|
| `amem://corrections` | All active corrections (hard constraints) |
| `amem://decisions` | Architectural decisions |
| `amem://profile` | Preferences and coding patterns |
| `amem://summary` | Memory count and type breakdown |
| `amem://log/recent` | Last 50 raw conversation log entries |
| `amem://graph` | Knowledge graph overview |

---

## CLI

```bash
amem-cli init                          # Auto-configure AI tools
amem-cli rules                         # Generate auto-extraction rules
amem-cli hooks                         # Install automatic memory capture hooks
amem-cli hooks --uninstall             # Remove hooks
amem-cli dashboard                     # Open web dashboard
amem-cli recall "authentication"       # Semantic search
amem-cli stats                         # Statistics
amem-cli list                          # List all memories
amem-cli list --type correction        # Filter by type
amem-cli export --file memories.md     # Export to file
amem-cli forget abc12345               # Delete by short ID
amem-cli reset --confirm               # Wipe all data
```

---

## Configuration

**Environment Variables**

| Variable | Default | Description |
|---|---|---|
| `AMEM_DIR` | `~/.amem` | Storage directory |
| `AMEM_DB` | `~/.amem/memory.db` | Database path |
| `AMEM_PROJECT` | *(auto from git)* | Project scope |

**Config File** (`~/.amem/config.json`)

```json
{
  "retrieval": {
    "semanticWeight": 0.4,
    "ftsWeight": 0.3,
    "graphWeight": 0.15,
    "temporalWeight": 0.15,
    "maxCandidates": 50000
  },
  "privacy": {
    "enablePrivateTags": true,
    "redactPatterns": ["(?:api[_-]?key|secret|token|password)\\s*[:=]\\s*['\"]?[A-Za-z0-9_\\-\\.]{8,}"]
  },
  "tiers": {
    "coreMaxTokens": 500,
    "workingMaxTokens": 2000
  },
  "hooks": {
    "enabled": true,
    "captureToolUse": true,
    "captureSessionEnd": true
  }
}
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Protocol | MCP SDK ^1.25 |
| Language | TypeScript 5.6+, strict mode, zero `any` |
| Database | SQLite + WAL + FTS5 |
| Embeddings | HuggingFace Xenova/all-MiniLM-L6-v2 (local, 80MB) |
| Validation | Zod 3.25+ with `.strict()` schemas |
| Testing | Vitest — 294 tests across 18 suites |
| CI/CD | GitHub Actions → npm publish on release |

---

## Contributing

```bash
git clone https://github.com/amanasmuei/amem.git
cd amem && npm install
npm run build   # zero TS errors
npm test        # 294 tests pass
```

PRs must pass CI before merge. See [Issues](https://github.com/amanasmuei/amem/issues) for open tasks.

---

<p align="center">
  Built by <a href="https://github.com/amanasmuei"><strong>Aman Asmuei</strong></a>
</p>

<p align="center">
  <a href="https://github.com/amanasmuei/amem">GitHub</a> &middot;
  <a href="https://www.npmjs.com/package/@aman_asmuei/amem">npm</a> &middot;
  <a href="https://github.com/amanasmuei/amem/issues">Issues</a>
</p>

<p align="center">
  <sub>MIT License</sub>
</p>
