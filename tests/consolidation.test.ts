import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, type AmemDatabase } from "../src/database.js";
import { MemoryType, consolidateMemories } from "../src/memory.js";
import { cosineSimilarity } from "../src/embeddings.js";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

describe("Memory Consolidation", () => {
  let db: AmemDatabase;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `amem-consolidate-${Date.now()}.db`);
    db = createDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch {}
  });

  it("merges near-duplicate memories", () => {
    db.insertMemory({ content: "use TypeScript strictly", type: MemoryType.PREFERENCE, tags: [], confidence: 0.7, source: "s", embedding: new Float32Array([0.9, 0.1, 0.0]), scope: "global" });
    db.insertMemory({ content: "use TypeScript with strict mode", type: MemoryType.PREFERENCE, tags: [], confidence: 0.8, source: "s", embedding: new Float32Array([0.88, 0.12, 0.01]), scope: "global" });

    const report = consolidateMemories(db, cosineSimilarity, {
      maxStaleDays: 60, minConfidence: 0.3, minAccessCount: 2, dryRun: false,
    });

    expect(report.merged).toBe(1);
    expect(db.getAll()).toHaveLength(1);
    expect(db.getAll()[0].confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("never prunes corrections regardless of staleness", () => {
    const corrId = db.insertMemory({ content: "never use var", type: MemoryType.CORRECTION, tags: [], confidence: 0.1, source: "s", embedding: null, scope: "global" });

    const report = consolidateMemories(db, cosineSimilarity, {
      maxStaleDays: 0, minConfidence: 1.0, minAccessCount: 999, dryRun: false,
    });

    expect(db.getById(corrId)).not.toBeNull();
  });

  it("promotes frequently-accessed memories", () => {
    const id = db.insertMemory({ content: "prefers functional style", type: MemoryType.PATTERN, tags: [], confidence: 0.5, source: "s", embedding: null, scope: "global" });
    for (let i = 0; i < 5; i++) db.touchAccess(id);

    const report = consolidateMemories(db, cosineSimilarity, {
      maxStaleDays: 60, minConfidence: 0.3, minAccessCount: 2, dryRun: false,
    });

    expect(report.promoted).toBe(1);
    expect(db.getById(id)!.confidence).toBe(0.9);
  });

  it("dryRun does not modify data", () => {
    db.insertMemory({ content: "a", type: MemoryType.FACT, tags: [], confidence: 0.7, source: "s", embedding: new Float32Array([0.9, 0.1, 0.0]), scope: "global" });
    db.insertMemory({ content: "b", type: MemoryType.FACT, tags: [], confidence: 0.8, source: "s", embedding: new Float32Array([0.88, 0.12, 0.01]), scope: "global" });

    const report = consolidateMemories(db, cosineSimilarity, {
      maxStaleDays: 60, minConfidence: 0.3, minAccessCount: 2, dryRun: true,
    });

    expect(report.merged).toBe(1);
    expect(db.getAll()).toHaveLength(2); // unchanged
  });

  it("returns health score between 0-100", () => {
    db.insertMemory({ content: "correction", type: MemoryType.CORRECTION, tags: [], confidence: 1.0, source: "s", embedding: null, scope: "global" });
    db.insertMemory({ content: "low fact", type: MemoryType.FACT, tags: [], confidence: 0.3, source: "s", embedding: null, scope: "global" });

    const report = consolidateMemories(db, cosineSimilarity, {
      maxStaleDays: 60, minConfidence: 0.3, minAccessCount: 2, dryRun: true,
    });

    expect(report.healthScore).toBeGreaterThan(0);
    expect(report.healthScore).toBeLessThanOrEqual(100);
  });
});
