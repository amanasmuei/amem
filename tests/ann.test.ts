import { describe, it, expect } from "vitest";
import { VectorIndex } from "../src/ann.js";

function randomVec(dims: number): Float32Array {
  const v = new Float32Array(dims);
  for (let i = 0; i < dims; i++) v[i] = Math.random() - 0.5;
  return v;
}

function normalize(v: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

describe("VectorIndex", () => {
  it("returns nearest neighbors correctly", () => {
    const index = new VectorIndex(3);
    const query = new Float32Array([1, 0, 0]);
    index.add("a", new Float32Array([1, 0, 0]));      // identical to query
    index.add("b", new Float32Array([0.9, 0.1, 0]));  // very close
    index.add("c", new Float32Array([0, 1, 0]));       // orthogonal
    index.add("d", new Float32Array([-1, 0, 0]));      // opposite

    const results = index.search(query, 2);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("a");
    expect(results[0].similarity).toBeCloseTo(1.0, 3);
    expect(results[1].id).toBe("b");
    expect(results[1].similarity).toBeGreaterThan(0.9);
  });

  it("handles empty index", () => {
    const index = new VectorIndex(3);
    const results = index.search(new Float32Array([1, 0, 0]), 5);
    expect(results).toHaveLength(0);
  });

  it("remove works", () => {
    const index = new VectorIndex(3);
    index.add("a", new Float32Array([1, 0, 0]));
    index.add("b", new Float32Array([0, 1, 0]));
    expect(index.size()).toBe(2);
    expect(index.has("a")).toBe(true);

    index.remove("a");
    expect(index.size()).toBe(1);
    expect(index.has("a")).toBe(false);

    const results = index.search(new Float32Array([1, 0, 0]), 5);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("b");
  });

  it("size() is accurate", () => {
    const index = new VectorIndex(3);
    expect(index.size()).toBe(0);
    index.add("a", new Float32Array([1, 0, 0]));
    expect(index.size()).toBe(1);
    index.add("b", new Float32Array([0, 1, 0]));
    expect(index.size()).toBe(2);
    // Adding same id replaces, doesn't increase size
    index.add("a", new Float32Array([0, 0, 1]));
    expect(index.size()).toBe(2);
  });

  it("respects minSimilarity filter", () => {
    const index = new VectorIndex(3);
    index.add("close", new Float32Array([1, 0, 0]));
    index.add("far", new Float32Array([0, 1, 0]));
    index.add("opposite", new Float32Array([-1, 0, 0]));

    const results = index.search(new Float32Array([1, 0, 0]), 10, 0.5);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("close");
  });

  it("buildFrom clears and bulk loads", () => {
    const index = new VectorIndex(3);
    index.add("old", new Float32Array([1, 0, 0]));
    expect(index.size()).toBe(1);

    index.buildFrom([
      { id: "x", embedding: new Float32Array([1, 0, 0]) },
      { id: "y", embedding: new Float32Array([0, 1, 0]) },
      { id: "z", embedding: new Float32Array([0, 0, 1]) },
    ]);
    expect(index.size()).toBe(3);
    expect(index.has("old")).toBe(false);
    expect(index.has("x")).toBe(true);
  });

  it("scales to 5000 entries with sub-50ms search", () => {
    const dims = 384;
    const index = new VectorIndex(dims);

    const entries: Array<{ id: string; embedding: Float32Array }> = [];
    for (let i = 0; i < 5000; i++) {
      entries.push({ id: `mem-${i}`, embedding: normalize(randomVec(dims)) });
    }
    index.buildFrom(entries);
    expect(index.size()).toBe(5000);

    const query = normalize(randomVec(dims));
    const start = performance.now();
    const results = index.search(query, 10, 0.0);
    const elapsed = performance.now() - start;

    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(10);
    expect(elapsed).toBeLessThan(50);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity);
    }
  });

  it("works with higher dimensional vectors", () => {
    const dims = 384;
    const index = new VectorIndex(dims);

    // Create a known vector and a slightly perturbed version
    const base = normalize(randomVec(dims));
    const similar = new Float32Array(dims);
    for (let i = 0; i < dims; i++) similar[i] = base[i] + (Math.random() - 0.5) * 0.05;

    index.add("base", base);
    index.add("similar", normalize(similar));
    // Add some random vectors
    for (let i = 0; i < 100; i++) {
      index.add(`rand-${i}`, normalize(randomVec(dims)));
    }

    const results = index.search(base, 2);
    expect(results[0].id).toBe("base");
    expect(results[0].similarity).toBeCloseTo(1.0, 3);
    // The similar vector should be second (or at least in top results)
    expect(results[1].similarity).toBeGreaterThan(0.8);
  });
});
