import type { AmemDatabase } from "./database.js";
import { cosineSimilarity } from "./embeddings.js";

export const MemoryType = {
  CORRECTION: "correction",
  DECISION: "decision",
  PATTERN: "pattern",
  PREFERENCE: "preference",
  TOPOLOGY: "topology",
  FACT: "fact",
} as const;

export type MemoryTypeValue = (typeof MemoryType)[keyof typeof MemoryType];

export const IMPORTANCE_WEIGHTS: Record<MemoryTypeValue, number> = {
  correction: 1.0,
  decision: 0.85,
  pattern: 0.7,
  preference: 0.7,
  topology: 0.5,
  fact: 0.4,
};

export interface Memory {
  id: string;
  content: string;
  type: MemoryTypeValue;
  tags: string[];
  confidence: number;
  accessCount: number;
  createdAt: number;
  lastAccessed: number;
  source: string;
  embedding: Float32Array | null;
  scope: string;
}

export interface ScoreInput {
  relevance: number;
  confidence: number;
  lastAccessed: number;
  importance: number;
  now: number;
}

export function computeScore(input: ScoreInput): number {
  const hoursSinceAccess = (input.now - input.lastAccessed) / (1000 * 60 * 60);
  const recency = Math.pow(0.995, Math.max(0, hoursSinceAccess));
  return input.relevance * recency * input.confidence * input.importance;
}

export interface ConflictResult {
  isConflict: boolean;
  similarity: number;
}

export function detectConflict(
  newContent: string,
  existingContent: string,
  similarity: number,
): ConflictResult {
  if (newContent === existingContent) {
    return { isConflict: false, similarity };
  }
  return {
    isConflict: similarity > 0.85,
    similarity,
  };
}

export interface RecallOptions {
  query: string | null;
  queryEmbedding?: Float32Array | null;
  limit: number;
  type?: MemoryTypeValue;
  tag?: string;
  minConfidence?: number;
  scope?: string;
}

export interface RecalledMemory extends Memory {
  score: number;
}

export function recallMemories(
  db: AmemDatabase,
  options: RecallOptions,
): RecalledMemory[] {
  const { query, queryEmbedding, limit, type, tag, minConfidence, scope } = options;
  const now = Date.now();

  let candidates: Memory[];
  if (type) {
    candidates = db.searchByType(type);
    if (scope) {
      candidates = candidates.filter(m => m.scope === "global" || m.scope === scope);
    }
  } else if (tag) {
    candidates = db.searchByTag(tag);
    if (scope) {
      candidates = candidates.filter(m => m.scope === "global" || m.scope === scope);
    }
  } else if (scope) {
    candidates = db.getAllForProject(scope);
  } else {
    candidates = db.getAll();
  }

  if (minConfidence) {
    candidates = candidates.filter((m) => m.confidence >= minConfidence);
  }

  // When query exists but no embeddings, filter to keyword matches only
  if (query && !queryEmbedding) {
    const q = query.toLowerCase();
    const keywordMatches = candidates.filter(
      (m) => m.content.toLowerCase().includes(q) || m.tags.some((t) => t.toLowerCase().includes(q)),
    );
    if (keywordMatches.length > 0) {
      candidates = keywordMatches;
    }
    // If no keyword matches, keep all candidates (broad fallback)
  }

  const scored: RecalledMemory[] = candidates.map((memory) => {
    let relevance = 0.5;
    if (queryEmbedding && memory.embedding) {
      relevance = Math.max(0, cosineSimilarity(queryEmbedding, memory.embedding));
    } else if (query && memory.content.toLowerCase().includes(query.toLowerCase())) {
      relevance = 0.75;
    }

    const score = computeScore({
      relevance,
      confidence: memory.confidence,
      lastAccessed: memory.lastAccessed,
      importance: IMPORTANCE_WEIGHTS[memory.type] ?? 0.4,
      now,
    });

    return { ...memory, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
