import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, type AmemDatabase, MemoryType, autoRelateMemory } from "@aman_asmuei/amem-core";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const makeEmb = (seed: number) => {
  const e = new Float32Array(384);
  for (let i = 0; i < 384; i++) e[i] = Math.sin(seed + i * 0.1);
  let norm = 0;
  for (let i = 0; i < 384; i++) norm += e[i] * e[i];
  norm = Math.sqrt(norm);
  for (let i = 0; i < 384; i++) e[i] /= norm;
  return e;
};

describe("autoRelateMemory", () => {
  let db: AmemDatabase;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `amem-autorelate-${Date.now()}.db`);
    db = createDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch {}
  });

  it("creates relations for similar memories", () => {
    // Offsets of 0.3-0.5 produce similarity in the 0.88-0.96 range (within 0.6-0.95 band)
    const id1 = db.insertMemory({ content: "memory one", type: MemoryType.FACT, tags: [], confidence: 0.8, source: "test", embedding: makeEmb(1.0), scope: "global" });
    const id2 = db.insertMemory({ content: "memory two", type: MemoryType.FACT, tags: [], confidence: 0.8, source: "test", embedding: makeEmb(1.5), scope: "global" });
    const id3 = db.insertMemory({ content: "memory three", type: MemoryType.FACT, tags: [], confidence: 0.8, source: "test", embedding: makeEmb(1.4), scope: "global" });

    const result = autoRelateMemory(db, id3);
    expect(result.created).toBeGreaterThan(0);
    expect(result.relations.length).toBeGreaterThan(0);

    // Verify relations exist in the database
    const relations = db.getRelations(id3);
    expect(relations.length).toBe(result.created);
    for (const rel of relations) {
      expect(rel.relationshipType).toBe("related_to");
    }
  });

  it("does nothing when no embeddings exist", () => {
    const id1 = db.insertMemory({ content: "memory one", type: MemoryType.FACT, tags: [], confidence: 0.8, source: "test", embedding: null, scope: "global" });
    const id2 = db.insertMemory({ content: "memory two", type: MemoryType.FACT, tags: [], confidence: 0.8, source: "test", embedding: null, scope: "global" });

    const result = autoRelateMemory(db, id2);
    expect(result.created).toBe(0);
    expect(result.relations).toEqual([]);
  });

  it("caps at maxRelations", () => {
    // Create 5 memories with offsets that land in the 0.6-0.95 band from the last one
    // Last memory is at seed 1.0; others spaced at 0.3 intervals
    const seeds = [1.4, 1.5, 1.6, 1.7, 1.0];
    const ids: string[] = [];
    for (let i = 0; i < seeds.length; i++) {
      ids.push(db.insertMemory({ content: `memory ${i}`, type: MemoryType.FACT, tags: [], confidence: 0.8, source: "test", embedding: makeEmb(seeds[i]), scope: "global" }));
    }

    const result = autoRelateMemory(db, ids[4], { maxRelations: 2 });
    expect(result.created).toBe(2);
    expect(result.relations.length).toBe(2);
  });

  it("skips near-duplicates (>0.95 similarity)", () => {
    // Seed 1.0 vs 1.001 => ~0.9999 (near-dupe, should be skipped)
    // Seed 1.0 vs 1.5 => ~0.88 (valid relation)
    const id1 = db.insertMemory({ content: "memory one", type: MemoryType.FACT, tags: [], confidence: 0.8, source: "test", embedding: makeEmb(1.0), scope: "global" });
    const id2 = db.insertMemory({ content: "memory two", type: MemoryType.FACT, tags: [], confidence: 0.8, source: "test", embedding: makeEmb(1.001), scope: "global" });
    const id3 = db.insertMemory({ content: "memory three", type: MemoryType.FACT, tags: [], confidence: 0.8, source: "test", embedding: makeEmb(1.5), scope: "global" });

    const result = autoRelateMemory(db, id2);
    // Should not link to id1 (near-dupe >0.95), but should link to id3
    for (const rel of result.relations) {
      expect(rel.similarity).toBeLessThan(0.95);
      expect(rel.similarity).toBeGreaterThanOrEqual(0.6);
    }
    // Verify id1 is not in the relations
    expect(result.relations.find(r => r.toId === id1)).toBeUndefined();
  });

  it("doesn't create duplicate relations", () => {
    const id1 = db.insertMemory({ content: "memory one", type: MemoryType.FACT, tags: [], confidence: 0.8, source: "test", embedding: makeEmb(1.0), scope: "global" });
    const id2 = db.insertMemory({ content: "memory two", type: MemoryType.FACT, tags: [], confidence: 0.8, source: "test", embedding: makeEmb(1.5), scope: "global" });

    // First call creates relations
    const result1 = autoRelateMemory(db, id2);
    // Second call should not create duplicates
    const result2 = autoRelateMemory(db, id2);

    expect(result2.created).toBe(0);
    // Total relations should still be the same
    const relations = db.getRelations(id2);
    expect(relations.length).toBe(result1.created);
  });
});
