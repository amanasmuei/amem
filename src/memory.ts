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

export interface ConsolidationOptions {
  maxStaleDays: number;
  minConfidence: number;
  minAccessCount: number;
  dryRun: boolean;
}

export interface ConsolidationAction {
  action: "merged" | "pruned" | "promoted";
  memoryIds: string[];
  description: string;
}

export interface ConsolidationReport {
  merged: number;
  pruned: number;
  promoted: number;
  actions: ConsolidationAction[];
  healthScore: number;
  before: { total: number };
  after: { total: number };
}

export function consolidateMemories(
  db: AmemDatabase,
  cosineSim: (a: Float32Array, b: Float32Array) => number,
  options: ConsolidationOptions,
): ConsolidationReport {
  const now = Date.now();
  const msPerDay = 1000 * 60 * 60 * 24;
  const allMemories = db.getAllWithEmbeddings();
  const all = db.getAll();
  const beforeTotal = all.length;

  const actions: ConsolidationAction[] = [];
  const toDelete = new Set<string>();
  let promoted = 0;

  // 1. MERGE: find near-duplicate pairs (>0.85 similarity)
  // Batch by type to reduce O(n²) — only compare within same type, skip corrections
  const byType = new Map<string, typeof allMemories>();
  for (const mem of allMemories) {
    if (!mem.embedding) continue;
    if (mem.type === "correction") continue;
    const group = byType.get(mem.type) ?? [];
    group.push(mem);
    byType.set(mem.type, group);
  }

  for (const [, group] of byType) {
    for (let i = 0; i < group.length; i++) {
      if (toDelete.has(group[i].id)) continue;

      for (let j = i + 1; j < group.length; j++) {
        if (toDelete.has(group[j].id)) continue;

        const sim = cosineSim(group[i].embedding!, group[j].embedding!);
        if (sim > 0.85) {
          const [keep, discard] = group[i].confidence >= group[j].confidence
            ? [group[i], group[j]]
            : [group[j], group[i]];

          toDelete.add(discard.id);
          actions.push({
            action: "merged",
            memoryIds: [keep.id, discard.id],
            description: `Merged "${discard.content}" into "${keep.content}" (${(sim * 100).toFixed(0)}% similar)`,
          });
        }
      }
    }
  }

  // 2. PRUNE: stale, low-confidence, rarely-accessed (NEVER corrections)
  for (const mem of all) {
    if (toDelete.has(mem.id)) continue;
    if (mem.type === "correction") continue;

    const daysSinceAccess = (now - mem.lastAccessed) / msPerDay;
    if (
      daysSinceAccess > options.maxStaleDays &&
      mem.confidence < options.minConfidence &&
      mem.accessCount < options.minAccessCount
    ) {
      toDelete.add(mem.id);
      actions.push({
        action: "pruned",
        memoryIds: [mem.id],
        description: `Pruned "${mem.content}" (${daysSinceAccess.toFixed(0)}d stale, ${(mem.confidence * 100).toFixed(0)}% confidence, ${mem.accessCount} accesses)`,
      });
    }
  }

  // 3. PROMOTE: frequently-accessed memories with low confidence
  const toPromote: { id: string; mem: Memory }[] = [];
  for (const mem of all) {
    if (toDelete.has(mem.id)) continue;
    if (mem.accessCount >= 5 && mem.confidence < 0.8) {
      toPromote.push({ id: mem.id, mem });
      promoted++;
      actions.push({
        action: "promoted",
        memoryIds: [mem.id],
        description: `Promoted "${mem.content}" to 90% confidence (accessed ${mem.accessCount} times)`,
      });
    }
  }

  // Apply all mutations inside a single transaction for atomicity
  if (!options.dryRun) {
    db.transaction(() => {
      for (const action of actions) {
        if (action.action === "merged") {
          const keepId = action.memoryIds[0];
          const discardId = action.memoryIds[1];
          const keep = allMemories.find(m => m.id === keepId) ?? all.find(m => m.id === keepId);
          if (keep) {
            db.updateConfidence(keepId, Math.min(1.0, keep.confidence + 0.1));
          }
          db.deleteMemory(discardId);
        } else if (action.action === "pruned") {
          db.deleteMemory(action.memoryIds[0]);
        }
      }
      for (const { id } of toPromote) {
        db.updateConfidence(id, 0.9);
      }
    });
  }

  const afterTotal = beforeTotal - toDelete.size;
  const signalCount = all.filter(m => !toDelete.has(m.id) && (m.confidence >= 0.8 || m.type === "correction")).length;
  const healthScore = afterTotal === 0 ? 100 : Math.round((signalCount / afterTotal) * 100);

  return {
    merged: actions.filter(a => a.action === "merged").length,
    pruned: actions.filter(a => a.action === "pruned").length,
    promoted,
    actions,
    healthScore,
    before: { total: beforeTotal },
    after: { total: afterTotal },
  };
}
