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
    const LOAD_TIMEOUT_MS = 30000;

    async function attemptLoad(): Promise<FeatureExtractor | null> {
      const loadPromise = (async () => {
        const { loadConfig } = await import("./config.js");
        const config = loadConfig();
        const mod = await import("@huggingface/transformers");
        return await mod.pipeline(
          "feature-extraction",
          config.embeddingModel,
        ) as unknown as FeatureExtractor;
      })();

      return await Promise.race([
        loadPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), LOAD_TIMEOUT_MS)),
      ]);
    }

    try {
      const result = await attemptLoad();
      if (result) {
        pipelineInstance = result;
  
        return pipelineInstance;
      }

      console.error("[amem] Embedding model load timed out — using keyword matching");
      return null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // If the cached model is corrupted, clear it and retry once
      if (msg.includes("Protobuf parsing failed") || msg.includes("invalid model")) {
        console.error("[amem] Corrupted model cache detected — clearing and retrying...");
        try {
          const fs = await import("node:fs");
          const path = await import("node:path");
          const os = await import("node:os");
          const { loadConfig } = await import("./config.js");
          const cfg = loadConfig();
          const modelParts = cfg.embeddingModel.split("/");
          const modelOrg = modelParts[0] ?? "Xenova";
          const modelName = modelParts[1] ?? cfg.embeddingModel;
          // Clear the HuggingFace cache for this model
          const cacheLocations = [
            path.join(os.homedir(), ".cache", "huggingface", "transformers", modelOrg, modelName),
          ];
          // Also try to find the cache inside node_modules
          try {
            const modPath = import.meta.resolve?.("@huggingface/transformers") ?? "";
            if (modPath) {
              const modDir = path.dirname(modPath.replace("file://", ""));
              cacheLocations.push(path.join(modDir, ".cache", modelOrg, modelName));
            }
          } catch {}
          for (const loc of cacheLocations) {
            if (fs.existsSync(loc)) {
              fs.rmSync(loc, { recursive: true, force: true });
              console.error(`[amem] Cleared cache: ${loc}`);
            }
          }
          // Retry once
          const retryResult = await attemptLoad();
          if (retryResult) {
            pipelineInstance = retryResult;
      
            console.error("[amem] Model re-downloaded successfully — semantic search enabled");
            return pipelineInstance;
          }
        } catch (retryError) {
          console.error("[amem] Cache recovery failed:", retryError instanceof Error ? retryError.message : String(retryError));
        }
      }

      console.error("[amem] Embeddings unavailable — using keyword matching (still works great!):", msg);
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
