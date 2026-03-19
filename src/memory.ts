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
