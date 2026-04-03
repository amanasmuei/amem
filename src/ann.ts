import { cosineSimilarity } from "./embeddings.js";

export interface VectorSearchResult {
  id: string;
  similarity: number;
}

export class VectorIndex {
  private entries: Map<string, Float32Array> = new Map();
  private dims: number;

  constructor(dimensions: number) {
    this.dims = dimensions;
  }

  add(id: string, embedding: Float32Array): void {
    this.entries.set(id, embedding);
  }

  remove(id: string): void {
    this.entries.delete(id);
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  size(): number {
    return this.entries.size;
  }

  search(query: Float32Array, k: number, minSimilarity = 0.0): VectorSearchResult[] {
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
    this.entries.clear();
    for (const entry of entries) {
      this.entries.set(entry.id, entry.embedding);
    }
  }
}
