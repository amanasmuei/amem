<div align="center">

# amem

### Give your AI a memory it never forgets

Your AI assistant forgets everything the moment a conversation ends.<br/>
**amem** gives it persistent memory — so it remembers your preferences, decisions, and corrections forever.

[![npm version](https://img.shields.io/npm/v/@aman_asmuei/amem.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@aman_asmuei/amem)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/amanasmuei/amem/ci.yml?style=flat-square&label=tests)](https://github.com/amanasmuei/amem/actions)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square)](https://nodejs.org)

[Get Started](#-get-started) · [How It Works](#-how-it-works) · [Tools Reference](#-tools) · [CLI](#-cli) · [FAQ](#-faq)

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
| 🔴 | **Correction** | Mistakes to never repeat | *"Don't mock the database in integration tests"* |
| 🟠 | **Decision** | Architectural choices + why | *"Chose Postgres over MongoDB for ACID compliance"* |
| 🟡 | **Pattern** | Coding style & habits | *"Prefers early returns over nested conditionals"* |
| 🟢 | **Preference** | Tool & workflow choices | *"Uses pnpm, not npm"* |
| 🔵 | **Topology** | Where things are | *"Auth module lives in src/auth/, uses JWT"* |
| ⚪ | **Fact** | General project knowledge | *"API uses REST, launched January 2025"* |

Corrections always surface first. They're the "never do this" rules your AI should always follow.

---

## 🚀 Get Started

### Step 1: Install

You need [Node.js](https://nodejs.org) 18 or higher. Then:

```bash
npx @aman_asmuei/amem
```

That's it. amem runs as a local server on your machine.

### Step 2: Connect your AI tool

<details>
<summary><strong>Claude Code</strong></summary>

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

Restart Claude Code. You'll see 7 memory tools available.

</details>

<details>
<summary><strong>Cursor</strong></summary>

Add to `.cursor/mcp.json` in your project:

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

Restart Cursor.

</details>

<details>
<summary><strong>Windsurf</strong></summary>

Add to your MCP configuration:

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

## 🧠 How It Works

```
┌──────────────────────────────────┐
│          Your AI Tool            │
│   Claude · Cursor · Windsurf     │
└──────────┬───────────────────────┘
           │
     MCP Protocol (local)
           │
┌──────────▼───────────────────────┐
│         amem server              │
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

Every memory gets a score:

```
score = relevance × recency × confidence × importance
```

- **Relevance** — How closely the memory matches what you're working on (semantic similarity)
- **Recency** — Recent memories score higher; old ones gradually fade
- **Confidence** — Memories confirmed multiple times score higher
- **Importance** — Corrections (1.0) > Decisions (0.85) > Patterns (0.7) > Facts (0.4)

### Conflict detection

Store a memory that contradicts an existing one? amem catches it:

- **>85% similar but different** → Flags the conflict, updates the existing memory
- **>80% similar and agreeing** → Reinforces the existing memory (+confidence)
- **No match** → Stores as new

### Memory evolution

When you store a new memory, related existing memories get reinforced automatically. Your knowledge base stays connected and current.

---

## 🔧 Tools

amem gives your AI **7 tools** it can use during conversation:

### Core tools

| Tool | What it does |
|------|-------------|
| `memory_store` | Save a single memory with type, tags, and confidence |
| `memory_recall` | Search memories by meaning (not just keywords) |
| `memory_context` | Load everything relevant to a topic, organized by type |
| `memory_extract` | Batch-save multiple memories at once from a conversation |
| `memory_forget` | Delete outdated or incorrect memories |

### Utility tools

| Tool | What it does |
|------|-------------|
| `memory_stats` | See how many memories you have, broken down by type |
| `memory_export` | Export all memories as readable markdown |

### Example: Storing a memory

```
memory_store({
  content: "Never use 'any' type — always define proper interfaces",
  type: "correction",
  tags: ["typescript", "types"],
  confidence: 1.0
})
```

### Example: Recalling memories

```
memory_recall({ query: "TypeScript best practices", limit: 5 })
```

```
1. [correction] Never use 'any' type — always define proper interfaces
   Score: 0.892 | Confidence: 100% | Age: 2d ago

2. [pattern] User prefers strict TypeScript with no implicit any
   Score: 0.756 | Confidence: 85% | Age: 5d ago
```

### Example: Loading context for a task

```
memory_context({ topic: "authentication system" })
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
    { content: "Don't mock the DB in integration tests", type: "correction", confidence: 1.0 },
    { content: "Chose event sourcing for audit trail", type: "decision", confidence: 0.9 }
  ]
})
```

---

## 💻 CLI

amem also includes a command-line interface for managing memories directly:

```bash
amem-cli recall "authentication"      # Search memories
amem-cli stats                        # Show statistics
amem-cli list                         # List all memories
amem-cli list --type correction       # List by type
amem-cli export --file memories.md    # Export to markdown
amem-cli forget abc12345              # Delete by ID
```

---

## 📡 MCP Resources

amem exposes **4 resources** that AI clients can read proactively:

| Resource | What it provides |
|----------|-----------------|
| `amem://corrections` | All active corrections — hard rules the AI should always follow |
| `amem://decisions` | Past architectural decisions and their rationale |
| `amem://profile` | Your preferences and coding patterns |
| `amem://summary` | Quick overview of everything stored |

---

## ⚙️ Configuration

amem works out of the box with zero configuration. For advanced use:

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `AMEM_DIR` | `~/.amem` | Where amem stores data |
| `AMEM_DB` | `~/.amem/memory.db` | Database file path |

---

## ❓ FAQ

<details>
<summary><strong>Is my data sent to the cloud?</strong></summary>

No. Everything stays on your machine. amem uses a local SQLite database at `~/.amem/memory.db` and generates embeddings locally using an 80MB model that runs on your CPU. No internet connection required after the first model download.

</details>

<details>
<summary><strong>Does it work offline?</strong></summary>

Yes. After the first run (which downloads the embedding model), amem works completely offline.

</details>

<details>
<summary><strong>What AI tools does it work with?</strong></summary>

Any tool that supports the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) — including Claude Code, Cursor, Windsurf, and many others. The list is growing rapidly.

</details>

<details>
<summary><strong>How much memory/disk does it use?</strong></summary>

The embedding model is ~80MB (downloaded once). The SQLite database grows with your memories — typically a few MB even after months of use. CPU usage is minimal.

</details>

<details>
<summary><strong>Can I see what's stored?</strong></summary>

Yes! Use `amem-cli list` to see all memories, `amem-cli stats` for an overview, or `amem-cli export --file backup.md` to export everything as readable markdown.

</details>

<details>
<summary><strong>Can I delete specific memories?</strong></summary>

Yes. Use `amem-cli forget <id>` or ask your AI to call `memory_forget`. You can also search-and-delete: `memory_forget({ query: "old project", confirm: true })`.

</details>

<details>
<summary><strong>Does it slow down my AI?</strong></summary>

No. Memory operations typically take under 50ms. Embedding generation for new memories takes ~200ms. The server runs as a lightweight background process.

</details>

<details>
<summary><strong>Can I use it across multiple projects?</strong></summary>

Yes. amem stores memories globally at `~/.amem/memory.db` by default. All your AI conversations across all projects share the same memory. You can also set `AMEM_DB` per-project for isolated memories.

</details>

---

## 🗺️ Roadmap

- [x] 7 MCP tools for storing, recalling, and managing memories
- [x] Semantic search with local embeddings
- [x] Smart conflict detection and deduplication
- [x] Memory evolution (related memories reinforce each other)
- [x] CLI for direct memory management
- [x] MCP prompts and resources for proactive context
- [x] Published on npm
- [ ] Memory verification against filesystem
- [ ] Knowledge graph with entity relationships
- [ ] Team memory (shared context across developers)
- [ ] Proactive mid-conversation context injection

---

<div align="center">

**Built by [Aman Asmuei](https://github.com/amanasmuei)**

[Report Bug](https://github.com/amanasmuei/amem/issues) · [Request Feature](https://github.com/amanasmuei/amem/issues) · [npm](https://www.npmjs.com/package/@aman_asmuei/amem)

MIT License

</div>
