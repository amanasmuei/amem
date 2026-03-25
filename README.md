<p align="center">
  <img src="assets/logo.png" alt="amem" width="180" />
</p>

<h3 align="center">Give your AI a memory it never forgets</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@aman_asmuei/amem"><img src="https://img.shields.io/npm/v/@aman_asmuei/amem.svg?style=flat-square&color=cb3837" /></a>
  <a href="https://github.com/amanasmuei/amem/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" /></a>
  <a href="https://github.com/amanasmuei/amem/actions"><img src="https://img.shields.io/github/actions/workflow/status/amanasmuei/amem/ci.yml?style=flat-square&label=tests" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square" />
  <img src="https://img.shields.io/badge/MCP-compatible-8A2BE2?style=flat-square" />
</p>

<p align="center">
  <b>amem</b> (<b>A</b>man's <b>Mem</b>ory) is the memory layer for AI coding tools.<br/>
  Local-first · Semantic · Lossless · Works with Claude Code, Cursor, Windsurf &amp; any MCP client.
</p>

---

## The Problem

Every time you start a new conversation with an AI coding assistant, it starts from zero:

- You told it **three times** not to use `any` in TypeScript — it still does
- Your team **chose PostgreSQL** over MongoDB last month — it doesn't know why
- You **prefer** functional style, early returns, and pnpm — explained again and again
- A critical decision was made **last week** — now it's gone forever

You repeat yourself. Every. Single. Session.

## The Solution

**amem** is a persistent memory layer that plugs into any MCP-compatible AI tool. It remembers what matters, surfaces it automatically, and never loses anything — from distilled memories to raw conversation history.

```
You: "Don't use any type in TypeScript"

  → amem stores this as a correction (priority 1.0)
  → next session, your AI already knows — and won't forget
```

---

## What's New in v0.4.0

| Feature | Description |
|---|---|
| 🗒️ **Lossless conversation log** | `memory_log` / `memory_log_recall` — append-only raw turns, nothing ever summarized or lost |
| 🔧 **Patch system** | `memory_patch` — surgical field-level edits, auto-versioned before every change |
| 📜 **Version history** | `memory_versions` — full edit history, restore any past snapshot |
| 🕸️ **Knowledge graph** | `memory_relate` — typed relations between memories (supports, causes, implements…) |
| ⏱️ **Temporal queries** | `memory_since` — "what changed last week?" in natural language |
| 🔍 **Full-text search** | `memory_search` — exact FTS5 keyword search, complements semantic recall |
| ⚡ **FTS5 auto-sync** | SQLite triggers keep the index in sync on every insert, update, delete |

---

## Feature Comparison

| Feature | amem v0.4 | Claude Code |
|---|---|---|
| Session memory | ✅ SQLite — persists across sessions | ✅ Context window only |
| Persistent identity | ✅ `~/.amem/memory.db` | ✅ `CLAUDE.md` |
| Auto accumulation | ✅ `memory_extract` batch | ✅ `MEMORY.md` auto |
| Memory consolidation | ✅ Merge · prune · promote | ✅ Auto-dream |
| Semantic recall | ✅ Cosine similarity + keyword | ✅ Chat search |
| Per-project scope | ✅ Auto git-detected | ✅ `./CLAUDE.md` |
| Memory export | ✅ Markdown + CLI | 🟡 "Write verbatim" |
| **Lossless history** | ✅ Append-only conversation log | 🔴 Lossy summarization |
| **Patch system** | ✅ Field-level, auto-versioned | 🔴 None |
| **Version history** | ✅ Full edit history + restore | 🔴 None |
| **Knowledge graph** | ✅ Typed memory relations | 🔴 None |
| **Temporal queries** | ✅ "since 7d", date ranges | 🔴 None |
| **Full-text search** | ✅ FTS5 exact match | 🔴 None |

---

## Get Started

### Install

```bash
npm install -g @aman_asmuei/amem
```

Node.js 18+ required. No cloud accounts, no API keys.

### Connect your AI tool

**Claude Code**

```bash
claude mcp add amem -- npx -y @aman_asmuei/amem
```

Or manually in `~/.claude/settings.json`:

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

**Cursor / Windsurf / any MCP client**

```json
{
  "mcpServers": {
    "amem": { "command": "amem" }
  }
}
```

Restart your AI tool. You'll see **15 tools**, **6 resources**, and **2 prompts** available.

---

## Memory Types

| Priority | Type | What it captures | Example |
|---|---|---|---|
| 1.0 | **correction** | Rules that must never be broken | *"Don't mock the DB in integration tests"* |
| 0.85 | **decision** | Architectural choices + rationale | *"Chose Postgres over Mongo for ACID compliance"* |
| 0.7 | **pattern** | Coding style and habits | *"Prefers early returns over nested conditionals"* |
| 0.7 | **preference** | Tool and workflow choices | *"Uses pnpm, not npm"* |
| 0.5 | **topology** | Where things are in the codebase | *"Auth module lives in src/auth/, uses JWT"* |
| 0.4 | **fact** | General project knowledge | *"API uses REST, launched January 2025"* |

Corrections always surface first. They are your AI's hard constraints.

---

## Tools Reference

### Core Memory

| Tool | What it does |
|---|---|
| `memory_store` | Store a single memory with type, tags, confidence |
| `memory_recall` | Semantic search — natural language, ranked by relevance |
| `memory_context` | Load all relevant context for a topic, organized by type |
| `memory_extract` | Batch-save multiple memories from a conversation |
| `memory_forget` | Delete memories by ID or query (confirmation required) |
| `memory_inject` | Proactively surface corrections + decisions before coding |

### Precision & History

| Tool | What it does |
|---|---|
| `memory_patch` | Surgical field-level edit — auto-snapshots before every change |
| `memory_versions` | View full edit history or restore any past version |
| `memory_search` | Exact full-text search (FTS5) — complements semantic recall |
| `memory_since` | Temporal query — "what changed in the last 7 days?" |
| `memory_relate` | Build knowledge graph — link memories with typed relations |

### Log & Maintenance

| Tool | What it does |
|---|---|
| `memory_log` | Append raw conversation turns — lossless, append-only |
| `memory_log_recall` | Search or replay log — by session, keyword, or recency |
| `memory_stats` | Memory count, type breakdown, confidence, embedding coverage |
| `memory_export` | Export all memories as markdown |
| `memory_consolidate` | Merge duplicates · prune stale · promote frequently-used |

---

## Usage Examples

### Store and recall

```
memory_store({
  content: "Never use 'any' type — always define proper interfaces",
  type: "correction",
  tags: ["typescript", "types"],
  confidence: 1.0
})

memory_recall({ query: "TypeScript best practices", limit: 5 })
```

### Patch a memory (surgical, versioned)

```
memory_patch({
  id: "a1b2c3d4",
  field: "content",
  value: "Never use 'any' — define interfaces, use 'unknown' for unknown types",
  reason: "added unknown guidance"
})
```

Every patch auto-snapshots the previous state. Use `memory_versions` to restore.

### Lossless conversation log

```
# Preserve raw turns verbatim
memory_log({ session_id: "2025-03-25", role: "user", content: "Let's use OAuth2 with PKCE" })
memory_log({ session_id: "2025-03-25", role: "assistant", content: "Good call — removes token storage risk…" })

# Replay a session
memory_log_recall({ session_id: "2025-03-25" })

# Search across all sessions
memory_log_recall({ query: "OAuth PKCE", limit: 10 })
```

### Build a knowledge graph

```
memory_relate({
  action: "relate",
  from_id: "decision-abc",
  to_id: "pattern-xyz",
  relation_type: "supports",
  strength: 0.9
})

memory_relate({ action: "graph", memory_id: "decision-abc" })
```

Relation types: `supports`, `contradicts`, `depends_on`, `supersedes`, `related_to`, `caused_by`, `implements` — or define your own.

### Query by time

```
memory_since({ since: "7d" })                                   # last 7 days
memory_since({ since: "1w", type: "decision" })                  # decisions this week
memory_since({ since: "2025-03-01", until: "2025-03-15" })       # date range
```

### Exact full-text search

```
memory_search({ query: "OAuth PKCE" })           # exact terms
memory_search({ query: '"event sourcing"' })      # phrase match
memory_search({ query: "auth* NOT legacy" })      # FTS5 syntax
```

---

## How It Works

```
┌──────────────────────────────────────────┐
│             Your AI Tool                 │
│    Claude · Cursor · Windsurf · any      │
└──────────────┬───────────────────────────┘
               │  MCP Protocol (stdio)
┌──────────────▼───────────────────────────┐
│          amem-mcp-server                 │
│                                          │
│  15 Tools · 6 Resources · 2 Prompts      │
│                                          │
│  ┌──────────────────────────────────┐    │
│  │  SQLite + FTS5 + Local Embeddings│    │
│  │  ~/.amem/memory.db               │    │
│  │                                  │    │
│  │  memories         (scored)       │    │
│  │  conversation_log (lossless)     │    │
│  │  memory_versions  (history)      │    │
│  │  memory_relations (graph)        │    │
│  │  memories_fts     (FTS5 index)   │    │
│  └──────────────────────────────────┘    │
└──────────────────────────────────────────┘
```

Everything stays on your machine. No cloud. No API keys.

### Smart ranking

```
score = relevance × recency × confidence × importance
```

- **Relevance** — cosine similarity via local embeddings, keyword fallback
- **Recency** — exponential decay (`0.995^hours`)
- **Confidence** — reinforced by repeated confirmation
- **Importance** — type-based: corrections 1.0 → facts 0.4

---

## MCP Resources

| Resource URI | What it provides |
|---|---|
| `amem://corrections` | All active corrections — hard constraints |
| `amem://decisions` | Past architectural decisions |
| `amem://profile` | Your preferences and coding patterns |
| `amem://summary` | Memory count and type breakdown |
| `amem://log/recent` | Last 50 raw conversation log entries |
| `amem://graph` | Knowledge graph — all explicit relations |

---

## CLI

```bash
amem-cli recall "authentication"       # Semantic search
amem-cli stats                         # Statistics
amem-cli list                          # List all memories
amem-cli list --type correction        # Filter by type
amem-cli export --file memories.md     # Export to file
amem-cli forget abc12345               # Delete by short ID
```

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `AMEM_DIR` | `~/.amem` | Storage directory |
| `AMEM_DB` | `~/.amem/memory.db` | Database path |
| `AMEM_PROJECT` | *(auto from git)* | Project scope |

---

## Technical Stack

| Layer | Technology |
|---|---|
| Protocol | MCP SDK ^1.25 |
| Language | TypeScript 5.6+ strict, zero `any` |
| Database | SQLite + WAL + FTS5 |
| Embeddings | HuggingFace Xenova/all-MiniLM-L6-v2 (local, 80MB) |
| Validation | Zod 3.25+ `.strict()` schemas |
| Testing | Vitest — 92 tests, 7 suites |
| CI/CD | GitHub Actions — Node 18/20/22 |

---

## Contributing

```bash
git clone https://github.com/amanasmuei/amem.git
cd amem && npm install
npm run build   # zero TS errors
npm test        # 92 tests pass
```

PRs must pass CI before merge.

---

**Built by [Aman Asmuei](https://github.com/amanasmuei)**

[GitHub](https://github.com/amanasmuei/amem) · [npm](https://www.npmjs.com/package/@aman_asmuei/amem) · [Issues](https://github.com/amanasmuei/amem/issues)

MIT License
