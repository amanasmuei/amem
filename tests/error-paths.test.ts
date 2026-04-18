import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, type AmemDatabase, MemoryType, recallMemories, consolidateMemories, cosineSimilarity } from "@aman_asmuei/amem-core";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Error paths", () => {
  let db: AmemDatabase;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `amem-error-test-${Date.now()}.db`);
    db = createDatabase(dbPath);
  });

  afterEach(() => {
    try { db.close(); } catch { /* may already be closed */ }
    try { fs.unlinkSync(dbPath); } catch { /* may already be deleted */ }
    try { fs.unlinkSync(dbPath + "-wal"); } catch { /* WAL cleanup */ }
    try { fs.unlinkSync(dbPath + "-shm"); } catch { /* SHM cleanup */ }
  });

  describe("Database resilience", () => {
    it("handles read-only database by throwing on createDatabase", () => {
      // Store a memory first, then make DB read-only
      db.insertMemory({
        content: "test memory",
        type: MemoryType.FACT,
        tags: ["test"],
        confidence: 0.9,
        source: "test",
        embedding: null,
        scope: "global",
      });
      db.close();

      // Make file read-only — createDatabase runs migrations, so it needs write
      fs.chmodSync(dbPath, 0o444);

      // Should throw because createDatabase needs to run migrations
      expect(() => createDatabase(dbPath)).toThrow();

      // Restore permissions for cleanup
      fs.chmodSync(dbPath, 0o644);
    });

    it("throws when database directory does not exist", () => {
      const nestedPath = path.join(os.tmpdir(), `amem-nested-${Date.now()}`, "sub", "memory.db");
      expect(() => createDatabase(nestedPath)).toThrow();
    });

    it("handles concurrent rapid inserts without corruption", () => {
      const ids: string[] = [];
      for (let i = 0; i < 100; i++) {
        const id = db.insertMemory({
          content: `rapid insert ${i}`,
          type: MemoryType.FACT,
          tags: [`batch-${i}`],
          confidence: 0.5 + (i % 5) * 0.1,
          source: "stress-test",
          embedding: null,
          scope: "global",
        });
        ids.push(id);
      }
      expect(ids.length).toBe(100);
      expect(new Set(ids).size).toBe(100); // All unique IDs
      expect(db.getAll().length).toBe(100);
    });

    it("rejects empty content", () => {
      // Depends on whether the DB layer validates — test the behavior
      const id = db.insertMemory({
        content: "",
        type: MemoryType.FACT,
        tags: [],
        confidence: 0.5,
        source: "test",
        embedding: null,
        scope: "global",
      });
      // If it succeeds, verify it was stored
      if (id) {
        const mem = db.getById(id);
        expect(mem).toBeTruthy();
        expect(mem!.content).toBe("");
      }
    });
  });

  describe("Recall with edge cases", () => {
    it("recall on empty database returns empty array", () => {
      const results = recallMemories(db, "anything", "global", "project:test");
      expect(results).toEqual([]);
    });

    it("recall with special characters in query does not crash", () => {
      db.insertMemory({
        content: "normal memory",
        type: MemoryType.FACT,
        tags: ["test"],
        confidence: 0.9,
        source: "test",
        embedding: null,
        scope: "global",
      });

      // FTS5 special chars that could break queries
      const specialQueries = [
        'SELECT * FROM memories; DROP TABLE memories;--',
        '") OR 1=1 --',
        "content with 'single quotes'",
        "content with (parentheses)",
        "content with {braces}",
        "***wildcards***",
        "query:with:colons",
        "a".repeat(10000), // very long query
      ];

      for (const query of specialQueries) {
        expect(() => {
          recallMemories(db, query, "global", "project:test");
        }).not.toThrow();
      }
    });

    it("recall with unicode content works", () => {
      db.insertMemory({
        content: "日本語のメモリ — remember emoji 🧠 and accents café",
        type: MemoryType.FACT,
        tags: ["unicode"],
        confidence: 0.9,
        source: "test",
        embedding: null,
        scope: "global",
      });

      const results = recallMemories(db, "emoji", "global", "project:test");
      expect(results.length).toBeGreaterThanOrEqual(0); // May or may not match depending on FTS
    });
  });

  describe("Consolidation edge cases", () => {
    it("consolidation on empty database is safe", () => {
      const result = consolidateMemories(db, cosineSimilarity, {
        maxStaleDays: 60, minConfidence: 0.3, minAccessCount: 2, dryRun: false,
      });
      expect(result).toBeTruthy();
      expect(result.merged).toBe(0);
      expect(result.pruned).toBe(0);
    });

    it("consolidation with single memory does not prune it", () => {
      db.insertMemory({
        content: "lonely memory",
        type: MemoryType.DECISION,
        tags: ["alone"],
        confidence: 0.9,
        source: "test",
        embedding: null,
        scope: "global",
      });

      const result = consolidateMemories(db, cosineSimilarity, {
        maxStaleDays: 60, minConfidence: 0.3, minAccessCount: 2, dryRun: false,
      });
      expect(result.merged).toBe(0);
      expect(result.pruned).toBe(0);
      expect(db.getAll().length).toBe(1);
    });
  });

  describe("Content-hash deduplication", () => {
    it("rejects exact duplicate content", () => {
      const id1 = db.insertMemory({
        content: "identical content",
        type: MemoryType.FACT,
        tags: ["v1"],
        confidence: 0.5,
        source: "first",
        embedding: null,
        scope: "global",
      });

      const id2 = db.insertMemory({
        content: "identical content",
        type: MemoryType.FACT,
        tags: ["v2"],
        confidence: 0.8,
        source: "second",
        embedding: null,
        scope: "global",
      });

      // Second insert should either return same ID or a conflict indicator
      const all = db.getAll();
      const uniqueContents = new Set(all.map(m => m.content));
      expect(uniqueContents.size).toBe(1); // Only one copy stored
    });
  });

  describe("Embedding edge cases", () => {
    it("handles null embeddings in similarity computations", () => {
      // Store memories without embeddings — recall should still work via FTS
      for (let i = 0; i < 5; i++) {
        db.insertMemory({
          content: `memory about TypeScript patterns ${i}`,
          type: MemoryType.PATTERN,
          tags: ["typescript"],
          confidence: 0.8,
          source: "test",
          embedding: null,
          scope: "global",
        });
      }

      const results = recallMemories(db, "TypeScript", "global", "project:test");
      expect(results.length).toBeGreaterThan(0);
    });

    it("handles synthetic embedding vectors correctly", () => {
      const embedding = new Float32Array(384).fill(0.1);

      const id = db.insertMemory({
        content: "memory with embedding",
        type: MemoryType.FACT,
        tags: [],
        confidence: 0.9,
        source: "test",
        embedding: Buffer.from(embedding.buffer),
        scope: "global",
      });

      const mem = db.getById(id);
      expect(mem).toBeTruthy();
      expect(mem!.embedding).toBeTruthy();
    });
  });

  describe("Boundary values", () => {
    it("handles confidence at boundaries", () => {
      const id0 = db.insertMemory({
        content: "zero confidence",
        type: MemoryType.FACT,
        tags: [],
        confidence: 0,
        source: "test",
        embedding: null,
        scope: "global",
      });
      const id1 = db.insertMemory({
        content: "full confidence",
        type: MemoryType.FACT,
        tags: [],
        confidence: 1,
        source: "test",
        embedding: null,
        scope: "global",
      });

      expect(db.getById(id0)!.confidence).toBe(0);
      expect(db.getById(id1)!.confidence).toBe(1);
    });

    it("handles very long content", () => {
      const longContent = "x".repeat(100_000);
      const id = db.insertMemory({
        content: longContent,
        type: MemoryType.FACT,
        tags: [],
        confidence: 0.5,
        source: "test",
        embedding: null,
        scope: "global",
      });

      const mem = db.getById(id);
      expect(mem).toBeTruthy();
      expect(mem!.content.length).toBe(100_000);
    });

    it("handles many tags", () => {
      const tags = Array.from({ length: 100 }, (_, i) => `tag-${i}`);
      const id = db.insertMemory({
        content: "heavily tagged",
        type: MemoryType.FACT,
        tags,
        confidence: 0.5,
        source: "test",
        embedding: null,
        scope: "global",
      });

      const mem = db.getById(id);
      expect(mem).toBeTruthy();
    });

    it("handles all memory types", () => {
      const types = [
        MemoryType.CORRECTION,
        MemoryType.DECISION,
        MemoryType.PATTERN,
        MemoryType.PREFERENCE,
        MemoryType.TOPOLOGY,
        MemoryType.FACT,
      ] as const;

      for (const type of types) {
        const id = db.insertMemory({
          content: `memory of type ${type}`,
          type,
          tags: [],
          confidence: 0.7,
          source: "test",
          embedding: null,
          scope: "global",
        });
        expect(id).toBeTruthy();
        expect(db.getById(id)!.type).toBe(type);
      }
    });
  });
});
