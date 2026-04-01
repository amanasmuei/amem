import type { AmemDatabase } from "./database.js";
import { cosineSimilarity } from "./embeddings.js";

export interface AutoRelateOptions {
  minSimilarity?: number;  // default 0.6
  maxRelations?: number;   // default 3
  maxCandidates?: number;  // default 200
}

export interface AutoRelateResult {
  created: number;
  relations: Array<{ toId: string; similarity: number }>;
}

export function autoRelateMemory(
  db: AmemDatabase,
  newMemoryId: string,
  options?: AutoRelateOptions,
): AutoRelateResult {
  const minSimilarity = options?.minSimilarity ?? 0.6;
  const maxRelations = options?.maxRelations ?? 3;
  const maxCandidates = options?.maxCandidates ?? 200;

  const empty: AutoRelateResult = { created: 0, relations: [] };

  // 1. Get the new memory, return early if no embedding
  const newMemory = db.getById(newMemoryId);
  if (!newMemory?.embedding) return empty;

  // 2. Get recent memories with embeddings (up to maxCandidates)
  const candidates = db.getRecentWithEmbeddings(maxCandidates);

  // 3. Score each by cosine similarity, filter >= minSimilarity and < 0.95 (skip near-dupes)
  const scored: Array<{ id: string; similarity: number }> = [];
  for (const mem of candidates) {
    if (mem.id === newMemoryId) continue;
    if (!mem.embedding) continue;
    const sim = cosineSimilarity(newMemory.embedding, mem.embedding);
    if (sim >= minSimilarity && sim < 0.95) {
      scored.push({ id: mem.id, similarity: sim });
    }
  }

  // 4. Sort descending, take top maxRelations
  scored.sort((a, b) => b.similarity - a.similarity);
  const top = scored.slice(0, maxRelations);

  // 5. Check existing relations to avoid duplicates, then create edges
  const existingRelations = db.getRelations(newMemoryId);
  const existingTargets = new Set(
    existingRelations.map((r) => (r.fromId === newMemoryId ? r.toId : r.fromId)),
  );

  const created: Array<{ toId: string; similarity: number }> = [];
  for (const candidate of top) {
    if (existingTargets.has(candidate.id)) continue;
    // 6. Create "related_to" edges with similarity as strength
    try {
      db.addRelation(newMemoryId, candidate.id, "related_to", candidate.similarity);
      created.push({ toId: candidate.id, similarity: candidate.similarity });
    } catch {
      // UNIQUE constraint may fire — safe to ignore
    }
  }

  // 7. Return count and details
  return { created: created.length, relations: created };
}
