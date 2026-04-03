/**
 * Self-Evolving Memory Loop — Reflection Engine
 *
 * Three layers:
 *   Layer 1 — Mechanical: clustering, contradiction detection, gap analysis
 *   Layer 2 — LLM-powered: synthesis candidates (prompts for the AI to complete)
 *   Layer 3 — Adaptive: health scoring, evolution metrics
 *
 * Uses synthesis_lineage to prevent re-synthesizing clusters.
 * Uses knowledge_gaps to surface what the system doesn't know.
 * Records reflection metadata for auto-trigger timing.
 */

import type { AmemDatabase, KnowledgeGap } from "./database.js";
import type { Memory, MemoryTypeValue } from "./memory.js";
import { getVectorIndex } from "./memory.js";
import { cosineSimilarity } from "./embeddings.js";

// ── Public types ───────────────────────────────────────

export interface ClusterMember {
  id: string;
  content: string;
  type: MemoryTypeValue;
  confidence: number;
  createdAt: number;
  tags: string[];
}

export interface MemoryCluster {
  id: string;
  members: ClusterMember[];
  dominantType: MemoryTypeValue;
  coherence: number;
  tags: string[];
  isSynthesisCandidate: boolean;
}

export interface ContradictionCandidate {
  memoryA: ClusterMember;
  memoryB: ClusterMember;
  similarity: number;
  reason: string;
  suggestedAction: string;
}

export interface SynthesisCandidate {
  clusterId: string;
  memories: ClusterMember[];
  dominantType: MemoryTypeValue;
  suggestedPrompt: string;
}

export interface ReflectionStats {
  totalMemories: number;
  clusteredMemories: number;
  totalClusters: number;
  avgClusterSize: number;
  contradictionsFound: number;
  synthesisCandidates: number;
  knowledgeGaps: number;
  healthScore: number;
}

export interface ReflectionReport {
  clusters: MemoryCluster[];
  contradictions: ContradictionCandidate[];
  synthesisCandidates: SynthesisCandidate[];
  knowledgeGaps: KnowledgeGap[];
  orphans: number;
  stats: ReflectionStats;
  timestamp: number;
  durationMs: number;
}

// ── Configuration ──────────────────────────────────────

export interface ReflectionConfig {
  /** Minimum cluster size to report. Default: 3 */
  minClusterSize: number;
  /** Number of HNSW neighbors to probe per memory. Default: 10 */
  neighborK: number;
  /** Minimum similarity to form a cluster edge. Default: 0.65 */
  similarityThreshold: number;
  /** Minimum similarity within a cluster to flag contradiction. Default: 0.7 */
  contradictionMinSimilarity: number;
  /** Max synthesis candidates to return. Default: 5 */
  maxSynthesisCandidates: number;
  /** Max memories to process (0 = unlimited). Default: 0 */
  maxMemories: number;
}

const DEFAULT_CONFIG: ReflectionConfig = {
  minClusterSize: 3,
  neighborK: 10,
  similarityThreshold: 0.65,
  contradictionMinSimilarity: 0.7,
  maxSynthesisCandidates: 5,
  maxMemories: 0,
};

// ── Main entry point ───────────────────────────────────

export function reflect(
  db: AmemDatabase,
  config?: Partial<ReflectionConfig>,
): ReflectionReport {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const start = Date.now();

  // 1. Load all active memories with embeddings
  let active = db.getAllWithEmbeddings().filter(
    (m) => m.validUntil === null || m.validUntil > Date.now(),
  );
  if (cfg.maxMemories > 0) {
    active = active.slice(0, cfg.maxMemories);
  }

  const memoryMap = new Map(active.map((m) => [m.id, m]));

  // 2. Build adjacency graph using vector similarity
  const adjacency = buildAdjacencyGraph(active, memoryMap, cfg);

  // 3. Find connected components (clusters)
  const clusters = findClusters(adjacency, memoryMap, cfg);

  // 4. Detect contradictions within clusters (enhanced: negation + numerical + low-overlap)
  const contradictions = detectContradictions(clusters, memoryMap, cfg);

  // 5. Identify synthesis candidates (uses synthesis_lineage to skip already-synthesized)
  const synthesisCandidates = findSynthesisCandidates(clusters, db, cfg);

  // 6. Load knowledge gaps
  const knowledgeGaps = db.getActiveKnowledgeGaps(20);

  // 7. Compute stats
  const clusteredMemories = clusters.reduce(
    (sum, c) => sum + c.members.length,
    0,
  );

  // 8. Record reflection timestamp
  db.setReflectionMeta("last_reflection_at", String(Date.now()));
  db.setReflectionMeta("last_memory_count", String(active.length));

  return {
    clusters,
    contradictions,
    synthesisCandidates,
    knowledgeGaps,
    orphans: active.length - clusteredMemories,
    stats: {
      totalMemories: active.length,
      clusteredMemories,
      totalClusters: clusters.length,
      avgClusterSize:
        clusters.length > 0
          ? Math.round((clusteredMemories / clusters.length) * 10) / 10
          : 0,
      contradictionsFound: contradictions.length,
      synthesisCandidates: synthesisCandidates.length,
      knowledgeGaps: knowledgeGaps.length,
      healthScore: computeHealthScore(active, clusters, contradictions),
    },
    timestamp: Date.now(),
    durationMs: Date.now() - start,
  };
}

// ── Reflection-due check (for memory_inject nudge) ────

export function isReflectionDue(db: AmemDatabase): { due: boolean; reason: string } {
  const lastAt = db.getReflectionMeta("last_reflection_at");
  const lastCount = db.getReflectionMeta("last_memory_count");

  if (!lastAt) {
    return { due: true, reason: "Reflection has never been run" };
  }

  const daysSince = (Date.now() - Number(lastAt)) / 86_400_000;
  if (daysSince > 7) {
    return { due: true, reason: `Last reflection was ${Math.round(daysSince)}d ago` };
  }

  // Check if many new memories since last reflection
  if (lastCount) {
    const currentCount = db.getAll().length;
    const delta = currentCount - Number(lastCount);
    if (delta >= 50) {
      return { due: true, reason: `${delta} new memories since last reflection` };
    }
  }

  return { due: false, reason: "" };
}

// ── Layer 1: Adjacency graph ───────────────────────────

function buildAdjacencyGraph(
  memories: Memory[],
  memoryMap: Map<string, Memory>,
  cfg: ReflectionConfig,
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const m of memories) {
    adjacency.set(m.id, new Set());
  }

  const index = getVectorIndex();

  if (index && index.size() > 0) {
    // Fast path: O(n log n) via HNSW
    for (const m of memories) {
      if (!m.embedding) continue;
      const neighbors = index.search(
        m.embedding,
        cfg.neighborK,
        cfg.similarityThreshold,
      );
      for (const n of neighbors) {
        if (n.id === m.id) continue;
        if (!memoryMap.has(n.id)) continue;
        adjacency.get(m.id)!.add(n.id);
        adjacency.get(n.id)?.add(m.id);
      }
    }
  } else {
    // Fallback: O(n²) brute-force, capped at 500
    const capped = memories.filter((m) => m.embedding !== null).slice(0, 500);
    for (let i = 0; i < capped.length; i++) {
      for (let j = i + 1; j < capped.length; j++) {
        const sim = cosineSimilarity(
          capped[i].embedding!,
          capped[j].embedding!,
        );
        if (sim >= cfg.similarityThreshold) {
          adjacency.get(capped[i].id)!.add(capped[j].id);
          adjacency.get(capped[j].id)!.add(capped[i].id);
        }
      }
    }
  }

  return adjacency;
}

// ── Layer 1: Connected-component clustering ────────────

function findClusters(
  adjacency: Map<string, Set<string>>,
  memoryMap: Map<string, Memory>,
  cfg: ReflectionConfig,
): MemoryCluster[] {
  const visited = new Set<string>();
  const clusters: MemoryCluster[] = [];
  let clusterIdx = 0;

  for (const [nodeId] of adjacency) {
    if (visited.has(nodeId)) continue;

    const component: string[] = [];
    const queue = [nodeId];
    visited.add(nodeId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);

      const neighbors = adjacency.get(current);
      if (!neighbors) continue;
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }

    if (component.length < cfg.minClusterSize) continue;

    const members = toClusterMembers(component, memoryMap);
    const dominantType = findDominantType(members);
    const coherence = computeCoherence(component, memoryMap);
    const tags = extractCommonTags(members);

    clusters.push({
      id: `cluster-${clusterIdx++}`,
      members,
      dominantType,
      coherence,
      tags,
      isSynthesisCandidate: members.length >= cfg.minClusterSize,
    });
  }

  clusters.sort((a, b) => b.members.length - a.members.length);
  return clusters;
}

function toClusterMembers(
  ids: string[],
  memoryMap: Map<string, Memory>,
): ClusterMember[] {
  return ids
    .map((id) => memoryMap.get(id))
    .filter((m): m is Memory => m !== undefined)
    .map((m) => ({
      id: m.id,
      content: m.content,
      type: m.type,
      confidence: m.confidence,
      createdAt: m.createdAt,
      tags: m.tags,
    }));
}

function findDominantType(members: ClusterMember[]): MemoryTypeValue {
  const counts = new Map<MemoryTypeValue, number>();
  for (const m of members) {
    counts.set(m.type, (counts.get(m.type) ?? 0) + 1);
  }
  let best: MemoryTypeValue = "fact";
  let max = 0;
  for (const [type, count] of counts) {
    if (count > max) {
      best = type;
      max = count;
    }
  }
  return best;
}

function computeCoherence(
  memberIds: string[],
  memoryMap: Map<string, Memory>,
): number {
  const MAX_PAIRS = 20;
  const withEmb = memberIds
    .map((id) => memoryMap.get(id))
    .filter((m): m is Memory => m !== undefined && m.embedding !== null);

  if (withEmb.length < 2) return 0;

  let total = 0;
  let pairs = 0;
  for (let i = 0; i < withEmb.length && pairs < MAX_PAIRS; i++) {
    for (let j = i + 1; j < withEmb.length && pairs < MAX_PAIRS; j++) {
      total += cosineSimilarity(withEmb[i].embedding!, withEmb[j].embedding!);
      pairs++;
    }
  }
  return pairs > 0 ? Number((total / pairs).toFixed(4)) : 0;
}

function extractCommonTags(members: ClusterMember[]): string[] {
  const tagCounts = new Map<string, number>();
  for (const m of members) {
    for (const tag of m.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  return [...tagCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);
}

// ── Layer 1: Enhanced contradiction detection ──────────

const NEGATION_PAIRS: Array<[RegExp, RegExp]> = [
  [/\balways\b/i, /\bnever\b/i],
  [/\buse\b/i, /\bdon't use\b|\bavoid\b/i],
  [/\bprefer\b/i, /\bavoid\b|\bdon't\b/i],
  [/\benable\b/i, /\bdisable\b/i],
  [/\brequire\b/i, /\boptional\b/i],
  [/\binclude\b/i, /\bexclude\b/i],
  [/\ballow\b/i, /\bforbid\b|\bprohibit\b|\bblock\b/i],
];

/** Extract all numbers from content for numerical contradiction check. */
function extractNumbers(content: string): number[] {
  const matches = content.match(/\b\d+(?:\.\d+)?\b/g);
  return matches ? matches.map(Number) : [];
}

/** Tokenize content into lowercase words for overlap calculation. */
function tokenize(content: string): Set<string> {
  return new Set(
    content.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(w => w.length > 2),
  );
}

/** Jaccard similarity between two word sets. */
function wordOverlap(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function detectContradictions(
  clusters: MemoryCluster[],
  memoryMap: Map<string, Memory>,
  cfg: ReflectionConfig,
): ContradictionCandidate[] {
  const contradictions: ContradictionCandidate[] = [];
  const msPerDay = 86_400_000;
  const seen = new Set<string>(); // prevent duplicate pairs

  for (const cluster of clusters) {
    for (let i = 0; i < cluster.members.length; i++) {
      const a = cluster.members[i];
      const fullA = memoryMap.get(a.id);
      if (!fullA?.embedding) continue;

      for (let j = i + 1; j < cluster.members.length; j++) {
        const b = cluster.members[j];
        const fullB = memoryMap.get(b.id);
        if (!fullB?.embedding) continue;

        const pairKey = [a.id, b.id].sort().join(":");
        if (seen.has(pairKey)) continue;

        const sim = cosineSimilarity(fullA.embedding!, fullB.embedding!);
        if (sim < cfg.contradictionMinSimilarity) continue;

        const ageDays = Math.abs(a.createdAt - b.createdAt) / msPerDay;
        const [newer, older] = a.createdAt > b.createdAt ? [a, b] : [b, a];
        const contentA = a.content.toLowerCase();
        const contentB = b.content.toLowerCase();

        // Check 1: Negation-pair keywords
        let found = false;
        for (const [patA, patB] of NEGATION_PAIRS) {
          if (
            (patA.test(contentA) && patB.test(contentB)) ||
            (patB.test(contentA) && patA.test(contentB))
          ) {
            seen.add(pairKey);
            contradictions.push({
              memoryA: older,
              memoryB: newer,
              similarity: Number(sim.toFixed(4)),
              reason: `Opposing language detected (${ageDays.toFixed(0)}d apart, ${(sim * 100).toFixed(0)}% similar)`,
              suggestedAction: suggestAction(newer, older),
            });
            found = true;
            break;
          }
        }
        if (found) continue;

        // Check 2: Numerical contradiction — same topic, different numbers
        const numsA = extractNumbers(a.content);
        const numsB = extractNumbers(b.content);
        if (numsA.length > 0 && numsB.length > 0 && sim > 0.8) {
          // High semantic similarity + different numbers = likely contradiction
          const hasConflictingNumber = numsA.some(na =>
            numsB.some(nb => na !== nb && Math.abs(na - nb) / Math.max(na, nb) > 0.2),
          );
          if (hasConflictingNumber) {
            seen.add(pairKey);
            contradictions.push({
              memoryA: older,
              memoryB: newer,
              similarity: Number(sim.toFixed(4)),
              reason: `Numerical disagreement (${numsA.join(",")} vs ${numsB.join(",")}, ${(sim * 100).toFixed(0)}% similar)`,
              suggestedAction: suggestAction(newer, older),
            });
            continue;
          }
        }

        // Check 3: Low word overlap despite high semantic similarity
        // (Same topic, expressed differently = potential update/contradiction)
        if (sim > 0.85) {
          const wordsA = tokenize(a.content);
          const wordsB = tokenize(b.content);
          const overlap = wordOverlap(wordsA, wordsB);
          if (overlap < 0.3 && ageDays > 7) {
            seen.add(pairKey);
            contradictions.push({
              memoryA: older,
              memoryB: newer,
              similarity: Number(sim.toFixed(4)),
              reason: `Low word overlap (${(overlap * 100).toFixed(0)}%) despite ${(sim * 100).toFixed(0)}% semantic similarity — possible update (${ageDays.toFixed(0)}d apart)`,
              suggestedAction: `Review: these may express the same intent differently, or the newer one may supersede the older`,
            });
          }
        }
      }
    }
  }

  return contradictions;
}

function suggestAction(newer: ClusterMember, older: ClusterMember): string {
  return newer.confidence >= older.confidence
    ? `Expire older memory ${older.id.slice(0, 8)} — newer supersedes it`
    : `Review: newer has lower confidence (${(newer.confidence * 100).toFixed(0)}%) than older (${(older.confidence * 100).toFixed(0)}%)`;
}

// ── Layer 2: Synthesis candidates ──────────────────────

function findSynthesisCandidates(
  clusters: MemoryCluster[],
  db: AmemDatabase,
  cfg: ReflectionConfig,
): SynthesisCandidate[] {
  const candidates: SynthesisCandidate[] = [];

  for (const cluster of clusters) {
    if (cluster.members.length < cfg.minClusterSize) continue;

    // Skip if a member already looks like a synthesis (high-confidence non-correction)
    if (
      cluster.members.some(
        (m) => m.confidence > 0.95 && m.type !== "correction",
      )
    ) {
      continue;
    }

    // Skip if any member is already part of a synthesis (via lineage table)
    const memberIds = cluster.members.map((m) => m.id);
    if (db.hasAnySynthesis(memberIds)) {
      continue;
    }

    // Group members by type
    const byType = new Map<string, ClusterMember[]>();
    for (const m of cluster.members) {
      const group = byType.get(m.type) ?? [];
      group.push(m);
      byType.set(m.type, group);
    }

    const topicHint =
      cluster.tags.length > 0 ? cluster.tags.join(", ") : "a common theme";

    const lines = [
      `These ${cluster.members.length} related memories form a cluster about "${topicHint}":`,
      "",
    ];

    for (const [type, members] of byType) {
      lines.push(`[${type}s]:`);
      for (const m of members.slice(0, 8)) {
        lines.push(`  - "${m.content}"`);
      }
      if (members.length > 8) {
        lines.push(`  ... and ${members.length - 8} more`);
      }
      lines.push("");
    }

    lines.push(
      "Synthesize these into a single, higher-order principle or rule that captures what they collectively express.",
    );
    lines.push(
      "The synthesis should be actionable and concise (1-2 sentences).",
    );
    lines.push(
      'Store the result using memory_store with type based on the dominant pattern, and source "reflection-synthesis".',
    );
    lines.push(
      "Then use memory_relate to link the synthesis to each constituent memory with relationship_type \"synthesized_from\".",
    );

    candidates.push({
      clusterId: cluster.id,
      memories: cluster.members,
      dominantType: cluster.dominantType,
      suggestedPrompt: lines.join("\n"),
    });
  }

  return candidates.slice(0, cfg.maxSynthesisCandidates);
}

// ── Layer 3: Health scoring ────────────────────────────

function computeHealthScore(
  memories: Memory[],
  clusters: MemoryCluster[],
  contradictions: ContradictionCandidate[],
): number {
  if (memories.length === 0) return 100;

  const clustered = clusters.reduce(
    (sum, c) => sum + c.members.length,
    0,
  );
  const clusteredRatio = clustered / memories.length;
  const avgCoherence =
    clusters.length > 0
      ? clusters.reduce((s, c) => s + c.coherence, 0) / clusters.length
      : 0;
  const highConfRatio =
    memories.filter((m) => m.confidence >= 0.8).length / memories.length;
  const contradictionPenalty = Math.min(contradictions.length * 5, 30);

  const score = Math.round(
    clusteredRatio * 25 +
      avgCoherence * 25 +
      highConfRatio * 25 +
      (1 - contradictionPenalty / 100) * 25,
  );

  return Math.max(0, Math.min(100, score));
}
