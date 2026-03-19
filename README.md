# amem

The memory layer for AI coding tools. Local-first. Developer-specific. Works everywhere.

[![npm version](https://img.shields.io/npm/v/@aman_asmuei/amem.svg)](https://www.npmjs.com/package/@aman_asmuei/amem)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> Your AI forgets everything between conversations. amem fixes that.

## Install

```bash
npx @aman_asmuei/amem
```

## What it does

amem is an MCP server that gives any AI assistant persistent memory about:

- **Corrections** — "Don't mock the database in integration tests" *(highest priority, always surfaced)*
- **Decisions** — "Chose Postgres over MongoDB because of ACID requirements"
- **Patterns** — "User prefers early returns over nested conditionals"
- **Preferences** — "Uses pnpm, not npm"
- **Topology** — "Auth module lives in src/auth/, uses JWT"
- **Facts** — "Project started in January 2025"

Memories are ranked by **relevance x recency x confidence x importance**. Corrections always surface first. Old memories decay. Contradictions are detected. Related memories evolve together.

## Quick start

### Claude Code

Add to `~/.claude/settings.json`:

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

### Cursor

Add to `.cursor/mcp.json`:

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

### Any MCP client

amem speaks standard MCP over stdio. Any client that supports MCP can connect.

## Tools

### `memory_store`

Store a typed memory with tags and confidence scoring.

```
memory_store({
  content: "Never use 'any' type — always define proper interfaces",
  type: "correction",
  tags: ["typescript", "types"],
  confidence: 1.0
})
```

### `memory_recall`

Semantic search across all memories. Returns results ranked by composite score.

```
memory_recall({
  query: "TypeScript best practices",
  limit: 5
})
```

Returns:
```
1. [correction] Never use 'any' type — always define proper interfaces
   Score: 0.892 | Confidence: 100% | Age: 2d ago

2. [pattern] User prefers strict TypeScript with no implicit any
   Score: 0.756 | Confidence: 85% | Age: 5d ago
```

### `memory_context`

Load full context for a topic. Groups by type with corrections first.

```
memory_context({
  topic: "authentication system",
  max_tokens: 2000
})
```

Returns:
```markdown
## Context for: authentication system

### Corrections
- Never store JWT secrets in environment variables (100% confidence)

### Decisions
- Chose OAuth2 + PKCE for the auth flow (90% confidence)

### Topology
- Auth module is in src/auth/, middleware in src/middleware/auth.ts (85% confidence)
```

### `memory_extract`

Batch-extract memories from a conversation. The AI calls this proactively.

```
memory_extract({
  memories: [
    { content: "Don't mock the DB in integration tests", type: "correction", confidence: 1.0, tags: ["testing"] },
    { content: "Chose event sourcing for audit trail", type: "decision", confidence: 0.9, tags: ["architecture"] }
  ]
})
```

Automatically deduplicates — if a memory is >85% similar to an existing one, it reinforces the existing memory instead of creating a duplicate.

### `memory_forget`

Delete specific memories or search-and-delete with confirmation.

```
memory_forget({ id: "abc12345" })
memory_forget({ query: "old project", confirm: true })
```

### `memory_stats`

Show memory statistics: total count, breakdown by type, confidence distribution.

### `memory_export`

Export all memories as formatted markdown, grouped by type.

## MCP Prompts

amem includes two prompts that teach AI clients how to use it effectively:

- **`extraction-guide`** — When and what to extract from conversations
- **`session-start`** — How to load relevant context at conversation start

## MCP Resources

Proactive context that clients can read automatically:

| Resource | Description |
|----------|-------------|
| `amem://corrections` | All active corrections — hard constraints |
| `amem://decisions` | Architectural decisions and rationale |
| `amem://profile` | Developer preferences and patterns |
| `amem://summary` | Quick overview of all stored memories |

## CLI

```bash
amem-cli recall "authentication"    # Search memories
amem-cli stats                      # Show statistics
amem-cli list --type correction     # List by type
amem-cli export --file memories.md  # Export to markdown
amem-cli forget abc12345            # Delete a memory
```

## How it works

```
┌─────────────────────────────────┐
│         AI Client               │
│  Claude Code · Cursor · Any MCP │
└──────────┬──────────────────────┘
           │ MCP Protocol (stdio)
┌──────────▼──────────────────────┐
│         amem server             │
│                                 │
│  ┌───────────┐  ┌────────────┐  │
│  │  Scoring   │  │  Conflict  │  │
│  │  Engine    │  │  Detection │  │
│  └─────┬─────┘  └─────┬──────┘  │
│        │              │         │
│  ┌─────▼──────────────▼──────┐  │
│  │    SQLite + Embeddings    │  │
│  │    ~/.amem/memory.db      │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

### Scoring formula

```
score = relevance x recency x confidence x importance
```

| Factor | How it works |
|--------|-------------|
| **Relevance** | Cosine similarity between query and memory embeddings (0-1) |
| **Recency** | Exponential decay: `0.995^hours_since_last_access` |
| **Confidence** | How many times confirmed (0-1, corrections from user = 1.0) |
| **Importance** | Memory type weight: correction(1.0) > decision(0.85) > pattern(0.7) > preference(0.7) > topology(0.5) > fact(0.4) |

### Conflict detection

When storing a new memory, amem checks for conflicts:
- **>85% similarity** with different content — conflict detected, existing memory updated
- **>80% similarity** with same intent — existing memory reinforced (confidence +0.1)
- **No match** — new memory stored

### Memory evolution

When a new memory is stored, related existing memories (0.6-0.8 similarity) are reinforced — their access timestamps update, keeping them active and relevant.

### Local-first

- All data stays on your machine at `~/.amem/memory.db`
- Embeddings generated locally via `all-MiniLM-L6-v2` (~80MB model, runs on CPU)
- No cloud, no API keys, no data leaving your laptop
- Works offline after first model download

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `AMEM_DIR` | `~/.amem` | Directory for amem data |
| `AMEM_DB` | `~/.amem/memory.db` | Database file path |

## Roadmap

- [x] 7 MCP tools (store, recall, context, forget, extract, stats, export)
- [x] 2 MCP prompts (extraction guide, session start)
- [x] 4 MCP resources (corrections, decisions, profile, summary)
- [x] CLI with 5 commands
- [x] Local embeddings via HuggingFace transformers
- [x] Memory evolution (related memories reinforce each other)
- [x] Conflict detection and deduplication
- [x] Published on npm
- [ ] Memory verification (check code-related memories against filesystem)
- [ ] Knowledge graph (entity + relation tables)
- [ ] Team memory (shared project context via git-synced SQLite)
- [ ] Proactive mid-conversation context injection

## License

MIT
