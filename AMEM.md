# Amem

The memory layer for AI coding tools. Local-first. Developer-specific. Works everywhere.

> Your AI forgets everything between conversations. Amem fixes that.

## What it does

Amem is an MCP server that gives any AI assistant persistent memory about:

- **Corrections** — "Don't mock the database in integration tests" (highest priority, always surfaced)
- **Decisions** — "Chose Postgres over MongoDB because of ACID requirements"
- **Patterns** — "User prefers early returns over nested conditionals"
- **Preferences** — "Uses pnpm, not npm"
- **Topology** — "Auth module lives in src/auth/, uses JWT"
- **Facts** — "Project started in January 2025"

Memories are ranked by **relevance x recency x confidence x importance**. Corrections always surface first. Old memories decay. Contradictions are detected.

## Quick start

### Connect to Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "amem": {
      "command": "node",
      "args": ["/path/to/amem/dist/index.js"]
    }
  }
}
```

### Connect to Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "amem": {
      "command": "node",
      "args": ["/path/to/amem/dist/index.js"]
    }
  }
}
```

### Connect to any MCP client

Amem speaks standard MCP over stdio. Any client that supports MCP can connect.

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

Results:
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

Returns structured context:
```markdown
## Context for: authentication system

### Corrections
- Never store JWT secrets in environment variables (100% confidence)

### Decisions
- Chose OAuth2 + PKCE for the auth flow (90% confidence)

### Topology
- Auth module is in src/auth/, middleware in src/middleware/auth.ts (85% confidence)
```

### `memory_forget`

Delete specific memories or search-and-delete with confirmation.

```
memory_forget({ id: "abc12345" })
memory_forget({ query: "old project", confirm: true })
```

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
│         Amem Server           │
│                                 │
│  ┌───────────┐  ┌────────────┐ │
│  │  Scoring   │  │  Conflict  │ │
│  │  Engine    │  │  Detection │ │
│  └─────┬─────┘  └─────┬──────┘ │
│        │              │        │
│  ┌─────▼──────────────▼──────┐ │
│  │    SQLite + Embeddings    │ │
│  │    ~/.amem/memory.db    │ │
│  └───────────────────────────┘ │
└─────────────────────────────────┘
```

### Scoring formula

```
score = relevance × recency × confidence × importance
```

| Factor | How it works |
|--------|-------------|
| **Relevance** | Cosine similarity between query and memory embeddings (0-1) |
| **Recency** | Exponential decay: `0.995^hours_since_last_access` |
| **Confidence** | How many times confirmed (0-1, corrections from user = 1.0) |
| **Importance** | Memory type weight: correction(1.0) > decision(0.85) > pattern(0.7) > preference(0.7) > topology(0.5) > fact(0.4) |

### Conflict detection

When storing a new memory, Amem checks for conflicts:
- **>85% similarity** with different content — conflict detected, existing memory updated
- **>80% similarity** with same intent — existing memory reinforced (confidence +0.1)
- **No match** — new memory stored

### Local-first

- All data stays on your machine at `~/.amem/memory.db`
- Embeddings generated locally via `all-MiniLM-L6-v2` (~80MB model, runs on CPU)
- No cloud, no API keys, no data leaving your laptop
- Works offline after first model download

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ENGRAM_DIR` | `~/.amem` | Directory for Amem data |
| `ENGRAM_DB` | `~/.amem/memory.db` | Database file path |

## Roadmap

- [ ] Automatic memory extraction from conversations
- [ ] Memory evolution (related memories update when new ones are stored)
- [ ] Proactive context (surface relevant memories mid-conversation)
- [ ] Team memory (shared project context)
- [ ] npm publish (`npx amem`)

## License

MIT
