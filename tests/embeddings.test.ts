import { describe, it, expect } from "vitest";
import { cosineSimilarity, findTopK } from "@aman_asmuei/amem-core";

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
