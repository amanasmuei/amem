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
    try {
      fs.unlinkSync(dbPath);
    } catch {}
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
    db.insertMemory({
      content: "a",
      type: MemoryType.CORRECTION,
      tags: [],
      confidence: 1,
      source: "s",
      embedding: null,
    });
    db.insertMemory({
      content: "b",
      type: MemoryType.DECISION,
      tags: [],
      confidence: 1,
      source: "s",
      embedding: null,
    });
    db.insertMemory({
      content: "c",
      type: MemoryType.CORRECTION,
      tags: [],
      confidence: 1,
      source: "s",
      embedding: null,
    });

    const stats = db.getStats();
    expect(stats.total).toBe(3);
    expect(stats.byType.correction).toBe(2);
    expect(stats.byType.decision).toBe(1);
  });

  describe("batch extraction", () => {
    it("stores multiple memories in one batch", () => {
      // Simulate what memory_extract does internally
      const inputs = [
        { content: "user prefers TypeScript", type: MemoryType.PREFERENCE, tags: ["language"], confidence: 0.8, source: "conv-1" },
        { content: "chose Postgres for ACID", type: MemoryType.DECISION, tags: ["database"], confidence: 0.9, source: "conv-1" },
        { content: "don't use var", type: MemoryType.CORRECTION, tags: ["javascript"], confidence: 1.0, source: "conv-1" },
      ];

      for (const input of inputs) {
        db.insertMemory({ ...input, embedding: null });
      }

      const stats = db.getStats();
      expect(stats.total).toBe(3);
      expect(stats.byType.preference).toBe(1);
      expect(stats.byType.decision).toBe(1);
      expect(stats.byType.correction).toBe(1);
    });

    it("deduplicates with high-similarity embeddings", () => {
      // Store original memory with embedding
      const emb1 = new Float32Array([0.9, 0.1, 0.0]);
      db.insertMemory({
        content: "user prefers functional style",
        type: MemoryType.PATTERN,
        tags: ["code-style"],
        confidence: 0.7,
        source: "conv-1",
        embedding: emb1,
      });

      // Attempt to store near-duplicate
      const emb2 = new Float32Array([0.88, 0.12, 0.01]); // very similar
      const existing = db.getAllWithEmbeddings();

      // Simulate deduplication logic
      let isDuplicate = false;
      for (const mem of existing) {
        if (!mem.embedding) continue;
        // Compute similarity manually
        let dot = 0, nA = 0, nB = 0;
        for (let i = 0; i < emb2.length; i++) {
          dot += emb2[i] * mem.embedding[i];
          nA += emb2[i] * emb2[i];
          nB += mem.embedding[i] * mem.embedding[i];
        }
        const sim = dot / (Math.sqrt(nA) * Math.sqrt(nB));
        if (sim > 0.85) {
          db.updateConfidence(mem.id, Math.min(1.0, mem.confidence + 0.1));
          isDuplicate = true;
          break;
        }
      }

      expect(isDuplicate).toBe(true);
      expect(db.getAll()).toHaveLength(1); // No duplicate stored
      expect(db.getAll()[0].confidence).toBeCloseTo(0.8, 5); // Reinforced from 0.7 to 0.8
    });

    it("stores non-duplicate alongside existing", () => {
      const emb1 = new Float32Array([1.0, 0.0, 0.0]);
      db.insertMemory({
        content: "uses TypeScript",
        type: MemoryType.PREFERENCE,
        tags: [],
        confidence: 0.8,
        source: "s",
        embedding: emb1,
      });

      // Completely different memory
      const emb2 = new Float32Array([0.0, 1.0, 0.0]);
      db.insertMemory({
        content: "uses PostgreSQL",
        type: MemoryType.FACT,
        tags: [],
        confidence: 0.6,
        source: "s",
        embedding: emb2,
      });

      expect(db.getAll()).toHaveLength(2);
    });
  });
});
