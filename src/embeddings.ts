export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

export interface EmbeddingCandidate<T> {
  id: string;
  embedding: Float32Array;
  data: T;
}

export interface SimilarityResult<T> {
  id: string;
  similarity: number;
  data: T;
}

export function findTopK<T>(
  query: Float32Array,
  candidates: EmbeddingCandidate<T>[],
  k: number,
): SimilarityResult<T>[] {
  const scored = candidates.map((c) => ({
    id: c.id,
    similarity: cosineSimilarity(query, c.embedding),
    data: c.data,
  }));
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, k);
}

// HuggingFace pipeline type is complex and varies by version — use structural type for the subset we need
interface FeatureExtractor {
  (text: string, options: { pooling: "mean"; normalize: boolean }): Promise<{ data: ArrayLike<number> }>;
}

let pipelineInstance: FeatureExtractor | null = null;
let pipelineLoading: Promise<FeatureExtractor | null> | null = null;

// LRU-style embedding cache to avoid recomputing identical queries
const EMBEDDING_CACHE_MAX = 128;
const embeddingCache = new Map<string, Float32Array>();

function cacheGet(key: string): Float32Array | undefined {
  const val = embeddingCache.get(key);
  if (val) {
    // Move to end (most recently used)
    embeddingCache.delete(key);
    embeddingCache.set(key, val);
  }
  return val;
}

function cachePut(key: string, val: Float32Array): void {
  if (embeddingCache.size >= EMBEDDING_CACHE_MAX) {
    // Evict oldest (first) entry
    const oldest = embeddingCache.keys().next().value;
    if (oldest !== undefined) embeddingCache.delete(oldest);
  }
  embeddingCache.set(key, val);
}

/** Whether the first embedding load has completed (success or failure). */
let pipelineReady = false;

/** Skip embedding loading entirely (useful for CLI commands that need fast exit). */
let embeddingDisabled = false;

export function disableEmbeddings(): void {
  embeddingDisabled = true;
}

async function getEmbeddingPipeline(): Promise<FeatureExtractor | null> {
  if (embeddingDisabled) return null;
  if (pipelineInstance) return pipelineInstance;
  if (pipelineLoading) return pipelineLoading;

  pipelineLoading = (async () => {
    try {
      // Race with a timeout to avoid hanging on slow model downloads
      const loadPromise = (async () => {
        const mod = await import("@huggingface/transformers");
        return await mod.pipeline(
          "feature-extraction",
          "Xenova/all-MiniLM-L6-v2",
        ) as unknown as FeatureExtractor;
      })();

      const LOAD_TIMEOUT_MS = 30000;
      const result = await Promise.race([
        loadPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), LOAD_TIMEOUT_MS)),
      ]);

      if (result) {
        pipelineInstance = result;
        pipelineReady = true;
        return pipelineInstance;
      }
      pipelineReady = true;
      console.error("[amem] Embedding model load timed out — using keyword matching");
      return null;
    } catch (error) {
      pipelineReady = true;
      console.error("[amem] Embeddings unavailable — using keyword matching (still works great!):", error instanceof Error ? error.message : String(error));
      console.error("[amem] To enable semantic search: npm install @huggingface/transformers");
      return null;
    }
  })();

  return pipelineLoading;
}

/**
 * Pre-warm the embedding pipeline in the background.
 * Call this at startup so the model is ready when the first query arrives.
 */
export function preloadEmbeddings(): void {
  // Fire-and-forget — don't block startup
  getEmbeddingPipeline().catch(() => {});
}

export async function generateEmbedding(
  text: string,
): Promise<Float32Array | null> {
  // Check cache first
  const cached = cacheGet(text);
  if (cached) return cached;

  const extractor = await getEmbeddingPipeline();
  if (!extractor) return null;

  const result = await extractor(text, { pooling: "mean", normalize: true });
  const embedding = new Float32Array(result.data);
  cachePut(text, embedding);
  return embedding;
}

export async function isEmbeddingAvailable(): Promise<boolean> {
  const extractor = await getEmbeddingPipeline();
  return extractor !== null;
}

// ── Cross-Encoder Reranker ──────────────────────────────

interface CrossEncoderScorer {
  (texts: Array<{ text: string; text_pair: string }>): Promise<Array<{ label: string; score: number }[]>>;
}

let rerankerInstance: CrossEncoderScorer | null = null;
let rerankerLoading: Promise<CrossEncoderScorer | null> | null = null;
let rerankerFailed = false;

async function getCrossEncoderPipeline(): Promise<CrossEncoderScorer | null> {
  if (rerankerInstance) return rerankerInstance;
  if (rerankerFailed) return null;
  if (rerankerLoading) return rerankerLoading;

  rerankerLoading = (async () => {
    try {
      const mod = await import("@huggingface/transformers");
      const classifier = await (mod.pipeline as Function)(
        "text-classification",
        "Xenova/ms-marco-MiniLM-L-6-v2",
      );

      rerankerInstance = async (texts) => {
        const results: Array<{ label: string; score: number }[]> = [];
        // Process one at a time to avoid memory spikes
        for (const pair of texts) {
          const result = await (classifier as Function)(pair.text, { text_pair: pair.text_pair, topk: 1 });
          const arr = Array.isArray(result) ? result : [result];
          results.push(arr as { label: string; score: number }[]);
        }
        return results;
      };
      return rerankerInstance;
    } catch (error) {
      console.error("[amem] Cross-encoder reranker unavailable — skipping rerank step:", error instanceof Error ? error.message : String(error));
      rerankerFailed = true;
      return null;
    }
  })();

  return rerankerLoading;
}

export interface RerankCandidate {
  id: string;
  content: string;
  score: number;
}

/**
 * Cross-encoder reranking: takes a query and a list of candidates,
 * scores each (query, candidate) pair with a cross-encoder model,
 * and returns candidates re-sorted by cross-encoder score.
 *
 * This is the final pass in the retrieval pipeline — after semantic + FTS + graph
 * have produced candidates, the cross-encoder provides the most accurate scoring
 * by attending to the full (query, document) pair jointly.
 *
 * Falls back to original scores if the cross-encoder model isn't available.
 */
export async function rerankWithCrossEncoder(
  query: string,
  candidates: RerankCandidate[],
  topK: number,
): Promise<RerankCandidate[]> {
  if (candidates.length === 0) return [];
  if (candidates.length <= 1) return candidates;

  const scorer = await getCrossEncoderPipeline();
  if (!scorer) {
    // Fallback: return candidates as-is (already sorted by multi-strategy score)
    return candidates.slice(0, topK);
  }

  try {
    const pairs = candidates.map(c => ({
      text: query,
      text_pair: c.content.slice(0, 512), // Truncate long docs for cross-encoder
    }));

    const scores = await scorer(pairs);

    // Merge cross-encoder scores with candidates
    const reranked = candidates.map((c, i) => {
      // Cross-encoder outputs relevance score; higher = more relevant
      const ceScore = scores[i]?.[0]?.score ?? 0;
      return { ...c, score: ceScore };
    });

    reranked.sort((a, b) => b.score - a.score);
    return reranked.slice(0, topK);
  } catch (error) {
    console.error("[amem] Cross-encoder reranking failed, using original scores:", error instanceof Error ? error.message : String(error));
    return candidates.slice(0, topK);
  }
}

export async function isRerankerAvailable(): Promise<boolean> {
  const scorer = await getCrossEncoderPipeline();
  return scorer !== null;
}
