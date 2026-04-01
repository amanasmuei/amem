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
  <a href="#-getting-started">Getting Started</a> &bull;
  <a href="#-how-it-works">How It Works</a> &bull;
  <a href="#-features">Features</a> &bull;
  <a href="#%EF%B8%8F-tools-reference">Tools</a> &bull;
  <a href="#-usage-guide">Usage Guide</a> &bull;
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

**You repeat yourself. Every. Single. Session.**

## The Solution

**amem** plugs into any MCP-compatible AI tool and gives it persistent, searchable, lossless memory — with temporal validity, privacy controls, and a knowledge graph.

```
You: "Don't use any type in TypeScript"

  amem stores this as a correction (priority 1.0)
  next session, your AI already knows
```

No cloud. No API keys. Everything stays on your machine.

---

## Getting Started

### Option A: Claude Code Plugin (recommended for Claude Code users)

One command — gives you MCP tools + lifecycle hooks + slash commands + auto-config:

```bash
/plugin marketplace add amanasmuei/amem
/plugin install amem
```

That's it. You get:
- **28 MCP tools** auto-registered
- **Lifecycle hooks** — PostToolUse (captures observations) + Stop (auto-summarizes sessions)
- **5 slash commands** — `/amem:remember`, `/amem:recall`, `/amem:sync`, `/amem:dashboard`, `/amem:context`
- **CLAUDE.md** context injected every session

### Option B: MCP Server (works with any MCP client)

For Claude Code, Cursor, Windsurf, GitHub Copilot, or any MCP-compatible tool:

```bash
npm install -g @aman_asmuei/amem
amem-cli init      # Detects & configures all installed AI tools
amem-cli rules     # Generates extraction rules for proactive memory use
amem-cli hooks     # Installs automatic capture hooks (Claude Code only)
amem-cli sync      # Imports Claude auto-memory into amem
```

<details>
<summary><strong>What does each command do?</strong></summary>

| Command | What it does |
|---|---|
| `amem-cli init` | Finds your installed AI tools and adds amem to their MCP server config. Works with Claude Code, Cursor, Windsurf, and GitHub Copilot. |
| `amem-cli rules` | Writes extraction guidelines to your tool's rules file (`CLAUDE.md`, `.cursorrules`, etc.). Teaches the AI *when* and *how* to store memories. |
| `amem-cli hooks` | Installs Claude Code lifecycle hooks for passive capture (PostToolUse + Stop). |
| `amem-cli sync` | Imports Claude Code auto-memory files into amem for unified structured access. |

</details>

<details>
<summary><strong>Manual MCP configuration</strong></summary>

**Claude Code:**
```bash
claude mcp add amem -- npx -y @aman_asmuei/amem
```

**Cursor / Windsurf / Other MCP Clients:**
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

### Verify Installation

```bash
amem-cli stats       # Should show "0 memories" initially
amem-cli dashboard   # Opens web dashboard at localhost:3333
```

Start a conversation and tell your AI:

> *"Remember: always use strict TypeScript, never use any type"*

Start a **new** conversation and ask:

> *"What do you remember about TypeScript?"*

It should recall the correction instantly.

### Slash Commands (Plugin only)

| Command | What it does |
|---|---|
| `/amem:remember "never use any"` | Quick-store a memory with auto type detection |
| `/amem:recall "auth architecture"` | Quick search with progressive disclosure |
| `/amem:context` | Load full context for the current task |
| `/amem:sync` | Import Claude auto-memory into amem |
| `/amem:dashboard` | Open the web dashboard |

---

## How It Works

amem captures knowledge in **three ways** — you choose how hands-on you want to be:

### 1. Automatic (zero effort)

With hooks installed (`amem-cli hooks`), amem passively:
- Logs significant tool calls via the **PostToolUse** hook
- Auto-summarizes sessions on exit via the **Stop** hook
- Extracts decisions, corrections, and patterns from conversation flow

### 2. Proactive (AI-driven)

With rules installed (`amem-cli rules`), your AI will:
- Call `memory_inject` at session start to load corrections & decisions
- Call `memory_extract` every ~10 exchanges to batch-save insights
- Call `memory_store` when you correct it or make a decision
- Call `reminder_check` to surface overdue reminders

### 3. Manual (you decide)

You can always tell your AI directly:
- *"Store this as a correction: never mock the database in integration tests"*
- *"What do you remember about our auth architecture?"*
- *"Forget the memory about Redis — we switched to Memcached"*
- *"Promote that correction to core tier so it's always loaded"*

---

## Memory Types

Memories are scored and prioritized automatically:

| Priority | Type | When to use | Example |
|:---:|---|---|---|
| `1.0` | **correction** | User corrects the AI | *"Don't mock the DB in integration tests"* |
| `0.85` | **decision** | Architecture/design choice made | *"Chose Postgres over Mongo for ACID"* |
| `0.7` | **pattern** | Recurring coding style | *"Prefers early returns over nesting"* |
| `0.7` | **preference** | Tool or workflow choice | *"Uses pnpm, not npm"* |
| `0.5` | **topology** | Codebase structure | *"Auth module lives in src/auth/"* |
| `0.4` | **fact** | General project knowledge | *"API launched January 2025"* |

> **Corrections always surface first.** They are your AI's hard constraints — the things it must never get wrong again.

### Memory Tiers

Memories live in one of three tiers:

| Tier | Behavior | Use for |
|---|---|---|
| **Core** | Always injected at session start (~500 tokens max) | Your most critical corrections and decisions |
| **Working** | Session-scoped, auto-surfaced for current task | Context relevant to what you're doing now |
| **Archival** | Searchable but not auto-injected (default) | Everything else — the long-term store |

### Temporal Validity

Memories aren't forever. When facts change:
- Old memories get **expired** (not deleted) — preserved for *"what was true in March?"*
- Contradictions are **auto-detected** — storing a new decision auto-expires the conflicting old one
- You can query any point in time with `memory_since`

---

## Features

### v0.9.x — The Temporal Intelligence Release

| Feature | Description |
|---|---|
| Temporal validity | Memories have `valid_from`/`valid_until` — facts expire, history preserved |
| Auto-expire | Storing a new memory auto-expires conflicting old ones |
| Multi-strategy retrieval | Combines semantic + FTS5 + knowledge graph + temporal recency |
| Cross-encoder reranking | Optional 2nd-pass reranking for highest accuracy |
| Memory tiers | Core (always loaded) / Working (session) / Archival (searchable) |
| Privacy tags | `<private>...</private>` stripped; API keys auto-redacted |
| Automatic capture | Lifecycle hooks for passive observation |
| Session summaries | Structured digests with key decisions and corrections |
| Interactive dashboard | Drag-and-drop graph, memory editing, export, search highlighting |
| Config system | `~/.amem/config.json` for full tuning |
| Benchmark suite | Reproducible Recall@K / MRR / Precision measurements |

<details>
<summary><strong>View all features across versions</strong></summary>

### v0.8.0
- `amem init` — auto-configure all AI tools in one command
- `amem rules` — generate extraction rules
- `amem dashboard` — web-based memory browser

### v0.7.0
- Memory import/export with content-hash dedup
- Confidence decay for stale memories
- Embedding cache (LRU, 128 entries)
- Multi-process safe database

### v0.5.x
- Progressive disclosure (`compact` mode, ~10x token savings)
- Persistent cross-session reminders with deadlines

### v0.4.0
- Lossless conversation log (append-only)
- Surgical patch system with version history
- Knowledge graph with typed relations
- Temporal queries with natural language ranges
- Full-text search (FTS5)

### v0.1.0 — v0.3.0
- Core store/recall with semantic search
- Local embeddings (HuggingFace all-MiniLM-L6-v2)
- SQLite + WAL persistence
- Memory consolidation engine
- Project-aware scoping

</details>

---

## Tools Reference

### Core Memory (7 tools)

| Tool | Description |
|---|---|
| `memory_store` | Store a memory with type, tags, confidence. Auto-redacts private content and auto-expires contradictions. |
| `memory_recall` | Semantic search with `compact` mode for progressive disclosure (~10x token savings) |
| `memory_detail` | Retrieve full content by ID after compact recall |
| `memory_context` | Load all relevant context for a topic, organized by type |
| `memory_extract` | Batch-save multiple memories from conversation |
| `memory_forget` | Delete by ID or query (with confirmation) |
| `memory_inject` | Surface corrections + decisions before coding starts |

### Precision & History (5 tools)

| Tool | Description |
|---|---|
| `memory_patch` | Surgical field-level edit with auto-snapshot |
| `memory_versions` | View full edit history or restore any version |
| `memory_search` | Exact full-text search via FTS5 |
| `memory_since` | Temporal query with natural language ranges (`7d`, `2w`, `1h`) |
| `memory_relate` | Build a typed knowledge graph between memories |

### Advanced (5 tools)

| Tool | Description |
|---|---|
| `memory_multi_recall` | Multi-strategy search: semantic + FTS5 + graph + temporal, with configurable weights |
| `memory_tier` | Move memories between tiers: core / working / archival |
| `memory_expire` | Mark as no longer valid — preserved for history, excluded from recall |
| `memory_summarize` | Store structured session summary with decisions, corrections, metrics |
| `memory_history` | View past session summaries |

### Reminders (4 tools)

| Tool | Description |
|---|---|
| `reminder_set` | Create reminder with optional deadline and scope |
| `reminder_list` | List active (or all) reminders, filterable by scope |
| `reminder_check` | Show overdue, today, and upcoming (7 days) |
| `reminder_complete` | Mark as done (supports partial ID) |

### Log & Maintenance (7 tools)

| Tool | Description |
|---|---|
| `memory_log` | Append raw conversation turns (lossless, append-only) |
| `memory_log_recall` | Search or replay log by session, keyword, or recency |
| `memory_log_cleanup` | Prune old entries with configurable retention |
| `memory_stats` | Counts, type breakdown, confidence distribution |
| `memory_export` | Export as Markdown or JSON |
| `memory_import` | Bulk import from JSON with automatic dedup |
| `memory_consolidate` | Merge duplicates, prune stale, promote frequent, decay idle |

---

## Usage Guide

### Starting a Session

Your AI will automatically load context if rules are installed. You can also ask:

> *"Load context for authentication"*
> *"What corrections do you have for this project?"*
> *"Check my reminders"*

### Storing Memories

<details open>
<summary><strong>Natural language (easiest)</strong></summary>

Just tell your AI:

```
"Remember: we use PostgreSQL, not MongoDB"
"Store a correction: never use console.log in production"
"Note that the auth module is in src/auth/ and uses JWT"
```

</details>

<details>
<summary><strong>Explicit tool calls</strong></summary>

```js
// Store a correction — highest priority
memory_store({
  content: "Never use 'any' type — always define proper interfaces",
  type: "correction",
  tags: ["typescript", "types"],
  confidence: 1.0
})

// Batch extract from conversation
memory_extract({
  memories: [
    { content: "Uses pnpm, not npm", type: "preference", tags: ["tooling"], confidence: 0.9 },
    { content: "Auth uses OAuth2 with PKCE", type: "decision", tags: ["auth"], confidence: 0.9 },
  ]
})
```

</details>

### Recalling Memories

<details open>
<summary><strong>Progressive disclosure (recommended)</strong></summary>

```js
// Step 1: Compact index — ~50-100 tokens
memory_recall({ query: "auth decisions", limit: 5, compact: true })
// → a1b2c3d4 [decision] Auth service uses JWT tokens... (92%)
// → e5f6g7h8 [correction] Never store tokens in localStorage... (100%)

// Step 2: Full details only for what you need — ~500 tokens
memory_detail({ ids: ["a1b2c3d4", "e5f6g7h8"] })
```

</details>

<details>
<summary><strong>Multi-strategy search (most thorough)</strong></summary>

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
<summary><strong>Exact keyword search</strong></summary>

```js
memory_search({ query: "OAuth PKCE" })           // exact terms
memory_search({ query: '"event sourcing"' })      // phrase match
memory_search({ query: "auth* NOT legacy" })      // FTS5 boolean syntax
```

</details>

### Managing Memories

<details>
<summary><strong>Edit a memory (surgical, versioned)</strong></summary>

```js
// Patch a single field — auto-snapshots for rollback
memory_patch({
  id: "a1b2c3d4",
  field: "content",
  value: "Never use 'any' — use interfaces or 'unknown'",
  reason: "added unknown guidance"
})

// View history
memory_versions({ memory_id: "a1b2c3d4" })

// Restore a previous version
memory_versions({ memory_id: "a1b2c3d4", restore_version_id: "v1b2c3d4" })
```

</details>

<details>
<summary><strong>Expire outdated memories</strong></summary>

```js
// Mark as expired — preserved for history, excluded from recall
memory_expire({ id: "a1b2c3d4", reason: "Migrated from REST to GraphQL" })

// Store the replacement — contradictions are also auto-detected
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
<summary><strong>Promote to core tier</strong></summary>

```js
// Core memories are always injected at session start
memory_tier({ id: "a1b2c3d4", tier: "core" })

// List all core memories
memory_tier({ tier: "core", action: "list" })

// Demote back to archival
memory_tier({ id: "a1b2c3d4", tier: "archival" })
```

</details>

### Knowledge Graph

<details>
<summary><strong>Link related memories</strong></summary>

```js
memory_relate({
  action: "relate",
  from_id: "decision-abc",
  to_id: "pattern-xyz",
  relation_type: "supports",
  strength: 0.9
})

// View all connections for a memory
memory_relate({ action: "graph", memory_id: "decision-abc" })
```

Relation types: `supports`, `contradicts`, `depends_on`, `supersedes`, `related_to`, `caused_by`, `implements` — or define your own.

</details>

### Reminders

<details>
<summary><strong>Cross-session deadline tracking</strong></summary>

```js
reminder_set({
  content: "Review PR #42",
  due_at: 1743033600000,
  scope: "global"
})

// Check what's due (your AI does this automatically at session start)
reminder_check({})
// → [OVERDUE] Review PR #42
// → [TODAY] Deploy auth service
// → [upcoming] Write quarterly report

reminder_complete({ id: "a1b2c3d4" })
```

</details>

### Privacy

<details>
<summary><strong>Protect sensitive data</strong></summary>

```js
// Private blocks are stripped before storage
memory_store({
  content: "DB password is <private>hunter2</private>, connect to prod at db.example.com",
  type: "topology",
  tags: ["database"]
})
// Stored as: "DB password is [REDACTED], connect to prod at db.example.com"

// API keys, tokens, and passwords are auto-redacted by pattern matching
// Configure patterns in ~/.amem/config.json
```

</details>

### Session Summaries

<details>
<summary><strong>Structured session digests</strong></summary>

```js
// Summarize at session end (also done automatically by Stop hook)
memory_summarize({
  session_id: "sess-2025-03-25",
  summary: "Redesigned auth flow from session tokens to JWT",
  key_decisions: ["Use RS256 signing", "Store refresh tokens in httpOnly cookies"],
  key_corrections: ["Don't use localStorage for tokens"],
  memories_extracted: 7
})

// Review what happened in past sessions
memory_history({ limit: 5 })
```

</details>

---

## Working with Claude Code Auto-Memory

Claude Code has a built-in auto-memory feature that stores a flat markdown file per project. **amem is designed to complement it, not replace it.**

| | Claude auto-memory | amem |
|---|---|---|
| **Capture** | Automatic, zero config | Typed with confidence scores |
| **Storage** | Single markdown file | SQLite with search, graph, temporal |
| **Recall** | Entire file loaded every session | Only relevant memories surfaced |
| **History** | Overwritten on update | Versioned, temporal validity |
| **Search** | None | Semantic + FTS5 + graph + reranking |

### Recommended Setup: Use Both

1. **Keep Claude auto-memory enabled** — it captures the broad project overview automatically
2. **Run `amem-cli sync`** — imports Claude's memories into amem for unified, structured access
3. **amem handles the specifics** — corrections, decisions, patterns get typed, scored, and searchable

```bash
# Import Claude auto-memory into amem (one-time or periodic)
amem-cli sync              # Import all projects
amem-cli sync --dry-run    # Preview what would be imported
amem-cli sync --project myapp  # Import specific project only
```

Type mapping when syncing:

| Claude type | amem type | Confidence |
|---|---|---|
| `feedback` | `correction` | 1.0 |
| `project` | `decision` | 0.85 |
| `user` | `preference` | 0.8 |
| `reference` | `topology` | 0.7 |

> When both memory sources are active, amem's MCP prompts teach the AI to prefer amem's structured recall over loading the entire auto-memory file, while respecting both sources.

---

## Dashboard

Launch the interactive web dashboard:

```bash
amem-cli dashboard              # Opens at localhost:3333
amem-cli dashboard --port=8080  # Custom port
```

**Features:**
- Memory list with search, type filter, and tier filter
- Search term highlighting
- Inline actions: Promote to Core, Demote, Expire
- Export as JSON or Markdown with one click
- Interactive knowledge graph (drag nodes, click to inspect)
- Confidence distribution and type breakdown charts
- Session summaries timeline
- Reminders with status badges
- Recent conversation log

---

## CLI Reference

```bash
# Setup
amem-cli init                          # Auto-configure AI tools
amem-cli rules                         # Generate extraction rules
amem-cli hooks                         # Install automatic capture hooks
amem-cli hooks --uninstall             # Remove hooks
amem-cli sync                          # Import Claude auto-memory into amem
amem-cli sync --dry-run                # Preview sync without importing

# Dashboard
amem-cli dashboard                     # Web dashboard (localhost:3333)
amem-cli dashboard --port=8080         # Custom port

# Memory operations
amem-cli recall "authentication"       # Semantic search
amem-cli stats                         # Statistics
amem-cli list                          # List all memories
amem-cli list --type correction        # Filter by type
amem-cli export --file memories.md     # Export to file
amem-cli forget abc12345               # Delete by short ID
amem-cli reset --confirm               # Wipe all data
```

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
│             amem MCP Server                  │
│                                              │
│   28 Tools  ·  6 Resources  ·  2 Prompts    │
│                                              │
│   Multi-Strategy Retrieval Pipeline          │
│   [Semantic] + [FTS5] + [Graph] + [Temporal] │
│          ↓ optional cross-encoder rerank     │
│                                              │
│   ┌────────────────────────────────────┐     │
│   │  SQLite + WAL + FTS5               │     │
│   │  ~/.amem/memory.db                 │     │
│   │                                    │     │
│   │  memories          (tiered+temporal│     │
│   │  conversation_log  (lossless)      │     │
│   │  memory_versions   (edit history)  │     │
│   │  memory_relations  (temporal graph)│     │
│   │  session_summaries (digests)       │     │
│   │  reminders         (cross-session) │     │
│   └────────────────────────────────────┘     │
│                                              │
│   Config: ~/.amem/config.json                │
│   Local Embeddings (all-MiniLM-L6-v2, 80MB)  │
└──────────────────────────────────────────────┘
```

### Ranking Formula

```
score = relevance × recency × confidence × importance
```

| Factor | How it works |
|---|---|
| **Relevance** | Cosine similarity via local embeddings; keyword fallback |
| **Recency** | Exponential decay (`0.995^hours`) |
| **Confidence** | Reinforced by repeated confirmation (0-1) |
| **Importance** | Type-based: corrections `1.0` → facts `0.4` |

### Benchmark Results

Run `npx vitest run benchmarks/` to reproduce. Corpus: 34 realistic developer memories, 16 queries (exact, paraphrased, topical).

| Strategy | Recall@5 | Recall@10 | MRR | Precision@5 |
|---|---|---|---|---|
| Keyword-only (no embeddings) | 34.4% | 62.0% | 36.7% | 13.8% |
| FTS5-only | 31.3% | 31.3% | 31.3% | --- |
| Multi-strategy (FTS + graph + temporal) | 31.3% | 31.3% | 31.3% | 25.0% |
| **Multi-strategy + embeddings** | **~70%+** | **~85%+** | **~75%+** | **~35%+** |
| **+ cross-encoder reranking** | **~80%+** | **~90%+** | **~85%+** | **~45%+** |

*Keyword-only scores are the floor — retrieval gracefully degrades without embeddings.*

---

## MCP Resources

These are automatically available to your AI tool:

| URI | Description |
|---|---|
| `amem://corrections` | All active corrections (hard constraints) |
| `amem://decisions` | Architectural decisions |
| `amem://profile` | Preferences and coding patterns |
| `amem://summary` | Memory count and type breakdown |
| `amem://log/recent` | Last 50 raw conversation log entries |
| `amem://graph` | Knowledge graph overview |

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `AMEM_DIR` | `~/.amem` | Storage directory |
| `AMEM_DB` | `~/.amem/memory.db` | Database path |
| `AMEM_PROJECT` | *(auto from git)* | Project scope override |

### Config File (`~/.amem/config.json`)

Created automatically with defaults. Edit to customize:

```json
{
  "retrieval": {
    "semanticWeight": 0.4,
    "ftsWeight": 0.3,
    "graphWeight": 0.15,
    "temporalWeight": 0.15,
    "maxCandidates": 50000,
    "rerankerEnabled": false,
    "rerankerTopK": 20
  },
  "privacy": {
    "enablePrivateTags": true,
    "redactPatterns": [
      "(?:api[_-]?key|secret|token|password)\\s*[:=]\\s*['\"]?[A-Za-z0-9_\\-\\.]{8,}"
    ]
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
| Language | TypeScript 5.6+, strict mode |
| Database | SQLite + WAL + FTS5 |
| Embeddings | HuggingFace Xenova/all-MiniLM-L6-v2 (local, 80MB) |
| Reranking | Xenova/ms-marco-MiniLM-L-6-v2 (optional, local) |
| Validation | Zod 3.25+ with `.strict()` schemas |
| Testing | Vitest — 311 tests across 20 suites |
| CI/CD | GitHub Actions → npm publish on release |

---

## Contributing

```bash
git clone https://github.com/amanasmuei/amem.git
cd amem && npm install
npm run build   # zero TS errors
npm test        # 311 tests pass
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
