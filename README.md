<p align="center">
  <img src="assets/logo.png" alt="amem" width="160" />
</p>

<h1 align="center">amem</h1>

<p align="center">
  <strong>One memory. Every AI tool.</strong>
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
  Tell your AI something once — it remembers across Claude Code, GitHub Copilot, Cursor, Windsurf, and any MCP client.<br/>
  Local-first &middot; Semantic search &middot; Knowledge graph &middot; Self-evolving &middot; Privacy-aware &middot; No cloud required.
</p>

<br/>

<table align="center">
  <tr>
    <td><strong>94.6% R@5</strong><br/><sub>LongMemEval Oracle, 500q</sub></td>
    <td><strong>0.08ms</strong><br/><sub>Search at 10k memories</sub></td>
    <td><strong>29 MCP tools</strong><br/><sub>Full memory toolkit</sub></td>
    <td><strong>Powered by</strong><br/><sub><a href="https://github.com/amanasmuei/amem-core">amem-core</a></sub></td>
  </tr>
</table>

<br/>

<p align="center">
  <a href="#-quick-start">Quick Start</a> &bull;
  <a href="#-how-it-works">How It Works</a> &bull;
  <a href="#-benchmarks">Benchmarks</a> &bull;
  <a href="#-tools-reference">Tools</a> &bull;
  <a href="#-usage-guide">Usage Guide</a> &bull;
  <a href="#-architecture">Architecture</a>
</p>

---

## Why amem?

Every AI tool starts from zero. Every session. Every tool.

> *"Don't use `any` in TypeScript"* — told Claude three times. Copilot still doesn't know.
>
> *"We chose PostgreSQL over MongoDB"* — explained in Cursor. Claude has no idea.

**amem** gives all your AI tools a shared, persistent memory.

```
You (in Claude Code):  "Don't use any type in TypeScript"
  amem stores this as a correction (priority 1.0)

You (switch to Copilot): starts coding
  Copilot already knows — amem feeds it the same correction
```

No cloud. No API keys. Everything stays on your machine.

---

## 🧬 Powered by `amem-core`

`amem` is the **MCP server**. The actual memory engine — embeddings, recall, knowledge graph, contradiction detection, reflection — lives in a separate package: [`@aman_asmuei/amem-core`](https://github.com/amanasmuei/amem-core).

```
        Claude Code / Copilot / Cursor / any MCP client
                          │
                          │ MCP (stdio)
                          ▼
          ┌─────────────────────────────────┐
          │   @aman_asmuei/amem (this pkg)  │
          │   29 MCP tools, CLI, hooks      │
          └────────────────┬────────────────┘
                           │ imports
                           ▼
          ┌─────────────────────────────────┐
          │   @aman_asmuei/amem-core        │
          │   embeddings · HNSW · recall    │
          │   knowledge graph · reflection  │
          │   91.0% R@5 on LongMemEval      │
          └────────────────┬────────────────┘
                           │
                           ▼
                ┌────────────────────┐
                │  SQLite (one file) │
                │  ~/.amem/memory.db │
                └────────────────────┘
```

| Package | Role | Install | Use case |
|---|---|---|---|
| **`@aman_asmuei/amem`** *(this)* | MCP server + CLI + hooks | `npm install -g @aman_asmuei/amem` | Plug into Claude Code, Copilot, Cursor, any MCP client |
| **`@aman_asmuei/amem-core`** | Pure TypeScript library, zero MCP deps | `npm install @aman_asmuei/amem-core` | Embed memory directly in your own Node app |

**Why the split?** The same engine powers `amem` (this MCP server), `aman-agent` (CLI), `aman-tg` (Telegram bot), and any other Node app you want to give memory to. All retrieval-quality improvements ship via `amem-core`. All MCP-tool changes ship via `amem`. They version independently.

> The **94.6% R@5** headline is the engine quality from `amem-core` — exactly what you get whether you call it through this MCP server or import the library directly. The MCP wrapper does not change retrieval quality.

---

## Quick Start

<table>
<tr>
<td width="50%">

**Claude Code** (recommended)

```bash
/plugin marketplace add amanasmuei/amem
/plugin install amem
```

</td>
<td width="50%">

**GitHub Copilot CLI**

```bash
copilot plugin marketplace add amanasmuei/amem
copilot plugin install amem
```

</td>
</tr>
</table>

<details>
<summary><strong>Cursor / Windsurf / Any MCP Client</strong></summary>

```bash
npm install -g @aman_asmuei/amem
amem-cli init      # Detects & configures all installed AI tools
amem-cli rules     # Generates extraction rules for proactive memory use
```

Or configure manually:

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

**Verify it works:**

```bash
amem-cli stats     # Should show "0 memories" initially
```

Tell your AI: *"Remember: always use strict TypeScript, never use any type"*

Start a **new** session: *"What do you remember about TypeScript?"* — it recalls instantly.

---

## How It Works

amem captures knowledge in **three layers** — from fully automatic to fully manual:

| Layer | How | What it does |
|---|---|---|
| **Automatic** | Lifecycle hooks | Captures tool observations, auto-extracts corrections/decisions/patterns at session end |
| **AI-driven** | Extraction rules | Your AI proactively calls `memory_store` when you correct it, make decisions, or express preferences |
| **Manual** | Natural language | *"Remember: we use PostgreSQL"* or *"Forget the Redis memory"* |

### Memory Types

| Priority | Type | Example |
|:---:|---|---|
| **1.0** | **correction** | *"Don't mock the DB in integration tests"* |
| **0.85** | **decision** | *"Chose Postgres over Mongo for ACID"* |
| **0.7** | **pattern** | *"Prefers early returns over nesting"* |
| **0.7** | **preference** | *"Uses pnpm, not npm"* |
| **0.5** | **topology** | *"Auth module lives in src/auth/"* |
| **0.4** | **fact** | *"API launched January 2025"* |

Corrections always surface first — they are your AI's hard constraints.

### Memory Tiers

| Tier | Behavior |
|---|---|
| **Core** | Always injected at session start (~500 tokens). Your most critical corrections. |
| **Working** | Session-scoped, auto-surfaced for current task. |
| **Archival** | Default. Searchable but not auto-injected. |

### Temporal Validity

Memories aren't forever. When facts change:
- Old memories get **expired** (not deleted) — preserved for *"what was true in March?"*
- Contradictions are **auto-detected** ��� storing a new decision auto-expires the old one
- Query any point in time with `memory_since`

### Self-Evolving Memory Loop

Your memory doesn't just store — it **learns from its own structure**. Call `memory_reflect` to trigger the reflection engine:

```
memory_reflect → Analyzes your entire memory graph
  │
  ├─ Clusters related memories (HNSW neighbor graph)
  ├─ Detects contradictions (negation pairs, numerical, low-overlap)
  ├─ Identifies synthesis candidates
  ├─ Surfaces knowledge gaps (topics with sparse recall)
  └─ Returns a structured report with suggested actions
```

**The evolution loop:**

1. **Reflect** — `memory_reflect` clusters your memories and finds patterns
2. **Synthesize** — AI merges related clusters into higher-order principles via `memory_store`
3. **Link** — `memory_relate` connects syntheses to source memories (tracked via synthesis lineage)
4. **Repeat** — each cycle, the graph becomes more coherent and abstract

The system auto-nudges when reflection is due (>7 days or >50 new memories since last run).

<details>
<summary><strong>What the reflection report looks like</strong></summary>

```
# Memory Reflection Report
Analyzed 127 memories in 12ms
Health Score: 68/100

## Stats
- Clusters: 8 (avg size: 4.2)
- Clustered: 34 | Orphans: 93
- Contradictions: 2
- Synthesis candidates: 3
- Knowledge gaps: 4

## Contradictions Found
⚠ Opposing language detected (23d apart, 87% similar)
  A: a1b2c3d4 "Always use semicolons in JavaScript..."
  B: e5f6g7h8 "Never use semicolons in JavaScript..."
  → Expire older memory a1b2c3d4 — newer supersedes it

## Synthesis Candidates
### cluster-0 (4 patterns)
  "These 4 related memories form a cluster about 'typescript, types':
  [patterns]:
    - 'Always use strict TypeScript types'
    - 'Prefer strict null checks'
    - 'Use unknown instead of any'
    - 'Enable strictNullChecks in tsconfig'

  Synthesize into a higher-order principle..."

## Knowledge Gaps
- "kubernetes deployment" — asked 3x, avg 25% confidence
- "database migration strategy" — asked 2x, avg 0% confidence
```

</details>

---

## Benchmarks

### Recall Accuracy

<table>
<tr>
<td>

| Strategy | Recall@5 | MRR |
|---|---|---|
| FTS5 keyword only | 31.3% | 31.3% |
| **Semantic** (default) | **72.4%** | **82.5%** |
| **Multi-strategy** | **74.5%** | **76.2%** |
| + reranking (opt-in) | ~80%+ | ~85%+ |

</td>
<td>

Corpus: 34 developer memories, 16 queries, 5 graph edges.

Reproduce: `npx vitest run benchmarks/`

**Default: 72% Recall@5, 82% MRR** with local embeddings. Degrades gracefully to keyword matching (~31%) before model downloads.

</td>
</tr>
</table>

### Search Latency — HNSW Vector Index

<table>
<tr>
<td>

| Memories | HNSW | Brute-force | Speedup |
|---|---|---|---|
| 100 | 0.05ms | 0.10ms | 2x |
| 1,000 | 0.06ms | 0.50ms | **8x** |
| 5,000 | 0.08ms | 2.44ms | **30x** |
| 10,000 | 0.08ms | 5.35ms | **67x** |

</td>
<td>

Measured: 100 searches averaged, 384-dim embeddings, top-10 results.

**Sub-0.1ms at any scale** — effectively O(log n). HNSW is an optional dependency; brute-force is used as fallback when unavailable.

</td>
</tr>
</table>

---

## Tools Reference

### Core Memory (7 tools)

| Tool | Description |
|---|---|
| `memory_store` | Store a memory with type, tags, confidence. Auto-redacts private content, auto-expires contradictions. |
| `memory_recall` | Semantic search — compact mode by default (~10x token savings). Use `memory_detail` for full content. |
| `memory_detail` | Retrieve full content by ID after compact recall. |
| `memory_context` | Load all relevant context for a topic, organized by type with token budgeting. |
| `memory_extract` | Batch-save multiple memories from conversation. |
| `memory_forget` | Delete by ID or query (with confirmation). |
| `memory_inject` | Surface corrections + decisions + graph neighbors before coding starts. |

<details>
<summary><strong>Precision, History, Advanced, Reminders, and Maintenance tools (22 more)</strong></summary>

### Precision & History (5 tools)

| Tool | Description |
|---|---|
| `memory_patch` | Surgical field-level edit with auto-snapshot. |
| `memory_versions` | View full edit history or restore any version. |
| `memory_search` | Exact full-text search via FTS5 with compact mode. |
| `memory_since` | Temporal query with natural language ranges (`7d`, `2w`, `1h`). |
| `memory_relate` | Build a typed knowledge graph between memories. |

### Advanced (6 tools)

| Tool | Description |
|---|---|
| `memory_multi_recall` | Multi-strategy search with compact mode: semantic + FTS5 + graph + temporal. |
| `memory_tier` | Move memories between tiers: core / working / archival. |
| `memory_expire` | Mark as no longer valid — preserved for history, excluded from recall. |
| `memory_summarize` | Store structured session summary with decisions, corrections, metrics. |
| `memory_history` | View past session summaries. |
| `memory_reflect` | Self-evolving reflection engine — clusters memories, detects contradictions, identifies synthesis candidates, surfaces knowledge gaps. |

### Reminders (4 tools)

| Tool | Description |
|---|---|
| `reminder_set` | Create reminder with optional deadline and scope. |
| `reminder_list` | List active (or all) reminders, filterable by scope. |
| `reminder_check` | Show overdue, today, and upcoming (7 days). |
| `reminder_complete` | Mark as done (supports partial ID). |

### Log & Maintenance (7 tools)

| Tool | Description |
|---|---|
| `memory_log` | Append raw conversation turns (lossless, append-only). |
| `memory_log_recall` | Search or replay log by session, keyword, or recency. |
| `memory_log_cleanup` | Prune old entries with configurable retention. |
| `memory_stats` | Counts, type breakdown, confidence distribution. |
| `memory_export` | Export as Markdown or JSON. |
| `memory_import` | Bulk import from JSON with automatic dedup. |
| `memory_consolidate` | Merge duplicates, prune stale, promote frequent, decay idle. |

</details>

---

## Usage Guide

### Storing Memories

<table>
<tr>
<td width="50%">

**Natural language** (easiest)

```
"Remember: we use PostgreSQL, not MongoDB"
"Store a correction: never use console.log in production"
"Note that the auth module is in src/auth/"
```

</td>
<td width="50%">

**Explicit tool calls**

```js
memory_store({
  content: "Never use 'any' — define proper interfaces",
  type: "correction",
  tags: ["typescript"],
  confidence: 1.0
})
```

</td>
</tr>
</table>

### Recalling Memories

```js
// Step 1: Compact index — ~50-100 tokens (default)
memory_recall({ query: "auth decisions", limit: 5 })
// -> a1b2c3d4 [decision] Auth service uses JWT tokens... (92%)
// -> e5f6g7h8 [correction] Never store tokens in localStorage... (100%)

// Step 2: Full details only for what you need
memory_detail({ ids: ["a1b2c3d4", "e5f6g7h8"] })
```

<details>
<summary><strong>More search options</strong></summary>

```js
// Multi-strategy: semantic + FTS5 + graph + temporal
memory_multi_recall({
  query: "authentication architecture",
  limit: 10,
  weights: { semantic: 0.4, fts: 0.3, graph: 0.15, temporal: 0.15 }
})

// Exact keyword search (FTS5 syntax)
memory_search({ query: "OAuth PKCE" })
memory_search({ query: '"event sourcing"' })     // phrase match
memory_search({ query: "auth* NOT legacy" })      // boolean
```

</details>

### Managing Memories

<details>
<summary><strong>Edit, expire, promote, link</strong></summary>

```js
// Surgical edit with auto-snapshot for rollback
memory_patch({ id: "a1b2c3d4", field: "content", value: "Updated text", reason: "clarified" })

// View edit history / restore
memory_versions({ memory_id: "a1b2c3d4" })

// Expire (preserve for history, exclude from recall)
memory_expire({ id: "a1b2c3d4", reason: "Migrated to GraphQL" })

// Promote to core tier (always loaded at session start)
memory_tier({ id: "a1b2c3d4", tier: "core" })

// Link related memories (graph builds itself, but you can add manual links)
memory_relate({ action: "relate", from_id: "abc", to_id: "xyz", relation_type: "supports" })
```

Relation types: `supports`, `contradicts`, `depends_on`, `supersedes`, `related_to`, `caused_by`, `implements` — or define your own.

</details>

### Reminders

<details>
<summary><strong>Cross-session deadline tracking</strong></summary>

```js
reminder_set({ content: "Review PR #42", due_at: 1743033600000, scope: "global" })

reminder_check({})
// -> [OVERDUE] Review PR #42
// -> [TODAY] Deploy auth service
// -> [upcoming] Write quarterly report

reminder_complete({ id: "a1b2c3d4" })
```

</details>

### Privacy

<details>
<summary><strong>Automatic redaction</strong></summary>

```js
// Private blocks stripped before storage
memory_store({
  content: "DB password is <private>hunter2</private>, connect to prod at db.example.com",
  type: "topology", tags: ["database"]
})
// Stored: "DB password is [REDACTED], connect to prod at db.example.com"

// API keys, tokens, passwords auto-redacted by pattern matching
// Configure patterns in ~/.amem/config.json
```

</details>

---

## Platform Compatibility

| Feature | Claude Code | GitHub Copilot CLI | Cursor / Windsurf / Other |
|---|:---:|:---:|:---:|
| One-command plugin install | Yes | Yes | -- |
| 29 MCP tools | Yes | Yes | Yes |
| AI skills | 14 | 7 | -- |
| Auto-capture hooks | Yes | Yes | -- |
| Session auto-summarize | Yes | Yes | -- |
| Auto-memory sync | Yes | -- | -- |
| CLI setup (`amem-cli init`) | Yes | Yes | Yes |

**Claude Code** has the deepest integration (plugin + hooks + auto-memory sync). **Copilot CLI** is a close second. **Other MCP clients** get the full 29-tool server via manual config.

### AI Skills

| What you say | Skill | Claude Code | Copilot CLI |
|---|---|:---:|:---:|
| *"Remember never use any type"* | `remember` | Yes | Yes |
| *"What do you remember about auth?"* | `recall` | Yes | Yes |
| *"Load context for this task"* | `context` | Yes | Yes |
| *"Show memory stats"* | `stats` | Yes | Yes |
| *"Run memory doctor"* | `doctor` | Yes | Yes |
| *"Export my memories"* | `export` | Yes | Yes |
| *"List all corrections"* | `list` | Yes | Yes |
| *"Sync my Claude memory"* | `sync` | Yes | -- |
| *"Open the memory dashboard"* | `dashboard` | Yes | -- |
| *"Install hooks"* | `hooks` | Yes | -- |

---

## Working with Claude Code Auto-Memory

amem complements Claude's built-in auto-memory — it doesn't replace it.

| | Claude auto-memory | amem |
|---|---|---|
| **Capture** | Automatic, zero config | Typed with confidence scores |
| **Storage** | Single markdown file | SQLite with search, graph, temporal |
| **Recall** | Entire file loaded every session | Only relevant memories surfaced |
| **History** | Overwritten on update | Versioned, temporal validity |
| **Search** | None | Semantic + FTS5 + graph + reranking |

**Recommended:** Keep both enabled. Run `amem-cli sync` to import Claude's memories into amem for unified, structured access.

<details>
<summary><strong>Claude → amem sync</strong></summary>

```bash
amem-cli sync              # Import all projects
amem-cli sync --dry-run    # Preview what would be imported
amem-cli sync --project myapp  # Import specific project
```

| Claude type | amem type | Confidence |
|---|---|---|
| `feedback` | `correction` | 1.0 |
| `project` | `decision` | 0.85 |
| `user` | `preference` | 0.8 |
| `reference` | `topology` | 0.7 |

</details>

<details>
<summary><strong>amem → Copilot sync</strong></summary>

Export amem memories to `.github/copilot-instructions.md` so Copilot reads them as persistent context:

```bash
amem-cli sync --to copilot              # Export to current project
amem-cli sync --to copilot --dry-run    # Preview without writing
amem-cli sync --to copilot --project /path/to/repo
```

This generates structured markdown grouped by priority:
1. **Corrections** (MUST follow) — hard constraints
2. **Decisions** — architectural choices
3. **Preferences** — user preferences
4. **Patterns** — coding conventions
5. **Context** — topology + facts

The amem section is wrapped in `<!-- amem:start/end -->` markers — existing non-amem content in the file is preserved.

**Cross-tool sync:** Decisions made in Claude sessions automatically inform Copilot:
```
Claude Code → amem sync → amem DB → amem sync --to copilot → copilot-instructions.md
```

</details>

---

## Dashboard

```bash
amem-cli dashboard              # Opens at localhost:3333
amem-cli dashboard --port=8080  # Custom port
```

Memory list with search and filters (type, tier, source), inline actions (promote, demote, expire), interactive knowledge graph, confidence charts, session timeline, reminders, conversation log, and **Copilot Instructions Preview** panel with copy-to-clipboard.

---

## CLI Reference

```bash
# Setup
amem-cli init                          # Auto-configure AI tools
amem-cli rules                         # Generate extraction rules
amem-cli hooks                         # Install hooks for Claude Code
amem-cli hooks --target copilot        # Install hooks for GitHub Copilot CLI
amem-cli hooks --uninstall             # Remove hooks
amem-cli sync                          # Import Claude auto-memory → amem
amem-cli sync --to copilot             # Export amem → copilot-instructions.md
amem-cli doctor                        # Health diagnostics
amem-cli repair                        # Repair corrupted database from backups

# Dashboard
amem-cli dashboard                     # Web dashboard (localhost:3333)

# Memory operations
amem-cli recall "authentication"       # Semantic search
amem-cli stats                         # Statistics
amem-cli list --type correction        # List by type
amem-cli export --file memories.md     # Export to file
amem-cli forget abc12345               # Delete by short ID
amem-cli reset --confirm               # Wipe all data
```

---

## Architecture

```
                        Your AI Tool
           Claude Code / Copilot CLI / any MCP client
                    │                │
                    │ MCP (stdio)    │ Lifecycle Hooks
                    ▼                ▼
          ┌─────────────────────────────────┐
          │   @aman_asmuei/amem             │  ← this package
          │                                 │
          │  29 Tools · 7 Resources · 2 Prompts
          │  Slash commands · CLI · Hooks   │
          │  Config: ~/.amem/config.json    │
          └────────────────┬────────────────┘
                           │ imports
                           ▼
          ┌─────────────────────────────────┐
          │   @aman_asmuei/amem-core        │  ← the engine
          │                                 │
          │  Multi-Strategy Retrieval       │
          │  [HNSW] + [FTS5] + [Graph] + [Temporal]
          │       + query expansion         │
          │       + cross-encoder (opt-in)  │
          │                                 │
          │  Self-Evolving Reflection       │
          │  [Clustering] + [Contradictions]│
          │  + [Synthesis] + [Gap Detection]│
          │                                 │
          │  Embeddings: bge-small-en-v1.5  │
          │  94.6% R@5 on LongMemEval       │
          └────────────────┬────────────────┘
                           │
                           ▼
          ┌─────────────────────────────────┐
          │   SQLite + WAL + FTS5           │
          │   ~/.amem/memory.db             │
          │                                 │
          │   memories       (tiered)       │
          │   conversation_log (raw)        │
          │   memory_versions (history)     │
          │   memory_relations (graph)      │
          │   synthesis_lineage             │
          │   knowledge_gaps                │
          │   session_summaries             │
          │   reminders                     │
          └─────────────────────────────────┘
```

The **`amem` MCP server is a thin wrapper** around `amem-core`. The retrieval engine, embeddings, knowledge graph, reflection — all live in `amem-core` and version independently. Bug in MCP wiring? Republish `amem`. Recall improvement? Republish `amem-core`. No coupling.

### Ranking Formula

```
score = relevance x 0.45 + recency x 0.2 + confidence x 0.2 + importance x 0.15
```

| Factor | How it works |
|---|---|
| **Relevance** | Cosine similarity via HNSW index; query-expanded keyword fallback |
| **Recency** | Exponential decay (`0.995^hours`) |
| **Confidence** | Reinforced by repeated confirmation (0-1) |
| **Importance** | Type-based: corrections `1.0` ... facts `0.4` |

Additive scoring ensures no single low factor kills the ranking.

---

## Configuration

<details>
<summary><strong>Environment variables</strong></summary>

| Variable | Default | Description |
|---|---|---|
| `AMEM_DIR` | `~/.amem` | Storage directory |
| `AMEM_DB` | `~/.amem/memory.db` | Database path |
| `AMEM_PROJECT` | *(auto from git)* | Project scope override |

</details>

<details>
<summary><strong>Config file (~/.amem/config.json)</strong></summary>

Created automatically with defaults:

```json
{
  "retrieval": {
    "semanticWeight": 0.4,
    "ftsWeight": 0.3,
    "graphWeight": 0.15,
    "temporalWeight": 0.15,
    "rerankerEnabled": false
  },
  "privacy": {
    "enablePrivateTags": true,
    "redactPatterns": ["..."]
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

</details>

<details>
<summary><strong>Version history</strong></summary>

### v0.19.0 — Self-Evolving Memory Loop
Reflection engine with HNSW-based clustering, 3-layer contradiction detection (negation + numerical + low-overlap), synthesis candidates with lineage tracking, knowledge gap detection, utility scoring, auto-trigger nudge in `memory_inject`. New DB tables: `synthesis_lineage`, `knowledge_gaps`, `reflection_meta`. Migration v5.

### v0.18.0 — Progressive Disclosure & Scale
HNSW vector index (67x faster at 10k), compact mode default on recall/search, DB repair CLI, concurrent access safety, heuristic conversation extractor, session-end auto-extraction.

### v0.13.0 — World-Class Recall
bge-small-en-v1.5 embeddings, additive scoring, query expansion, auto-relate knowledge graph, graph-aware injection, amem doctor, CI benchmarks.

### v0.9.x — Temporal Intelligence
Temporal validity, auto-expire contradictions, multi-strategy retrieval, cross-encoder reranking, memory tiers, privacy tags, lifecycle hooks, session summaries, dashboard, config system.

### v0.7.0 — v0.8.0
Import/export, confidence decay, embedding cache, multi-process safety, auto-configure CLI, dashboard.

### v0.1.0 — v0.5.x
Core store/recall, local embeddings, SQLite + WAL, consolidation, project scoping, reminders, conversation log, knowledge graph, FTS5, progressive disclosure.

</details>

---

## Tech Stack

| Layer | Technology |
|---|---|
| Protocol | MCP SDK ^1.25 |
| Language | TypeScript 5.6+, strict mode |
| Database | SQLite + WAL + FTS5 |
| Embeddings | HuggingFace bge-small-en-v1.5 (local, 80MB) + HNSW vector index |
| Reranking | ms-marco-MiniLM-L-6-v2 (optional, local) |
| Validation | Zod 3.25+ with `.strict()` schemas |
| Testing | Vitest — 388 tests across 29 suites + recall benchmarks |
| CI/CD | GitHub Actions, npm publish on release |

---

## Contributing

```bash
git clone https://github.com/amanasmuei/amem.git
cd amem && npm install
npm run build   # zero TS errors
npm test        # 388 tests pass
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
