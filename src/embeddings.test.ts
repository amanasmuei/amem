import { describe, it, expect } from "vitest";
import { cosineSimilarity, findTopK } from "./embeddings.js";

describe("cosineSimilarity", () => {
  it("returns 1.0 for identical normalized vectors", () => {
    const v = new Float32Array([1 / Math.sqrt(2), 1 / Math.sqrt(2)]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it("returns -1 for opposite vectors", () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([-1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  it("returns 0 when a is a zero vector", () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it("returns 0 when b is a zero vector", () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([0, 0, 0]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it("returns 0 when both are zero vectors", () => {
    const a = new Float32Array([0, 0]);
    const b = new Float32Array([0, 0]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it("computes correct similarity for known vectors", () => {
    // [1, 2, 3] and [4, 5, 6]
    // dot = 4+10+18 = 32, normA = sqrt(14), normB = sqrt(77)
    // similarity = 32 / (sqrt(14) * sqrt(77)) = 32 / sqrt(1078)
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([4, 5, 6]);
    const expected = 32 / (Math.sqrt(14) * Math.sqrt(77));
    expect(cosineSimilarity(a, b)).toBeCloseTo(expected, 5);
  });

  it("is symmetric: sim(a,b) === sim(b,a)", () => {
    const a = new Float32Array([0.3, 0.7, 0.1]);
    const b = new Float32Array([0.5, 0.2, 0.9]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });

  it("handles single-element vectors", () => {
    const a = new Float32Array([3]);
    const b = new Float32Array([5]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });

  it("handles negative values correctly", () => {
    const a = new Float32Array([-1, -2]);
    const b = new Float32Array([-1, -2]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });
});

describe("findTopK", () => {
  it("returns top K most similar candidates", () => {
    const query = new Float32Array([1, 0, 0]);
    const candidates = [
      { id: "a", embedding: new Float32Array([1, 0, 0]), data: "exact" },
      { id: "b", embedding: new Float32Array([0, 1, 0]), data: "orthogonal" },
      { id: "c", embedding: new Float32Array([0.9, 0.1, 0]), data: "close" },
    ];

    const results = findTopK(query, candidates, 2);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("a"); // exact match
    expect(results[1].id).toBe("c"); // close match
    expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
  });

  it("returns all candidates when k > candidates.length", () => {
    const query = new Float32Array([1, 0]);
    const candidates = [
      { id: "a", embedding: new Float32Array([1, 0]), data: "x" },
    ];

    const results = findTopK(query, candidates, 5);
    expect(results).toHaveLength(1);
  });

  it("returns empty array for empty candidates", () => {
    const query = new Float32Array([1, 0]);
    const results = findTopK(query, [], 5);
    expect(results).toHaveLength(0);
  });

  it("preserves data field in results", () => {
    const query = new Float32Array([1, 0]);
    const candidates = [
      { id: "a", embedding: new Float32Array([1, 0]), data: { foo: "bar" } },
    ];

    const results = findTopK(query, candidates, 1);
    expect(results[0].data).toEqual({ foo: "bar" });
  });

  it("sorts results by descending similarity", () => {
    const query = new Float32Array([1, 0, 0]);
    const candidates = [
      { id: "low", embedding: new Float32Array([0, 0, 1]), data: 1 },
      { id: "high", embedding: new Float32Array([1, 0, 0]), data: 2 },
      { id: "mid", embedding: new Float32Array([0.7, 0.7, 0]), data: 3 },
    ];

    const results = findTopK(query, candidates, 3);
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].similarity).toBeGreaterThanOrEqual(results[i + 1].similarity);
    }
  });
});
