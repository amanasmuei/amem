import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, type AmemDatabase } from "../src/database.js";
import { MemoryType } from "../src/memory.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("AmemDatabase", () => {
  let db: AmemDatabase;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `amem-test-${Date.now()}.db`);
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
        embedding: null, scope: "global",
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
        embedding: null, scope: "global",
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
      db.insertMemory({ content: "a", type: MemoryType.CORRECTION, tags: [], confidence: 1, source: "s", embedding: null, scope: "global" });
      db.insertMemory({ content: "b", type: MemoryType.FACT, tags: [], confidence: 1, source: "s", embedding: null, scope: "global" });
      db.insertMemory({ content: "c", type: MemoryType.CORRECTION, tags: [], confidence: 1, source: "s", embedding: null, scope: "global" });
      const results = db.searchByType(MemoryType.CORRECTION);
      expect(results).toHaveLength(2);
    });

    it("finds memories by tag", () => {
      db.insertMemory({ content: "uses react", type: MemoryType.FACT, tags: ["frontend", "react"], confidence: 1, source: "s", embedding: null, scope: "global" });
      db.insertMemory({ content: "uses vue", type: MemoryType.FACT, tags: ["frontend", "vue"], confidence: 1, source: "s", embedding: null, scope: "global" });
      db.insertMemory({ content: "uses postgres", type: MemoryType.FACT, tags: ["database"], confidence: 1, source: "s", embedding: null, scope: "global" });
      const results = db.searchByTag("frontend");
      expect(results).toHaveLength(2);
    });
  });

  describe("getAllWithEmbeddings", () => {
    it("returns memories that have embeddings", () => {
      const emb = new Float32Array([0.1, 0.2, 0.3]);
      db.insertMemory({ content: "has embedding", type: MemoryType.FACT, tags: [], confidence: 1, source: "s", embedding: emb, scope: "global"});
      db.insertMemory({ content: "no embedding", type: MemoryType.FACT, tags: [], confidence: 1, source: "s", embedding: null, scope: "global" });
      const results = db.getAllWithEmbeddings();
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe("has embedding");
    });
  });

  describe("updateConfidence", () => {
    it("updates confidence and increments access count", () => {
      const id = db.insertMemory({ content: "x", type: MemoryType.FACT, tags: [], confidence: 0.5, source: "s", embedding: null, scope: "global" });
      db.updateConfidence(id, 0.9);
      const memory = db.getById(id);
      expect(memory!.confidence).toBe(0.9);
      expect(memory!.accessCount).toBe(1);
    });
  });

  describe("delete", () => {
    it("removes a memory", () => {
      const id = db.insertMemory({ content: "x", type: MemoryType.FACT, tags: [], confidence: 1, source: "s", embedding: null, scope: "global" });
      db.deleteMemory(id);
      expect(db.getById(id)).toBeNull();
    });
  });

  describe("stats", () => {
    it("returns correct counts", () => {
      db.insertMemory({ content: "a", type: MemoryType.CORRECTION, tags: [], confidence: 1, source: "s", embedding: null, scope: "global" });
      db.insertMemory({ content: "b", type: MemoryType.DECISION, tags: [], confidence: 1, source: "s", embedding: null, scope: "global" });
      const stats = db.getStats();
      expect(stats.total).toBe(2);
      expect(stats.byType.correction).toBe(1);
      expect(stats.byType.decision).toBe(1);
    });
  });

  it("stores and retrieves memory with scope", () => {
    const id = db.insertMemory({
      content: "auth is in src/auth",
      type: MemoryType.TOPOLOGY as any,
      tags: ["auth"],
      confidence: 0.7,
      source: "test",
      embedding: null,
      scope: "project:amem",
    });
    const mem = db.getById(id);
    expect(mem!.scope).toBe("project:amem");
  });

  it("getAllForProject returns global + project memories only", () => {
    db.insertMemory({ content: "global correction", type: MemoryType.CORRECTION as any, tags: [], confidence: 1, source: "s", embedding: null, scope: "global" });
    db.insertMemory({ content: "amem topology", type: MemoryType.TOPOLOGY as any, tags: [], confidence: 0.7, source: "s", embedding: null, scope: "project:amem" });
    db.insertMemory({ content: "other topology", type: MemoryType.TOPOLOGY as any, tags: [], confidence: 0.7, source: "s", embedding: null, scope: "project:other" });

    const results = db.getAllForProject("project:amem");
    expect(results).toHaveLength(2);
    expect(results.some(m => m.content === "other topology")).toBe(false);
  });

  it("searchByScope returns only matching scope", () => {
    db.insertMemory({ content: "a", type: MemoryType.FACT as any, tags: [], confidence: 0.5, source: "s", embedding: null, scope: "global" });
    db.insertMemory({ content: "b", type: MemoryType.FACT as any, tags: [], confidence: 0.5, source: "s", embedding: null, scope: "project:x" });

    const globals = db.searchByScope("global");
    expect(globals).toHaveLength(1);
    expect(globals[0].content).toBe("a");
  });
});
