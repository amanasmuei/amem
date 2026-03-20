<div align="center">

# amem

### Give your AI a memory it never forgets

Your AI assistant forgets everything the moment a conversation ends.<br/>
**amem** gives it persistent memory — so it remembers your preferences, decisions, and corrections forever.

[![npm version](https://img.shields.io/npm/v/@aman_asmuei/amem.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@aman_asmuei/amem)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/amanasmuei/amem/ci.yml?style=flat-square&label=tests)](https://github.com/amanasmuei/amem/actions)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-compatible-8A2BE2?style=flat-square)](https://modelcontextprotocol.io)

[Get Started](#get-started) · [How It Works](#how-it-works) · [Tools](#tools) · [Resources & Prompts](#resources--prompts) · [CLI](#cli) · [FAQ](#faq) · [Contributing](#contributing)

</div>

---

## The Problem

Every time you start a new conversation with an AI coding assistant, it starts from zero. It doesn't know:

- That you told it **three times** not to use `any` in TypeScript
- That your team **chose PostgreSQL** over MongoDB last month (and why)
- That you **prefer** functional style, early returns, and pnpm
- Where your auth module lives, or how your project is structured

You end up repeating yourself. Every. Single. Time.

## The Solution

**amem** is a memory layer that plugs into any AI tool — Claude Code, Cursor, Windsurf, or anything that speaks MCP. It remembers what matters and surfaces it automatically.

```
You: "Don't use any type in TypeScript"

  amem saves this as a correction (highest priority).
  Next conversation — or next month — your AI already knows.
```

---

## What Gets Remembered

amem organizes memories into six types, ranked by importance:

| Priority | Type | What it captures | Example |
|:--------:|------|-----------------|---------|
| 1.0 | **Correction** | Mistakes to never repeat | *"Don't mock the database in integration tests"* |
| 0.85 | **Decision** | Architectural choices + why | *"Chose Postgres over MongoDB for ACID compliance"* |
| 0.7 | **Pattern** | Coding style & habits | *"Prefers early returns over nested conditionals"* |
| 0.7 | **Preference** | Tool & workflow choices | *"Uses pnpm, not npm"* |
| 0.5 | **Topology** | Where things are | *"Auth module lives in src/auth/, uses JWT"* |
| 0.4 | **Fact** | General project knowledge | *"API uses REST, launched January 2025"* |

Corrections always surface first. They're the "never do this" rules your AI should always follow.

---

## Get Started

### Step 1: Install

You need [Node.js](https://nodejs.org) 18 or higher. Then:

```bash
npm install -g @aman_asmuei/amem
```

That's it. amem is now installed on your machine.

### Step 2: Connect your AI tool

<details>
<summary><strong>Claude Code</strong></summary>

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "amem": {
      "command": "amem"
    }
  }
}
```

Restart Claude Code. You'll see 8 memory tools, 4 resources, and 2 prompts available.

</details>

<details>
<summary><strong>Cursor</strong></summary>

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "amem": {
      "command": "amem"
    }
  }
}
```

Restart Cursor.

</details>

<details>
<summary><strong>Windsurf</strong></summary>

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "amem": {
      "command": "amem"
    }
  }
}
```

</details>

<details>
<summary><strong>Any other MCP client</strong></summary>

amem speaks standard [Model Context Protocol](https://modelcontextprotocol.io/) over stdio. Point your client to:

```bash
npx @aman_asmuei/amem
```

</details>

### Step 3: Start talking

That's it. Your AI now has memory tools. Ask it to remember something:

> *"Remember that we use Tailwind with a custom theme in this project."*

Next conversation, ask:

> *"What CSS framework do we use?"*

It knows.

---

## How It Works

```
┌──────────────────────────────────┐
│          Your AI Tool            │
│   Claude · Cursor · Windsurf     │
└──────────┬───────────────────────┘
           │
     MCP Protocol (stdio)
           │
┌──────────▼───────────────────────┐
│       amem-mcp-server            │
│                                  │
│  8 Tools · 4 Resources · 2 Prompts
│                                  │
│   Store → Score → Deduplicate    │
│   Recall → Rank → Surface       │
│                                  │
│   ┌────────────────────────────┐ │
│   │  SQLite + Local Embeddings │ │
│   │  ~/.amem/memory.db         │ │
│   └────────────────────────────┘ │
└──────────────────────────────────┘
```

**Everything stays on your machine.** No cloud. No API keys. No data leaving your laptop.

### Smart ranking

Every memory gets a composite score:

```
score = relevance × recency × confidence × importance
```

- **Relevance** — How closely the memory matches what you're working on (cosine similarity via local embeddings, with keyword fallback)
- **Recency** — Exponential decay (0.995^hours) — recent memories score higher, old ones gradually fade
- **Confidence** — Memories confirmed multiple times score higher (0.0 to 1.0)
- **Importance** — Type-based weight: Corrections (1.0) > Decisions (0.85) > Patterns (0.7) > Facts (0.4)

### Conflict detection

Store a memory that contradicts an existing one? amem catches it:

- **>85% similar but different** — Flags the conflict, updates the existing memory's confidence
- **>80% similar and agreeing** — Reinforces the existing memory (+0.1 confidence)
- **60-80% related** — Touches related memories to keep them fresh
- **No match** — Stores as new

### Memory evolution

When you store a new memory, related existing memories (60-80% similarity) get reinforced automatically — their access timestamps update, keeping your knowledge base connected and current.

---

## Tools

amem gives your AI **8 tools** it can use during conversation. All tools include:

- **Strict input validation** with Zod schemas (invalid inputs are rejected with clear error messages)
- **Tool annotations** (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) so clients understand tool behavior
- **Structured error handling** — errors return `isError: true` with actionable suggestions

### Core tools

| Tool | What it does | Annotations |
|------|-------------|-------------|
| `memory_store` | Save a single memory with type, tags, and confidence | write, non-destructive |
| `memory_recall` | Search memories by meaning (semantic + keyword fallback) | read-only, idempotent |
| `memory_context` | Load all relevant context for a topic, organized by type | read-only, idempotent |
| `memory_extract` | Batch-save multiple memories from a conversation | write, non-destructive |
| `memory_forget` | Delete outdated or incorrect memories (with confirmation) | write, destructive |
| `memory_inject` | Proactively inject corrections + decisions for a topic (use before coding) | read-only, idempotent |

### Utility tools

| Tool | What it does | Annotations |
|------|-------------|-------------|
| `memory_stats` | Memory count, type breakdown, confidence distribution, embedding coverage | read-only, idempotent |
| `memory_export` | Export all memories as markdown (truncates at 50K chars) | read-only, idempotent |

All tools return both human-readable text (`content`) and machine-readable JSON (`structuredContent`) with validated `outputSchema`.

### Example: Storing a memory

```
memory_store({
  content: "Never use 'any' type — always define proper interfaces",
  type: "correction",
  tags: ["typescript", "types"],
  confidence: 1.0
})
```

> Stored correction memory (a1b2c3d4). Confidence: 1. Tags: [typescript, types]. Total memories: 42.

### Example: Recalling memories

```
memory_recall({ query: "TypeScript best practices", limit: 5 })
```

```
Found 2 memories for "TypeScript best practices":

1. [correction] Never use 'any' type — always define proper interfaces
   Score: 0.892 | Confidence: 100% | Age: 2d ago | Tags: [typescript, types]

2. [pattern] User prefers strict TypeScript with no implicit any
   Score: 0.756 | Confidence: 85% | Age: 5d ago | Tags: [typescript]
```

### Example: Loading context for a task

```
memory_context({ topic: "authentication system", max_tokens: 2000 })
```

```markdown
## Context for: authentication system

### Corrections
- Never store JWT secrets in environment variables (100% confidence)

### Decisions
- Chose OAuth2 + PKCE for the auth flow (90% confidence)

### Topology
- Auth module is in src/auth/, middleware in src/middleware/auth.ts (85% confidence)
```

### Example: Batch extraction

Your AI can extract multiple memories from a single conversation:

```
memory_extract({
  memories: [
    { content: "Don't mock the DB in integration tests", type: "correction", tags: ["testing"], confidence: 1.0 },
    { content: "Chose event sourcing for audit trail", type: "decision", tags: ["architecture"], confidence: 0.9 }
  ]
})
```

```
Extraction complete: 2 stored, 0 reinforced.
Total memories: 44.

  + Stored [correction]: "Don't mock the DB in integration tests" (a1b2c3d4)
  + Stored [decision]: "Chose event sourcing for audit trail" (e5f6g7h8)
```

### Example: Forgetting memories

Delete by ID or by query (with a safety confirmation step):

```
memory_forget({ query: "old project", confirm: false })
```

```
Found 3 memories matching "old project". Preview:
1. [a1b2c3d4] Old project used Express.js
2. [e5f6g7h8] Old project had no tests

Call again with confirm=true to delete these.
```

---

## Resources & Prompts

### MCP Resources

amem exposes **4 resources** that AI clients can read proactively at the start of a conversation:

| Resource URI | What it provides |
|-------------|-----------------|
| `amem://corrections` | All active corrections — hard rules the AI should always follow |
| `amem://decisions` | Past architectural decisions and their rationale |
| `amem://profile` | Your preferences and coding patterns |
| `amem://summary` | Quick overview: memory count and breakdown by type |

### MCP Prompts

amem provides **2 prompts** that teach AI clients how to use the memory system effectively:

| Prompt | Purpose |
|--------|---------|
| `extraction-guide` | Guidelines for *what* to extract from conversations — when to save corrections vs. decisions vs. facts, how often, and what to avoid |
| `session-start` | How to load relevant context at the beginning of a conversation — load topic context, apply corrections as hard constraints, reference memories naturally |

---

## CLI

amem includes a standalone command-line interface for managing memories directly:

```bash
amem-cli recall "authentication"      # Search memories semantically
amem-cli stats                        # Show statistics with visual bars
amem-cli list                         # List all memories
amem-cli list --type correction       # Filter by type
amem-cli export                       # Export to stdout as markdown
amem-cli export --file memories.md    # Export to file
amem-cli forget abc12345              # Delete by ID (short IDs supported)
```

---

## Configuration

amem works out of the box with zero configuration. For advanced use:

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `AMEM_DIR` | `~/.amem` | Where amem stores data |
| `AMEM_DB` | `~/.amem/memory.db` | Database file path |

Set `AMEM_DB` per-project for isolated memories:

```bash
AMEM_DB=./project-memories.db amem
```

---

## Technical Details

### Stack

| Layer | Technology |
|-------|------------|
| Protocol | [MCP](https://modelcontextprotocol.io/) SDK ^1.25 (modern `registerTool`/`registerResource`/`registerPrompt` APIs) |
| Language | TypeScript 5.6+ (strict mode, ES2022, zero `any` types) |
| Database | SQLite via better-sqlite3 (WAL mode, prepared statements, indexed) |
| Embeddings | HuggingFace Transformers — Xenova/all-MiniLM-L6-v2 (384-dim, local, optional) |
| Validation | Zod 3.25+ (`.strict()` on all schemas, `.min()` constraints, descriptive errors) |
| Testing | Vitest — 33 tests across 4 suites |
| CI/CD | GitHub Actions — Node 18/20/22 |

### MCP Best Practices

amem follows the [MCP best practices](https://modelcontextprotocol.io/) checklist:

- All 8 tools use `server.registerTool()` with `title`, `description`, `inputSchema`, `outputSchema`, and `annotations`
- All tool handlers wrapped in `try-catch` with `isError: true` on failures
- All Zod schemas use `.strict()` to reject unknown fields
- All error messages are actionable (suggest next steps)
- Server name follows convention: `amem-mcp-server`
- Transport: stdio (correct for local-first tool)
- Logging to stderr (not stdout)
- Graceful shutdown on SIGINT/SIGTERM

### Architecture

```
src/
├── index.ts        Entry point — server, prompts, resources, transport
├── tools.ts        8 MCP tools with annotations, validation, structured output
├── schemas.ts      Zod output schemas for structuredContent responses
├── memory.ts       Scoring engine, conflict detection, recall algorithm
├── database.ts     SQLite schema, prepared statements, CRUD interface
├── embeddings.ts   Local embedding pipeline + cosine similarity
└── cli.ts          Standalone CLI for direct memory management
```

**~1,300 lines of TypeScript.** Clean separation of concerns, no circular dependencies.

---

## FAQ

<details>
<summary><strong>Is my data sent to the cloud?</strong></summary>

No. Everything stays on your machine. amem uses a local SQLite database at `~/.amem/memory.db` and generates embeddings locally using an 80MB model that runs on your CPU. No internet connection required after the first model download.

</details>

<details>
<summary><strong>Does it work offline?</strong></summary>

Yes. After the first run (which downloads the embedding model), amem works completely offline. If the model isn't available, amem falls back to keyword matching — it never crashes.

</details>

<details>
<summary><strong>What AI tools does it work with?</strong></summary>

Any tool that supports the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) — including Claude Code, Cursor, Windsurf, and many others. The list is growing rapidly.

</details>

<details>
<summary><strong>How much memory/disk does it use?</strong></summary>

The embedding model is ~80MB (downloaded once, cached locally). The SQLite database grows with your memories — typically a few MB even after months of use. CPU usage is minimal; the server idles at near-zero when not processing requests.

</details>

<details>
<summary><strong>Can I see what's stored?</strong></summary>

Yes! Use `amem-cli list` to see all memories, `amem-cli stats` for a visual overview, or `amem-cli export --file backup.md` to export everything as readable markdown. You can also ask your AI to call `memory_stats` or `memory_export`.

</details>

<details>
<summary><strong>Can I delete specific memories?</strong></summary>

Yes. Use `amem-cli forget <id>` (short IDs work — just the first 8 characters) or ask your AI to call `memory_forget`. Query-based deletion requires a confirmation step to prevent accidents: `memory_forget({ query: "old project", confirm: true })`.

</details>

<details>
<summary><strong>Does it slow down my AI?</strong></summary>

No. Memory operations typically take under 50ms. Embedding generation for new memories takes ~200ms. The server runs as a lightweight background process over stdio.

</details>

<details>
<summary><strong>Can I use it across multiple projects?</strong></summary>

Yes. By default, amem stores memories globally at `~/.amem/memory.db` — all your AI conversations across all projects share the same memory. Set `AMEM_DB` per-project for isolated memories.

</details>

<details>
<summary><strong>What happens if the embedding model isn't available?</strong></summary>

amem gracefully falls back to keyword-based matching. Semantic search won't work, but storing, recalling (by keyword), and all other operations continue normally. The server never crashes due to missing embeddings.

</details>

<details>
<summary><strong>How does conflict detection work?</strong></summary>

When you store a new memory, amem computes cosine similarity against all existing memories. If a match exceeds 85% similarity but the content is different, it flags a conflict and updates the existing memory's confidence instead of creating a duplicate. You get a clear message explaining what happened and how to rephrase if the memories are genuinely different.

</details>

---

## Contributing

Contributions are welcome! Here's how to get involved.

### Development setup

```bash
git clone https://github.com/amanasmuei/amem.git
cd amem
npm install
npm run build
npm test
```

### Scripts

| Script | What it does |
|--------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run dev` | Watch mode — recompile on save |
| `npm test` | Run all 33 tests with Vitest |
| `npm run test:watch` | Run tests in watch mode |
| `npm start` | Start the MCP server (`node dist/index.js`) |

### Project structure

```
amem/
├── src/
│   ├── index.ts        # MCP server entry point, prompts, resources
│   ├── tools.ts        # 7 tool definitions with validation & error handling
│   ├── memory.ts       # Scoring engine, conflict detection, recall
│   ├── database.ts     # SQLite schema, prepared statements, CRUD
│   ├── embeddings.ts   # Local embedding pipeline + cosine similarity
│   └── cli.ts          # Standalone CLI
├── tests/
│   ├── database.test.ts
│   ├── embeddings.test.ts
│   ├── memory.test.ts
│   └── tools.test.ts
├── .github/
│   └── workflows/
│       ├── ci.yml      # Test on push/PR (Node 18/20/22)
│       └── publish.yml # Publish to npm on GitHub Release
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### Making changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Ensure the build is clean: `npm run build`
5. Ensure all tests pass: `npm test`
6. Commit and push your branch
7. Open a Pull Request against `main`

### CI/CD

**GitHub Actions** runs automatically on every push and pull request:

- **CI workflow** (`ci.yml`) — builds and tests against Node.js 18, 20, and 22 on Ubuntu
- **Publish workflow** (`publish.yml`) — triggered on GitHub Release, builds, tests, and publishes to npm with `--access public`

All PRs must pass the CI pipeline before merging.

### Reporting issues

Found a bug or have a feature idea?

- **Bug reports**: [Open an issue](https://github.com/amanasmuei/amem/issues/new) with steps to reproduce, expected vs. actual behavior, and your Node.js version
- **Feature requests**: [Open an issue](https://github.com/amanasmuei/amem/issues/new) describing the use case and how it would improve the memory system
- **Questions**: [Start a discussion](https://github.com/amanasmuei/amem/discussions) (or open an issue)

---

## Roadmap

- [x] 8 MCP tools with full annotations, validation, and error handling
- [x] Semantic search with local embeddings (graceful fallback to keywords)
- [x] Smart conflict detection and deduplication
- [x] Memory evolution (related memories reinforce each other)
- [x] CLI for direct memory management
- [x] MCP prompts and resources for proactive context
- [x] Published on npm
- [x] `outputSchema` + `structuredContent` for machine-readable tool responses
- [x] Proactive context injection (`memory_inject` tool)
- [x] Evaluation suite (10 standardized eval questions)
- [ ] Memory verification against filesystem
- [ ] Knowledge graph with entity relationships
- [ ] Team memory (shared context across developers)

---

<div align="center">

**Built by [Aman Asmuei](https://github.com/amanasmuei)**

[GitHub](https://github.com/amanasmuei/amem) · [npm](https://www.npmjs.com/package/@aman_asmuei/amem) · [Report Bug](https://github.com/amanasmuei/amem/issues) · [Request Feature](https://github.com/amanasmuei/amem/issues)

MIT License

</div>
