import { createRequire } from "node:module";
import { cosineSimilarity } from "./embeddings.js";

export interface VectorSearchResult {
  id: string;
  similarity: number;
}

// Attempt to load hnswlib-node using createRequire (ESM-safe)
let HierarchicalNSW: any = null;
try {
  const require = createRequire(import.meta.url);
  const hnswlib = require("hnswlib-node");
  HierarchicalNSW = hnswlib.HierarchicalNSW;
} catch {
  // hnswlib-node not available, will fall back to brute-force
}

export class VectorIndex {
  private dims: number;

  // HNSW state
  private hnsw: any = null;
  private labelToId: Map<number, string> = new Map();
  private idToLabel: Map<string, number> = new Map();
  private nextLabel = 0;
  private deletedLabels: Set<number> = new Set();
  private capacity = 0;

  // Brute-force fallback state
  private entries: Map<string, Float32Array> = new Map();

  constructor(dimensions: number) {
    this.dims = dimensions;
    if (HierarchicalNSW) {
      this._initHnsw(200);
    }
  }

  private _initHnsw(initialCapacity: number): void {
    const index = new HierarchicalNSW("cosine", this.dims);
    index.initIndex(initialCapacity, 16, 200, 100);
    this.hnsw = index;
    this.capacity = initialCapacity;
  }

  private _ensureCapacity(needed: number): void {
    if (needed > this.capacity) {
      const newCapacity = Math.max(needed, this.capacity * 2);
      this.hnsw.resizeIndex(newCapacity);
      this.capacity = newCapacity;
    }
  }

  add(id: string, embedding: Float32Array): void {
    if (this.hnsw) {
      // If id already exists, mark old label deleted and reuse a new one
      if (this.idToLabel.has(id)) {
        const oldLabel = this.idToLabel.get(id)!;
        try {
          this.hnsw.markDelete(oldLabel);
        } catch {
          // ignore if already deleted
        }
        this.deletedLabels.add(oldLabel);
        this.labelToId.delete(oldLabel);
      }
      const label = this.nextLabel++;
      this._ensureCapacity(label + 1);
      this.hnsw.addPoint(Array.from(embedding), label);
      this.labelToId.set(label, id);
      this.idToLabel.set(id, label);
    } else {
      this.entries.set(id, embedding);
    }
  }

  remove(id: string): void {
    if (this.hnsw) {
      if (!this.idToLabel.has(id)) return;
      const label = this.idToLabel.get(id)!;
      try {
        this.hnsw.markDelete(label);
      } catch {
        // ignore
      }
      this.deletedLabels.add(label);
      this.labelToId.delete(label);
      this.idToLabel.delete(id);
    } else {
      this.entries.delete(id);
    }
  }

  has(id: string): boolean {
    if (this.hnsw) {
      return this.idToLabel.has(id);
    }
    return this.entries.has(id);
  }

  size(): number {
    if (this.hnsw) {
      return this.idToLabel.size;
    }
    return this.entries.size;
  }

  search(query: Float32Array, k: number, minSimilarity = 0.0): VectorSearchResult[] {
    if (this.hnsw) {
      const liveCount = this.idToLabel.size;
      if (liveCount === 0) return [];
      // Over-request to compensate for tombstoned entries that HNSW may return
      const totalLabels = this.nextLabel;
      const actualK = Math.min(Math.max(k * 2, k + 10), totalLabels);
      const { neighbors, distances } = this.hnsw.searchKnn(Array.from(query), actualK);
      const results: VectorSearchResult[] = [];
      for (let i = 0; i < neighbors.length; i++) {
        const label = neighbors[i];
        const id = this.labelToId.get(label);
        if (id === undefined) continue; // deleted tombstone
        const similarity = 1 - distances[i];
        if (similarity >= minSimilarity) {
          results.push({ id, similarity });
        }
      }
      results.sort((a, b) => b.similarity - a.similarity);
      return results.slice(0, k);
    }

    // Brute-force fallback
    const results: VectorSearchResult[] = [];
    for (const [id, embedding] of this.entries) {
      const similarity = cosineSimilarity(query, embedding);
      if (similarity >= minSimilarity) {
        results.push({ id, similarity });
      }
    }
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, k);
  }

  buildFrom(entries: Array<{ id: string; embedding: Float32Array }>): void {
    if (this.hnsw) {
      // Re-init to clear tombstones and reset state
      this._initHnsw(Math.max(entries.length, 200));
      this.labelToId.clear();
      this.idToLabel.clear();
      this.nextLabel = 0;
      this.deletedLabels.clear();

      for (const entry of entries) {
        const label = this.nextLabel++;
        this.hnsw.addPoint(Array.from(entry.embedding), label);
        this.labelToId.set(label, entry.id);
        this.idToLabel.set(entry.id, label);
      }
    } else {
      this.entries.clear();
      for (const entry of entries) {
        this.entries.set(entry.id, entry.embedding);
      }
    }
  }
}
