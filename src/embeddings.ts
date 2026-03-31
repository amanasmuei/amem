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

async function getEmbeddingPipeline(): Promise<FeatureExtractor | null> {
  if (pipelineInstance) return pipelineInstance;
  if (pipelineLoading) return pipelineLoading;

  pipelineLoading = (async () => {
    try {
      const mod = await import("@huggingface/transformers");
      pipelineInstance = await mod.pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2",
      ) as unknown as FeatureExtractor;
      return pipelineInstance;
    } catch (error) {
      console.error("[amem] Failed to load embedding pipeline — falling back to keyword matching:", error instanceof Error ? error.message : String(error));
      return null;
    }
  })();

  return pipelineLoading;
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
