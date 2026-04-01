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
  validFrom: number;
  validUntil: number | null;
  tier: 'core' | 'working' | 'archival';
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
  explain?: boolean;
  /** Filter out expired memories (valid_until < now). Default: true */
  filterExpired?: boolean;
  /** Only return memories from this tier */
  tier?: Memory["tier"];
}

export interface RecalledMemory extends Memory {
  score: number;
}

export interface ScoreExplanation {
  relevance: number;
  relevanceSource: "semantic" | "keyword" | "default";
  recency: number;
  hoursSinceAccess: number;
  confidence: number;
  importance: number;
  importanceLabel: string;
  finalScore: number;
}

export interface ExplainedMemory extends RecalledMemory {
  explanation: ScoreExplanation;
}

export function recallMemories(
  db: AmemDatabase,
  options: RecallOptions,
): (RecalledMemory | ExplainedMemory)[] {
  const { query, queryEmbedding, limit, type, tag, minConfidence, scope, explain, filterExpired = true, tier } = options;
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

  // Filter out expired memories (temporal validity)
  if (filterExpired) {
    candidates = candidates.filter(m => m.validUntil === null || m.validUntil > now);
  }

  // Filter by tier
  if (tier) {
    candidates = candidates.filter(m => m.tier === tier);
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

  const scored = candidates.map((memory) => {
    let relevance = 0.5;
    let relevanceSource: ScoreExplanation["relevanceSource"] = "default";
    if (queryEmbedding && memory.embedding) {
      relevance = Math.max(0, cosineSimilarity(queryEmbedding, memory.embedding));
      relevanceSource = "semantic";
    } else if (query && memory.content.toLowerCase().includes(query.toLowerCase())) {
      relevance = 0.75;
      relevanceSource = "keyword";
    }

    const importance = IMPORTANCE_WEIGHTS[memory.type] ?? 0.4;
    const hoursSinceAccess = (now - memory.lastAccessed) / (1000 * 60 * 60);
    const recency = Math.pow(0.995, Math.max(0, hoursSinceAccess));
    const score = relevance * recency * memory.confidence * importance;

    if (explain) {
      return {
        ...memory,
        score,
        explanation: {
          relevance,
          relevanceSource,
          recency: Number(recency.toFixed(4)),
          hoursSinceAccess: Number(hoursSinceAccess.toFixed(1)),
          confidence: memory.confidence,
          importance,
          importanceLabel: memory.type,
          finalScore: Number(score.toFixed(4)),
        },
      } as ExplainedMemory;
    }

    return { ...memory, score } as RecalledMemory;
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export interface ConsolidationOptions {
  maxStaleDays: number;
  minConfidence: number;
  minAccessCount: number;
  dryRun: boolean;
  enableDecay?: boolean;
  decayFactor?: number;
}

export interface ConsolidationAction {
  action: "merged" | "pruned" | "promoted" | "decayed";
  memoryIds: string[];
  description: string;
}

export interface ConsolidationReport {
  merged: number;
  pruned: number;
  promoted: number;
  decayed: number;
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
  // Batch by type to reduce O(n²) — only compare within same type, skip corrections.
  // Sort by recency and cap group size to keep O(n²) bounded.
  const MAX_MERGE_GROUP = 500;
  const byType = new Map<string, typeof allMemories>();
  for (const mem of allMemories) {
    if (!mem.embedding) continue;
    if (mem.type === "correction") continue;
    const group = byType.get(mem.type) ?? [];
    group.push(mem);
    byType.set(mem.type, group);
  }

  for (const [, group] of byType) {
    // Sort most recently accessed first — duplicates are most likely among recent memories
    group.sort((a, b) => b.lastAccessed - a.lastAccessed);
    const capped = group.slice(0, MAX_MERGE_GROUP);

    for (let i = 0; i < capped.length; i++) {
      if (toDelete.has(capped[i].id)) continue;

      for (let j = i + 1; j < capped.length; j++) {
        if (toDelete.has(capped[j].id)) continue;

        const sim = cosineSim(capped[i].embedding!, capped[j].embedding!);
        if (sim > 0.85) {
          const [keep, discard] = capped[i].confidence >= capped[j].confidence
            ? [capped[i], capped[j]]
            : [capped[j], capped[i]];

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
  const toPromote: { id: string }[] = [];
  for (const mem of all) {
    if (toDelete.has(mem.id)) continue;
    if (mem.accessCount >= 5 && mem.confidence < 0.8) {
      toPromote.push({ id: mem.id });
      promoted++;
      actions.push({
        action: "promoted",
        memoryIds: [mem.id],
        description: `Promoted "${mem.content}" to 90% confidence (accessed ${mem.accessCount} times)`,
      });
    }
  }

  // 4. DECAY: gradually reduce confidence of stale, non-correction memories
  let decayed = 0;
  const toDecay: { id: string; newConfidence: number }[] = [];
  if (options.enableDecay) {
    const factor = options.decayFactor ?? 0.95;
    for (const mem of all) {
      if (toDelete.has(mem.id)) continue;
      if (mem.type === "correction") continue;
      const daysSinceAccess = (now - mem.lastAccessed) / msPerDay;
      if (daysSinceAccess > 30 && mem.confidence > 0.3) {
        const newConf = Number((mem.confidence * factor).toFixed(3));
        if (newConf < mem.confidence) {
          toDecay.push({ id: mem.id, newConfidence: Math.max(0.1, newConf) });
          decayed++;
          actions.push({
            action: "decayed",
            memoryIds: [mem.id],
            description: `Decayed "${mem.content}" from ${(mem.confidence * 100).toFixed(0)}% to ${(newConf * 100).toFixed(0)}% confidence (${daysSinceAccess.toFixed(0)}d idle)`,
          });
        }
      }
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
      for (const d of toDecay) {
        db.updateConfidence(d.id, d.newConfidence);
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
    decayed,
    actions,
    healthScore,
    before: { total: beforeTotal },
    after: { total: afterTotal },
  };
}

// ── Multi-strategy retrieval pipeline ──────────────────

export interface MultiStrategyOptions {
  query: string;
  queryEmbedding: Float32Array | null;
  limit: number;
  scope?: string;
  weights?: {
    semantic: number;
    fts: number;
    graph: number;
    temporal: number;
  };
}

/**
 * Multi-strategy retrieval: combines semantic search, FTS5, knowledge graph traversal,
 * and temporal recency into a unified ranking. Each strategy votes independently,
 * then scores are merged with configurable weights.
 */
export function multiStrategyRecall(
  db: AmemDatabase,
  options: MultiStrategyOptions,
): RecalledMemory[] {
  const { query, queryEmbedding, limit, scope } = options;
  const weights = options.weights ?? { semantic: 0.4, fts: 0.3, graph: 0.15, temporal: 0.15 };
  const now = Date.now();

  const scoreMap = new Map<string, { memory: Memory; scores: { semantic: number; fts: number; graph: number; temporal: number } }>();

  const initEntry = (m: Memory) => {
    if (!scoreMap.has(m.id)) {
      scoreMap.set(m.id, { memory: m, scores: { semantic: 0, fts: 0, graph: 0, temporal: 0 } });
    }
    return scoreMap.get(m.id)!;
  };

  // Strategy 1: Semantic search (embedding similarity)
  if (queryEmbedding) {
    const candidates = scope ? db.getAllForProject(scope) : db.getAll();
    const validCandidates = candidates.filter(m => m.validUntil === null || m.validUntil > now);
    for (const m of validCandidates) {
      if (!m.embedding) continue;
      const sim = Math.max(0, cosineSimilarity(queryEmbedding, m.embedding));
      if (sim > 0.2) {
        const entry = initEntry(m);
        entry.scores.semantic = sim;
      }
    }
  }

  // Strategy 2: Full-text search (FTS5 exact matching)
  try {
    const ftsResults = db.fullTextSearch(query, limit * 2, scope);
    const validFts = ftsResults.filter(m => m.validUntil === null || m.validUntil > now);
    for (let i = 0; i < validFts.length; i++) {
      const m = validFts[i];
      const entry = initEntry(m);
      // FTS rank: highest rank for first result, decaying
      entry.scores.fts = Math.max(entry.scores.fts, 1.0 - (i / validFts.length) * 0.5);
    }
  } catch {
    // FTS may fail — skip this strategy
  }

  // Strategy 3: Knowledge graph traversal
  // Find memories that are related to high-scoring candidates
  const topSemanticIds = [...scoreMap.entries()]
    .sort((a, b) => b[1].scores.semantic - a[1].scores.semantic)
    .slice(0, 10)
    .map(([id]) => id);

  for (const id of topSemanticIds) {
    const related = db.getRelatedMemories(id);
    for (const m of related) {
      if (m.validUntil !== null && m.validUntil <= now) continue;
      const entry = initEntry(m);
      const parentScore = scoreMap.get(id)?.scores.semantic ?? 0;
      // Graph neighbors get a fraction of the parent's score
      entry.scores.graph = Math.max(entry.scores.graph, parentScore * 0.6);
    }
  }

  // Strategy 4: Temporal boost (recently accessed/created memories score higher)
  for (const [, entry] of scoreMap) {
    const hoursSinceAccess = (now - entry.memory.lastAccessed) / (1000 * 60 * 60);
    entry.scores.temporal = Math.pow(0.995, Math.max(0, hoursSinceAccess));
  }

  // Merge scores with weights
  const results: RecalledMemory[] = [];
  for (const [, entry] of scoreMap) {
    const { semantic, fts, graph, temporal } = entry.scores;
    const importance = IMPORTANCE_WEIGHTS[entry.memory.type] ?? 0.4;
    const combined = (
      semantic * weights.semantic +
      fts * weights.fts +
      graph * weights.graph +
      temporal * weights.temporal
    ) * entry.memory.confidence * importance;

    results.push({ ...entry.memory, score: combined });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

// ── Auto-expire contradictions ─────────────────────────

/**
 * When storing a new memory that contradicts an existing one,
 * auto-expire the old memory instead of requiring manual consolidation.
 */
export function autoExpireContradictions(
  db: AmemDatabase,
  newContent: string,
  newEmbedding: Float32Array | null,
  newType: MemoryTypeValue,
): { expired: string[]; reason: string } {
  if (!newEmbedding) return { expired: [], reason: "no embedding" };

  const existing = db.getRecentWithEmbeddings(50000);
  const expired: string[] = [];

  for (const mem of existing) {
    if (!mem.embedding) continue;
    if (mem.type !== newType) continue; // Only expire same-type memories
    if (mem.validUntil !== null) continue; // Already expired

    const sim = cosineSimilarity(newEmbedding, mem.embedding);
    if (sim > 0.75 && sim < 0.95) {
      // High similarity but not exact match = likely contradicting/superseding
      const conflict = detectConflict(newContent, mem.content, sim);
      if (conflict.isConflict) {
        db.expireMemory(mem.id);
        expired.push(mem.id);
      }
    }
  }

  return { expired, reason: expired.length > 0 ? `auto-expired ${expired.length} contradicting memories` : "no contradictions" };
}

// ── Privacy helper (re-exported for tools) ─────────────

export { sanitizeContent } from "./config.js";
