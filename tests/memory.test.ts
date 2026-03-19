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
