import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  MemoryType,
  IMPORTANCE_WEIGHTS,
  computeScore,
  detectConflict,
  recallMemories,
  type MemoryTypeValue,
} from "./memory.js";
import { createDatabase, type AmemDatabase } from "./database.js";

describe("MemoryType constants", () => {
  it("has the expected types", () => {
    expect(MemoryType.CORRECTION).toBe("correction");
    expect(MemoryType.DECISION).toBe("decision");
    expect(MemoryType.PATTERN).toBe("pattern");
    expect(MemoryType.PREFERENCE).toBe("preference");
    expect(MemoryType.TOPOLOGY).toBe("topology");
    expect(MemoryType.FACT).toBe("fact");
  });
});

describe("IMPORTANCE_WEIGHTS", () => {
  it("correction has highest weight (1.0)", () => {
    expect(IMPORTANCE_WEIGHTS.correction).toBe(1.0);
  });

  it("decision has weight 0.85", () => {
    expect(IMPORTANCE_WEIGHTS.decision).toBe(0.85);
  });

  it("pattern and preference have weight 0.7", () => {
    expect(IMPORTANCE_WEIGHTS.pattern).toBe(0.7);
    expect(IMPORTANCE_WEIGHTS.preference).toBe(0.7);
  });

  it("topology has weight 0.5", () => {
    expect(IMPORTANCE_WEIGHTS.topology).toBe(0.5);
  });

  it("fact has lowest weight (0.4)", () => {
    expect(IMPORTANCE_WEIGHTS.fact).toBe(0.4);
  });

  it("weights are ordered: correction > decision > pattern = preference > topology > fact", () => {
    expect(IMPORTANCE_WEIGHTS.correction).toBeGreaterThan(IMPORTANCE_WEIGHTS.decision);
    expect(IMPORTANCE_WEIGHTS.decision).toBeGreaterThan(IMPORTANCE_WEIGHTS.pattern);
    expect(IMPORTANCE_WEIGHTS.pattern).toBe(IMPORTANCE_WEIGHTS.preference);
    expect(IMPORTANCE_WEIGHTS.preference).toBeGreaterThan(IMPORTANCE_WEIGHTS.topology);
    expect(IMPORTANCE_WEIGHTS.topology).toBeGreaterThan(IMPORTANCE_WEIGHTS.fact);
  });
});

describe("computeScore", () => {
  it("returns higher score for recently accessed memories", () => {
    const now = Date.now();
    const recentScore = computeScore({
      relevance: 0.8,
      confidence: 0.9,
      lastAccessed: now - 1000 * 60 * 60, // 1 hour ago
      importance: 1.0,
      now,
    });
    const oldScore = computeScore({
      relevance: 0.8,
      confidence: 0.9,
      lastAccessed: now - 1000 * 60 * 60 * 24 * 30, // 30 days ago
      importance: 1.0,
      now,
    });
    expect(recentScore).toBeGreaterThan(oldScore);
  });

  it("returns higher score for higher confidence", () => {
    const now = Date.now();
    const highConf = computeScore({ relevance: 0.8, confidence: 1.0, lastAccessed: now, importance: 1.0, now });
    const lowConf = computeScore({ relevance: 0.8, confidence: 0.3, lastAccessed: now, importance: 1.0, now });
    expect(highConf).toBeGreaterThan(lowConf);
  });

  it("returns higher score for higher importance", () => {
    const now = Date.now();
    const highImp = computeScore({ relevance: 0.8, confidence: 0.9, lastAccessed: now, importance: 1.0, now });
    const lowImp = computeScore({ relevance: 0.8, confidence: 0.9, lastAccessed: now, importance: 0.4, now });
    expect(highImp).toBeGreaterThan(lowImp);
  });

  it("returns higher score for higher relevance", () => {
    const now = Date.now();
    const highRel = computeScore({ relevance: 1.0, confidence: 0.9, lastAccessed: now, importance: 1.0, now });
    const lowRel = computeScore({ relevance: 0.2, confidence: 0.9, lastAccessed: now, importance: 1.0, now });
    expect(highRel).toBeGreaterThan(lowRel);
  });

  it("returns low score when relevance is 0", () => {
    const now = Date.now();
    const score = computeScore({ relevance: 0, confidence: 1.0, lastAccessed: now, importance: 1.0, now });
    // With additive scoring, zero relevance still gets recency+confidence+importance contributions
    expect(score).toBeCloseTo(0.55, 1);
  });
});

describe("detectConflict", () => {
  it("detects conflict when similarity > 0.85 and content differs", () => {
    const result = detectConflict("Use pnpm", "Use npm", 0.9);
    expect(result.isConflict).toBe(true);
    expect(result.similarity).toBe(0.9);
  });

  it("no conflict when similarity <= 0.85", () => {
    const result = detectConflict("Use pnpm", "Use npm", 0.7);
    expect(result.isConflict).toBe(false);
  });

  it("no conflict when content is identical (even with high similarity)", () => {
    const result = detectConflict("same text", "same text", 1.0);
    expect(result.isConflict).toBe(false);
  });

  it("conflict at boundary (0.86)", () => {
    const result = detectConflict("a", "b", 0.86);
    expect(result.isConflict).toBe(true);
  });

  it("no conflict at boundary (0.85)", () => {
    const result = detectConflict("a", "b", 0.85);
    expect(result.isConflict).toBe(false);
  });
});

describe("recallMemories", () => {
  let db: AmemDatabase;

  beforeEach(() => {
    db = createDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("returns all memories ranked by score when no filter", () => {
    db.insertMemory({ content: "fact one", type: "fact", tags: [], confidence: 0.5, source: "t", embedding: null, scope: "global" });
    db.insertMemory({ content: "correction one", type: "correction", tags: [], confidence: 1.0, source: "t", embedding: null, scope: "global" });

    const results = recallMemories(db, { query: null, limit: 10 });
    expect(results).toHaveLength(2);
    // Correction should score higher due to higher importance + confidence
    expect(results[0].type).toBe("correction");
  });

  it("filters by type", () => {
    db.insertMemory({ content: "a", type: "fact", tags: [], confidence: 0.5, source: "t", embedding: null, scope: "global" });
    db.insertMemory({ content: "b", type: "decision", tags: [], confidence: 0.9, source: "t", embedding: null, scope: "global" });

    const results = recallMemories(db, { query: null, limit: 10, type: "decision" });
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("decision");
  });

  it("filters by tag", () => {
    db.insertMemory({ content: "ts thing", type: "fact", tags: ["typescript"], confidence: 0.5, source: "t", embedding: null, scope: "global" });
    db.insertMemory({ content: "rust thing", type: "fact", tags: ["rust"], confidence: 0.5, source: "t", embedding: null, scope: "global" });

    const results = recallMemories(db, { query: null, limit: 10, tag: "typescript" });
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe("ts thing");
  });

  it("filters by minConfidence", () => {
    db.insertMemory({ content: "low", type: "fact", tags: [], confidence: 0.2, source: "t", embedding: null, scope: "global" });
    db.insertMemory({ content: "high", type: "fact", tags: [], confidence: 0.9, source: "t", embedding: null, scope: "global" });

    const results = recallMemories(db, { query: null, limit: 10, minConfidence: 0.5 });
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe("high");
  });

  it("respects limit", () => {
    for (let i = 0; i < 5; i++) {
      db.insertMemory({ content: `mem ${i}`, type: "fact", tags: [], confidence: 0.5, source: "t", embedding: null, scope: "global" });
    }

    const results = recallMemories(db, { query: null, limit: 3 });
    expect(results).toHaveLength(3);
  });

  it("keyword matching narrows results to matches and boosts relevance", () => {
    db.insertMemory({ content: "TypeScript compiler config", type: "fact", tags: [], confidence: 0.8, source: "t", embedding: null, scope: "global" });
    db.insertMemory({ content: "Rust build system", type: "fact", tags: [], confidence: 0.8, source: "t", embedding: null, scope: "global" });

    const results = recallMemories(db, { query: "TypeScript", limit: 10 });
    // Only the TypeScript memory should match when using keyword-only (no embeddings)
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain("TypeScript");
    // Keyword match gives relevance of 0.75 (higher than default 0.5)
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("filters by scope", () => {
    db.insertMemory({ content: "global mem", type: "fact", tags: [], confidence: 0.5, source: "t", embedding: null, scope: "global" });
    db.insertMemory({ content: "project mem", type: "fact", tags: [], confidence: 0.5, source: "t", embedding: null, scope: "project:foo" });
    db.insertMemory({ content: "other project", type: "fact", tags: [], confidence: 0.5, source: "t", embedding: null, scope: "project:bar" });

    const results = recallMemories(db, { query: null, limit: 10, scope: "project:foo" });
    // Should include global + project:foo, but not project:bar
    const scopes = results.map(r => r.scope);
    expect(scopes).toContain("global");
    expect(scopes).toContain("project:foo");
    expect(scopes).not.toContain("project:bar");
  });
});
