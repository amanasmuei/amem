# Engram: Developer Memory Engine — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first MCP server that gives every AI coding tool persistent, semantic, developer-specific memory — distributed as `npx engram`.

**Architecture:** TypeScript MCP server backed by SQLite (better-sqlite3) for storage and @huggingface/transformers for local 384-dim embeddings. Memories are typed (corrections, decisions, patterns, preferences, topology), importance-scored, and retrieved via cosine similarity combined with recency and confidence weighting. Brute-force vector search in JS (no sqlite-vec needed for <10K memories).

**Tech Stack:** TypeScript 5.6+, @modelcontextprotocol/sdk ^1.25, better-sqlite3, @huggingface/transformers, zod ^3.25, vitest

---

## File Structure

```
src/
├── index.ts              # MCP server entry point + stdio transport
├── database.ts           # SQLite connection, schema, migrations
├── embeddings.ts         # Local embedding generation + cosine similarity
├── memory.ts             # Memory types, CRUD, scoring, conflict detection
└── tools.ts              # MCP tool definitions (store, recall, context, forget)

tests/
├── database.test.ts      # Schema creation, CRUD operations
├── memory.test.ts        # Scoring, conflict detection, type handling
├── embeddings.test.ts    # Cosine similarity (mock embeddings for speed)
└── tools.test.ts         # MCP tool integration tests
```

| File | Responsibility |
|------|---------------|
| `src/index.ts` | Create McpServer, register tools from tools.ts, connect StdioServerTransport |
| `src/database.ts` | Open/create SQLite DB at `~/.engram/memory.db`, define schema, expose prepared statements for insert/select/update/delete |
| `src/embeddings.ts` | Lazy-load HuggingFace pipeline, generate 384-dim embeddings, cosine similarity function |
| `src/memory.ts` | MemoryType enum, importance weights, scoring formula (relevance * recency * confidence), conflict detection logic |
| `src/tools.ts` | Register 4 MCP tools on server: memory_store, memory_recall, memory_context, memory_forget |
| `tests/*.test.ts` | Unit + integration tests per module |

---

## Chunk 1: Foundation

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/index.ts` (stub)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "engram",
  "version": "0.1.0",
  "description": "The memory layer for AI coding tools. Local-first, developer-specific, works everywhere.",
  "type": "module",
  "bin": {
    "engram": "dist/index.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepare": "npm run build",
    "start": "node dist/index.js"
  },
  "keywords": ["mcp", "memory", "ai", "developer-tools", "context", "sqlite", "embeddings"],
  "license": "MIT",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.25.2",
    "better-sqlite3": "^12.0.0",
    "zod": "^3.25.0"
  },
  "optionalDependencies": {
    "@huggingface/transformers": "^3.8.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  }
}
```

Note: `@huggingface/transformers` is optional — if unavailable, fall back to keyword matching. This lets the server start fast and work on machines without ONNX support.

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30000,
  },
});
```

- [ ] **Step 4: Create stub entry point src/index.ts**

```ts
#!/usr/bin/env node

console.error("Engram starting...");
// Will be filled in Task 7
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: Clean install, node_modules created, no errors.

- [ ] **Step 6: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Commit**

```
git add package.json tsconfig.json vitest.config.ts src/index.ts
git commit -m "feat: project scaffolding for Engram MCP server"
```

---

### Task 2: Memory Types

**Files:**
- Create: `src/memory.ts`
- Create: `tests/memory.test.ts`

- [ ] **Step 1: Write tests for memory types and scoring**

```ts
// tests/memory.test.ts
import { describe, it, expect } from "vitest";
import {
  MemoryType,
  IMPORTANCE_WEIGHTS,
  computeScore,
  detectConflict,
  type Memory,
} from "../src/memory.js";

describe("MemoryType", () => {
  it("has all developer-specific types", () => {
    expect(MemoryType.CORRECTION).toBe("correction");
    expect(MemoryType.DECISION).toBe("decision");
    expect(MemoryType.PATTERN).toBe("pattern");
    expect(MemoryType.PREFERENCE).toBe("preference");
    expect(MemoryType.TOPOLOGY).toBe("topology");
    expect(MemoryType.FACT).toBe("fact");
  });
});

describe("IMPORTANCE_WEIGHTS", () => {
  it("ranks corrections highest", () => {
    expect(IMPORTANCE_WEIGHTS.correction).toBeGreaterThan(IMPORTANCE_WEIGHTS.decision);
    expect(IMPORTANCE_WEIGHTS.decision).toBeGreaterThan(IMPORTANCE_WEIGHTS.pattern);
    expect(IMPORTANCE_WEIGHTS.pattern).toBeGreaterThanOrEqual(IMPORTANCE_WEIGHTS.preference);
    expect(IMPORTANCE_WEIGHTS.preference).toBeGreaterThan(IMPORTANCE_WEIGHTS.fact);
  });
});

describe("computeScore", () => {
  const now = Date.now();

  it("scores recent, high-confidence, relevant memories highest", () => {
    const score = computeScore({
      relevance: 0.95,
      confidence: 0.9,
      lastAccessed: now - 1000 * 60 * 5,
      importance: IMPORTANCE_WEIGHTS.correction,
      now,
    });
    expect(score).toBeGreaterThan(0.8);
  });

  it("penalizes old memories via recency decay", () => {
    const recent = computeScore({
      relevance: 0.9,
      confidence: 0.9,
      lastAccessed: now - 1000 * 60 * 60,
      importance: IMPORTANCE_WEIGHTS.fact,
      now,
    });
    const old = computeScore({
      relevance: 0.9,
      confidence: 0.9,
      lastAccessed: now - 1000 * 60 * 60 * 24 * 30,
      importance: IMPORTANCE_WEIGHTS.fact,
      now,
    });
    expect(recent).toBeGreaterThan(old);
  });

  it("boosts corrections over facts at equal relevance", () => {
    const correction = computeScore({
      relevance: 0.8,
      confidence: 0.8,
      lastAccessed: now,
      importance: IMPORTANCE_WEIGHTS.correction,
      now,
    });
    const fact = computeScore({
      relevance: 0.8,
      confidence: 0.8,
      lastAccessed: now,
      importance: IMPORTANCE_WEIGHTS.fact,
      now,
    });
    expect(correction).toBeGreaterThan(fact);
  });
});

describe("detectConflict", () => {
  it("returns no conflict for unrelated memories", () => {
    const result = detectConflict(
      "user prefers TypeScript",
      "project uses PostgreSQL",
      0.15,
    );
    expect(result.isConflict).toBe(false);
  });

  it("flags potential conflict for high-similarity memories", () => {
    const result = detectConflict(
      "user prefers tabs for indentation",
      "user prefers spaces for indentation",
      0.92,
    );
    expect(result.isConflict).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/memory.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement memory types and scoring**

```ts
// src/memory.ts

export const MemoryType = {
  CORRECTION: "correction",
  DECISION: "decision",
  PATTERN: "pattern",
  PREFERENCE: "preference",
  TOPOLOGY: "topology",
  FACT: "fact",
} as const;

export type MemoryTypeValue = (typeof MemoryType)[keyof typeof MemoryType];

export const IMPORTANCE_WEIGHTS: Record<MemoryTypeValue, number> = {
  correction: 1.0,
  decision: 0.85,
  pattern: 0.7,
  preference: 0.7,
  topology: 0.5,
  fact: 0.4,
};

export interface Memory {
  id: string;
  content: string;
  type: MemoryTypeValue;
  tags: string[];
  confidence: number;
  accessCount: number;
  createdAt: number;
  lastAccessed: number;
  source: string;
  embedding: Float32Array | null;
}

export interface ScoreInput {
  relevance: number;
  confidence: number;
  lastAccessed: number;
  importance: number;
  now: number;
}

export function computeScore(input: ScoreInput): number {
  const hoursSinceAccess = (input.now - input.lastAccessed) / (1000 * 60 * 60);
  const recency = Math.pow(0.995, Math.max(0, hoursSinceAccess));
  return input.relevance * recency * input.confidence * input.importance;
}

export interface ConflictResult {
  isConflict: boolean;
  similarity: number;
}

export function detectConflict(
  newContent: string,
  existingContent: string,
  similarity: number,
): ConflictResult {
  if (newContent === existingContent) {
    return { isConflict: false, similarity };
  }
  return {
    isConflict: similarity > 0.85,
    similarity,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/memory.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```
git add src/memory.ts tests/memory.test.ts
git commit -m "feat: memory types, importance scoring, and conflict detection"
```

---

### Task 3: Database Layer

**Files:**
- Create: `src/database.ts`
- Create: `tests/database.test.ts`

- [ ] **Step 1: Write tests for database operations**

```ts
// tests/database.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, type EngramDatabase } from "../src/database.js";
import { MemoryType } from "../src/memory.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("EngramDatabase", () => {
  let db: EngramDatabase;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `engram-test-${Date.now()}.db`);
    db = createDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch {}
  });

  describe("schema", () => {
    it("creates memories table", () => {
      const tables = db.listTables();
      expect(tables).toContain("memories");
    });
  });

  describe("insert", () => {
    it("stores a memory and returns its id", () => {
      const id = db.insertMemory({
        content: "user prefers TypeScript",
        type: MemoryType.PREFERENCE,
        tags: ["language", "typescript"],
        confidence: 0.9,
        source: "conversation-1",
        embedding: null,
      });
      expect(id).toBeTruthy();
      expect(typeof id).toBe("string");
    });
  });

  describe("getById", () => {
    it("retrieves a stored memory", () => {
      const id = db.insertMemory({
        content: "use pnpm not npm",
        type: MemoryType.CORRECTION,
        tags: ["tooling"],
        confidence: 1.0,
        source: "conversation-2",
        embedding: null,
      });
      const memory = db.getById(id);
      expect(memory).toBeTruthy();
      expect(memory!.content).toBe("use pnpm not npm");
      expect(memory!.type).toBe("correction");
      expect(memory!.confidence).toBe(1.0);
    });

    it("returns null for non-existent id", () => {
      expect(db.getById("nonexistent")).toBeNull();
    });
  });

  describe("search", () => {
    it("finds memories by type", () => {
      db.insertMemory({ content: "a", type: MemoryType.CORRECTION, tags: [], confidence: 1, source: "s", embedding: null });
      db.insertMemory({ content: "b", type: MemoryType.FACT, tags: [], confidence: 1, source: "s", embedding: null });
      db.insertMemory({ content: "c", type: MemoryType.CORRECTION, tags: [], confidence: 1, source: "s", embedding: null });

      const results = db.searchByType(MemoryType.CORRECTION);
      expect(results).toHaveLength(2);
    });

    it("finds memories by tag", () => {
      db.insertMemory({ content: "uses react", type: MemoryType.FACT, tags: ["frontend", "react"], confidence: 1, source: "s", embedding: null });
      db.insertMemory({ content: "uses vue", type: MemoryType.FACT, tags: ["frontend", "vue"], confidence: 1, source: "s", embedding: null });
      db.insertMemory({ content: "uses postgres", type: MemoryType.FACT, tags: ["database"], confidence: 1, source: "s", embedding: null });

      const results = db.searchByTag("frontend");
      expect(results).toHaveLength(2);
    });
  });

  describe("getAllWithEmbeddings", () => {
    it("returns memories that have embeddings", () => {
      const emb = new Float32Array([0.1, 0.2, 0.3]);
      db.insertMemory({ content: "has embedding", type: MemoryType.FACT, tags: [], confidence: 1, source: "s", embedding: emb });
      db.insertMemory({ content: "no embedding", type: MemoryType.FACT, tags: [], confidence: 1, source: "s", embedding: null });

      const results = db.getAllWithEmbeddings();
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe("has embedding");
    });
  });

  describe("updateConfidence", () => {
    it("updates confidence and increments access count", () => {
      const id = db.insertMemory({ content: "x", type: MemoryType.FACT, tags: [], confidence: 0.5, source: "s", embedding: null });
      db.updateConfidence(id, 0.9);
      const memory = db.getById(id);
      expect(memory!.confidence).toBe(0.9);
      expect(memory!.accessCount).toBe(1);
    });
  });

  describe("delete", () => {
    it("removes a memory", () => {
      const id = db.insertMemory({ content: "x", type: MemoryType.FACT, tags: [], confidence: 1, source: "s", embedding: null });
      db.deleteMemory(id);
      expect(db.getById(id)).toBeNull();
    });
  });

  describe("stats", () => {
    it("returns correct counts", () => {
      db.insertMemory({ content: "a", type: MemoryType.CORRECTION, tags: [], confidence: 1, source: "s", embedding: null });
      db.insertMemory({ content: "b", type: MemoryType.DECISION, tags: [], confidence: 1, source: "s", embedding: null });
      const stats = db.getStats();
      expect(stats.total).toBe(2);
      expect(stats.byType.correction).toBe(1);
      expect(stats.byType.decision).toBe(1);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/database.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement database layer**

```ts
// src/database.ts
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { Memory, MemoryTypeValue } from "./memory.js";

export interface InsertMemoryInput {
  content: string;
  type: MemoryTypeValue;
  tags: string[];
  confidence: number;
  source: string;
  embedding: Float32Array | null;
}

export interface MemoryStats {
  total: number;
  byType: Record<string, number>;
}

export interface EngramDatabase {
  insertMemory(input: InsertMemoryInput): string;
  getById(id: string): Memory | null;
  searchByType(type: MemoryTypeValue): Memory[];
  searchByTag(tag: string): Memory[];
  getAllWithEmbeddings(): Memory[];
  getAll(): Memory[];
  updateConfidence(id: string, confidence: number): void;
  updateEmbedding(id: string, embedding: Float32Array): void;
  touchAccess(id: string): void;
  deleteMemory(id: string): void;
  getStats(): MemoryStats;
  listTables(): string[];
  close(): void;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    type TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    confidence REAL NOT NULL DEFAULT 0.5,
    access_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_accessed INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    embedding BLOB
  );

  CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
  CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
  CREATE INDEX IF NOT EXISTS idx_memories_confidence ON memories(confidence);
`;

function rowToMemory(row: any): Memory {
  return {
    id: row.id,
    content: row.content,
    type: row.type as MemoryTypeValue,
    tags: JSON.parse(row.tags),
    confidence: row.confidence,
    accessCount: row.access_count,
    createdAt: row.created_at,
    lastAccessed: row.last_accessed,
    source: row.source,
    embedding: row.embedding
      ? new Float32Array(
          row.embedding.buffer,
          row.embedding.byteOffset,
          row.embedding.byteLength / 4,
        )
      : null,
  };
}

export function createDatabase(dbPath: string): EngramDatabase {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  const stmts = {
    insert: db.prepare(
      "INSERT INTO memories (id, content, type, tags, confidence, access_count, created_at, last_accessed, source, embedding) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)",
    ),
    getById: db.prepare("SELECT * FROM memories WHERE id = ?"),
    searchByType: db.prepare(
      "SELECT * FROM memories WHERE type = ? ORDER BY last_accessed DESC",
    ),
    getAll: db.prepare("SELECT * FROM memories ORDER BY last_accessed DESC"),
    getAllWithEmbeddings: db.prepare(
      "SELECT * FROM memories WHERE embedding IS NOT NULL",
    ),
    updateConfidence: db.prepare(
      "UPDATE memories SET confidence = ?, access_count = access_count + 1, last_accessed = ? WHERE id = ?",
    ),
    updateEmbedding: db.prepare(
      "UPDATE memories SET embedding = ? WHERE id = ?",
    ),
    touchAccess: db.prepare(
      "UPDATE memories SET access_count = access_count + 1, last_accessed = ? WHERE id = ?",
    ),
    delete: db.prepare("DELETE FROM memories WHERE id = ?"),
    countAll: db.prepare("SELECT COUNT(*) as count FROM memories"),
    countByType: db.prepare(
      "SELECT type, COUNT(*) as count FROM memories GROUP BY type",
    ),
    listTables: db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'",
    ),
  };

  return {
    insertMemory(input) {
      const id = randomUUID();
      const now = Date.now();
      const embeddingBuffer = input.embedding
        ? Buffer.from(input.embedding.buffer)
        : null;
      stmts.insert.run(
        id,
        input.content,
        input.type,
        JSON.stringify(input.tags),
        input.confidence,
        now,
        now,
        input.source,
        embeddingBuffer,
      );
      return id;
    },

    getById(id) {
      const row = stmts.getById.get(id);
      return row ? rowToMemory(row) : null;
    },

    searchByType(type) {
      return stmts.searchByType.all(type).map(rowToMemory);
    },

    searchByTag(tag) {
      const rows = db
        .prepare(
          "SELECT * FROM memories WHERE tags LIKE ? ORDER BY last_accessed DESC",
        )
        .all(`%"${tag}"%`);
      return rows.map(rowToMemory);
    },

    getAllWithEmbeddings() {
      return stmts.getAllWithEmbeddings.all().map(rowToMemory);
    },

    getAll() {
      return stmts.getAll.all().map(rowToMemory);
    },

    updateConfidence(id, confidence) {
      stmts.updateConfidence.run(confidence, Date.now(), id);
    },

    updateEmbedding(id, embedding) {
      stmts.updateEmbedding.run(Buffer.from(embedding.buffer), id);
    },

    touchAccess(id) {
      stmts.touchAccess.run(Date.now(), id);
    },

    deleteMemory(id) {
      stmts.delete.run(id);
    },

    getStats() {
      const total = (stmts.countAll.get() as any).count;
      const rows = stmts.countByType.all() as any[];
      const byType: Record<string, number> = {};
      for (const row of rows) {
        byType[row.type] = row.count;
      }
      return { total, byType };
    },

    listTables() {
      return (stmts.listTables.all() as any[]).map((r) => r.name);
    },

    close() {
      db.close();
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/database.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```
git add src/database.ts tests/database.test.ts
git commit -m "feat: SQLite database layer with typed memory storage"
```

---

## Chunk 2: Intelligence

### Task 4: Embeddings

**Files:**
- Create: `src/embeddings.ts`
- Create: `tests/embeddings.test.ts`

- [ ] **Step 1: Write tests for cosine similarity and embedding interface**

```ts
// tests/embeddings.test.ts
import { describe, it, expect } from "vitest";
import { cosineSimilarity, findTopK } from "../src/embeddings.js";

describe("cosineSimilarity", () => {
  it("returns 1.0 for identical vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1.0, 5);
  });

  it("returns 0.0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it("returns -1.0 for opposite vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  it("handles real-valued vectors", () => {
    const a = new Float32Array([0.5, 0.3, 0.1]);
    const b = new Float32Array([0.4, 0.35, 0.15]);
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(0.95);
    expect(sim).toBeLessThanOrEqual(1.0);
  });
});

describe("findTopK", () => {
  it("returns top k most similar items", () => {
    const query = new Float32Array([1, 0, 0]);
    const candidates = [
      { id: "a", embedding: new Float32Array([0.9, 0.1, 0]), data: "close" },
      { id: "b", embedding: new Float32Array([0, 1, 0]), data: "orthogonal" },
      { id: "c", embedding: new Float32Array([0.8, 0.2, 0.1]), data: "medium" },
    ];

    const results = findTopK(query, candidates, 2);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("a");
    expect(results[1].id).toBe("c");
    expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
  });

  it("returns all candidates if k > candidates.length", () => {
    const query = new Float32Array([1, 0]);
    const candidates = [
      { id: "a", embedding: new Float32Array([1, 0]), data: "x" },
    ];
    const results = findTopK(query, candidates, 10);
    expect(results).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/embeddings.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement embeddings module**

```ts
// src/embeddings.ts

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

export interface EmbeddingCandidate<T> {
  id: string;
  embedding: Float32Array;
  data: T;
}

export interface SimilarityResult<T> {
  id: string;
  similarity: number;
  data: T;
}

export function findTopK<T>(
  query: Float32Array,
  candidates: EmbeddingCandidate<T>[],
  k: number,
): SimilarityResult<T>[] {
  const scored = candidates.map((c) => ({
    id: c.id,
    similarity: cosineSimilarity(query, c.embedding),
    data: c.data,
  }));
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, k);
}

let pipelineInstance: any = null;
let pipelineLoading: Promise<any> | null = null;

async function getEmbeddingPipeline(): Promise<any> {
  if (pipelineInstance) return pipelineInstance;
  if (pipelineLoading) return pipelineLoading;

  pipelineLoading = (async () => {
    try {
      const mod = await import("@huggingface/transformers");
      pipelineInstance = await mod.pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2",
      );
      return pipelineInstance;
    } catch {
      return null;
    }
  })();

  return pipelineLoading;
}

export async function generateEmbedding(
  text: string,
): Promise<Float32Array | null> {
  const extractor = await getEmbeddingPipeline();
  if (!extractor) return null;

  const result = await extractor(text, { pooling: "mean", normalize: true });
  return new Float32Array(result.data);
}

export async function isEmbeddingAvailable(): Promise<boolean> {
  const extractor = await getEmbeddingPipeline();
  return extractor !== null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/embeddings.test.ts`
Expected: All tests PASS (pure math tests, no model needed).

- [ ] **Step 5: Commit**

```
git add src/embeddings.ts tests/embeddings.test.ts
git commit -m "feat: embedding generation and cosine similarity search"
```

---

### Task 5: Recall Engine

**Files:**
- Modify: `src/memory.ts` (add `recallMemories` function)
- Modify: `tests/memory.test.ts` (add recall tests)

- [ ] **Step 1: Write tests for recall**

Append these tests to `tests/memory.test.ts`:

```ts
import { recallMemories } from "../src/memory.js";
import { createDatabase } from "../src/database.js";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

describe("recallMemories", () => {
  let db: ReturnType<typeof createDatabase>;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `engram-recall-test-${Date.now()}.db`);
    db = createDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch {}
  });

  it("returns memories sorted by composite score", () => {
    db.insertMemory({ content: "never use var", type: MemoryType.CORRECTION, tags: ["js"], confidence: 1.0, source: "s", embedding: null });
    db.insertMemory({ content: "project uses webpack", type: MemoryType.FACT, tags: ["build"], confidence: 0.5, source: "s", embedding: null });

    const results = recallMemories(db, { query: null, limit: 10 });
    expect(results.length).toBe(2);
    expect(results[0].content).toBe("never use var");
  });

  it("filters by type", () => {
    db.insertMemory({ content: "a", type: MemoryType.CORRECTION, tags: [], confidence: 1, source: "s", embedding: null });
    db.insertMemory({ content: "b", type: MemoryType.FACT, tags: [], confidence: 1, source: "s", embedding: null });

    const results = recallMemories(db, { query: null, limit: 10, type: MemoryType.CORRECTION });
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe("a");
  });

  it("filters by tag", () => {
    db.insertMemory({ content: "uses react", type: MemoryType.FACT, tags: ["frontend"], confidence: 1, source: "s", embedding: null });
    db.insertMemory({ content: "uses postgres", type: MemoryType.FACT, tags: ["database"], confidence: 1, source: "s", embedding: null });

    const results = recallMemories(db, { query: null, limit: 10, tag: "frontend" });
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe("uses react");
  });

  it("respects limit", () => {
    for (let i = 0; i < 20; i++) {
      db.insertMemory({ content: `memory ${i}`, type: MemoryType.FACT, tags: [], confidence: 1, source: "s", embedding: null });
    }
    const results = recallMemories(db, { query: null, limit: 5 });
    expect(results).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/memory.test.ts`
Expected: FAIL with `recallMemories` not exported.

- [ ] **Step 3: Implement recall engine**

Add to `src/memory.ts`:

```ts
import type { EngramDatabase } from "./database.js";
import { cosineSimilarity } from "./embeddings.js";

export interface RecallOptions {
  query: string | null;
  queryEmbedding?: Float32Array | null;
  limit: number;
  type?: MemoryTypeValue;
  tag?: string;
  minConfidence?: number;
}

export interface RecalledMemory extends Memory {
  score: number;
}

export function recallMemories(
  db: EngramDatabase,
  options: RecallOptions,
): RecalledMemory[] {
  const { query, queryEmbedding, limit, type, tag, minConfidence } = options;
  const now = Date.now();

  let candidates: Memory[];
  if (type) {
    candidates = db.searchByType(type);
  } else if (tag) {
    candidates = db.searchByTag(tag);
  } else {
    candidates = db.getAll();
  }

  if (minConfidence) {
    candidates = candidates.filter((m) => m.confidence >= minConfidence);
  }

  const scored: RecalledMemory[] = candidates.map((memory) => {
    let relevance = 0.5;
    if (queryEmbedding && memory.embedding) {
      relevance = Math.max(0, cosineSimilarity(queryEmbedding, memory.embedding));
    } else if (query && memory.content.toLowerCase().includes(query.toLowerCase())) {
      relevance = 0.75;
    }

    const score = computeScore({
      relevance,
      confidence: memory.confidence,
      lastAccessed: memory.lastAccessed,
      importance: IMPORTANCE_WEIGHTS[memory.type] ?? 0.4,
      now,
    });

    return { ...memory, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/memory.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```
git add src/memory.ts tests/memory.test.ts
git commit -m "feat: recall engine with composite scoring and filters"
```

---

## Chunk 3: MCP Server

### Task 6: MCP Tool Definitions

**Files:**
- Create: `src/tools.ts`

- [ ] **Step 1: Implement all MCP tools**

Create `src/tools.ts` with the following content. This file registers four tools on the MCP server: `memory_store`, `memory_recall`, `memory_context`, and `memory_forget`.

The `memory_store` tool:
- Accepts content, type, tags, confidence, source
- Generates an embedding for the content
- Checks for conflicts with existing memories (high cosine similarity)
- If conflict found, updates existing memory confidence instead of duplicating
- If similar but not conflicting, reinforces the existing memory

The `memory_recall` tool:
- Accepts a natural language query, limit, optional type/tag/confidence filters
- Generates an embedding for the query
- Uses the recall engine to find and rank memories
- Touches access timestamps on returned memories

The `memory_context` tool:
- Accepts a topic and approximate token budget
- Retrieves all relevant memories
- Groups by type with corrections first (they override other context)
- Trims to fit within token budget

The `memory_forget` tool:
- Accepts either a specific memory ID or a search query
- Query-based deletion requires explicit confirmation (confirm=true)
- Previews matches before deleting

Each tool uses zod schemas for input validation and returns structured text responses.

- [ ] **Step 2: Commit**

```
git add src/tools.ts
git commit -m "feat: MCP tool definitions for store, recall, context, forget"
```

---

### Task 7: Server Entry Point

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Implement the MCP server entry point**

Replace `src/index.ts` with:

```ts
#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDatabase } from "./database.js";
import { registerTools } from "./tools.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const ENGRAM_DIR = process.env.ENGRAM_DIR || path.join(os.homedir(), ".engram");
const DB_PATH = process.env.ENGRAM_DB || path.join(ENGRAM_DIR, "memory.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = createDatabase(DB_PATH);

const server = new McpServer({
  name: "engram",
  version: "0.1.0",
});

registerTools(server, db);

process.on("SIGINT", () => {
  db.close();
  process.exit(0);
});
process.on("SIGTERM", () => {
  db.close();
  process.exit(0);
});

const transport = new StdioServerTransport();
await server.connect(transport);

console.error("Engram running. DB: " + DB_PATH);
```

- [ ] **Step 2: Build and verify**

Run: `npx tsc`
Expected: Clean compile, dist/ directory created.

- [ ] **Step 3: Verify the shebang is in the output**

Run: `head -1 dist/index.js`
Expected: `#!/usr/bin/env node`

- [ ] **Step 4: Commit**

```
git add src/index.ts
git commit -m "feat: MCP server entry point with SQLite initialization"
```

---

### Task 8: Integration Tests

**Files:**
- Create: `tests/tools.test.ts`

- [ ] **Step 1: Write integration test for the full tool flow**

```ts
// tests/tools.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, type EngramDatabase } from "../src/database.js";
import { MemoryType } from "../src/memory.js";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

describe("Tool Integration", () => {
  let db: EngramDatabase;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `engram-integration-${Date.now()}.db`);
    db = createDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch {}
  });

  it("full lifecycle: store, recall, forget", () => {
    const id = db.insertMemory({
      content: "never use any type in TypeScript",
      type: MemoryType.CORRECTION,
      tags: ["typescript", "types"],
      confidence: 1.0,
      source: "test",
      embedding: null,
    });
    expect(id).toBeTruthy();

    const corrections = db.searchByType(MemoryType.CORRECTION);
    expect(corrections).toHaveLength(1);
    expect(corrections[0].content).toContain("never use any");

    const tsMemories = db.searchByTag("typescript");
    expect(tsMemories).toHaveLength(1);

    db.deleteMemory(id);
    expect(db.getById(id)).toBeNull();
    expect(db.searchByType(MemoryType.CORRECTION)).toHaveLength(0);
  });

  it("confidence reinforcement", () => {
    const id = db.insertMemory({
      content: "user prefers functional style",
      type: MemoryType.PATTERN,
      tags: ["code-style"],
      confidence: 0.6,
      source: "test",
      embedding: null,
    });

    db.updateConfidence(id, 0.9);
    const memory = db.getById(id);
    expect(memory!.confidence).toBe(0.9);
    expect(memory!.accessCount).toBe(1);
  });

  it("stats reflect stored memories", () => {
    db.insertMemory({ content: "a", type: MemoryType.CORRECTION, tags: [], confidence: 1, source: "s", embedding: null });
    db.insertMemory({ content: "b", type: MemoryType.DECISION, tags: [], confidence: 1, source: "s", embedding: null });
    db.insertMemory({ content: "c", type: MemoryType.CORRECTION, tags: [], confidence: 1, source: "s", embedding: null });

    const stats = db.getStats();
    expect(stats.total).toBe(3);
    expect(stats.byType.correction).toBe(2);
    expect(stats.byType.decision).toBe(1);
  });
});
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests across all files PASS.

- [ ] **Step 3: Commit**

```
git add tests/tools.test.ts
git commit -m "test: integration tests for full memory lifecycle"
```

---

### Task 9: Build, Package, and Integration

**Files:**
- Modify: `.gitignore` (add dist/, node_modules/)

- [ ] **Step 1: Update .gitignore**

Add to `.gitignore`:
```
node_modules/
dist/
```

- [ ] **Step 2: Build the project**

Run: `npm run build`
Expected: `dist/` directory with compiled JS files.

- [ ] **Step 3: Make entry point executable**

Run: `chmod +x dist/index.js`

- [ ] **Step 4: Test the server starts**

Run: `echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}' | node dist/index.js 2>/dev/null | head -c 500`
Expected: JSON response with server capabilities.

- [ ] **Step 5: Final commit**

```
git add -A
git commit -m "feat: Engram v0.1.0 — local-first developer memory MCP server"
```

---

## Post-MVP Roadmap (not in this plan)

Phase 2+ features to build after MVP is validated:

1. **Automatic extraction pipeline** — Post-conversation hook that extracts memories using Haiku
2. **Memory evolution** — When storing a new memory, update related existing memories (A-Mem approach)
3. **Sleep-time consolidation** — Background cron that merges redundant memories and compresses old ones
4. **Proactive context injection** — Periodically query memory and surface relevant context mid-conversation
5. **Verification layer** — Code-related memories verified against actual filesystem
6. **Markdown export** — Generate human-readable memory.md from SQLite for git tracking
7. **CLI tool** — `engram recall "auth"`, `engram stats`, `engram export`
8. **npm publish** — Publish to npm registry for `npx engram` installation
9. **Knowledge graph** — Entity + relation tables for connected understanding
10. **Team memory** — Shared project context via git-synced SQLite
