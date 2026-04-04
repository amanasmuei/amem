import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  MemoryType,
  IMPORTANCE_WEIGHTS,
  computeScore,
  detectConflict,
  recallMemories,
  type Memory,
  createDatabase,
} from "@aman_asmuei/amem-core";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

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

describe("recallMemories", () => {
  let db: ReturnType<typeof createDatabase>;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `amem-recall-test-${Date.now()}.db`);
    db = createDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch {}
  });

  it("returns memories sorted by composite score", () => {
    db.insertMemory({ content: "never use var", type: MemoryType.CORRECTION, tags: ["js"], confidence: 1.0, source: "s", embedding: null, scope: "global" });
    db.insertMemory({ content: "project uses webpack", type: MemoryType.FACT, tags: ["build"], confidence: 0.5, source: "s", embedding: null, scope: "global" });

    const results = recallMemories(db, { query: null, limit: 10 });
    expect(results.length).toBe(2);
    expect(results[0].content).toBe("never use var");
  });

  it("filters by type", () => {
    db.insertMemory({ content: "a", type: MemoryType.CORRECTION, tags: [], confidence: 1, source: "s", embedding: null, scope: "global" });
    db.insertMemory({ content: "b", type: MemoryType.FACT, tags: [], confidence: 1, source: "s", embedding: null, scope: "global" });

    const results = recallMemories(db, { query: null, limit: 10, type: MemoryType.CORRECTION });
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe("a");
  });

  it("filters by tag", () => {
    db.insertMemory({ content: "uses react", type: MemoryType.FACT, tags: ["frontend"], confidence: 1, source: "s", embedding: null, scope: "global" });
    db.insertMemory({ content: "uses postgres", type: MemoryType.FACT, tags: ["database"], confidence: 1, source: "s", embedding: null, scope: "global" });

    const results = recallMemories(db, { query: null, limit: 10, tag: "frontend" });
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe("uses react");
  });

  it("respects limit", () => {
    for (let i = 0; i < 20; i++) {
      db.insertMemory({ content: `memory ${i}`, type: MemoryType.FACT, tags: [], confidence: 1, source: "s", embedding: null, scope: "global" });
    }
    const results = recallMemories(db, { query: null, limit: 5 });
    expect(results).toHaveLength(5);
  });
});
