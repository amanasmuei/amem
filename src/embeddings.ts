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
    } catch {
      return null;
    }
  })();

  return pipelineLoading;
}

export async function generateEmbedding(
  text: string,
): Promise<Float32Array | null> {
  const extractor = await getEmbeddingPipeline();
  if (!extractor) return null;

  const result = await extractor(text, { pooling: "mean", normalize: true });
  return new Float32Array(result.data);
}

export async function isEmbeddingAvailable(): Promise<boolean> {
  const extractor = await getEmbeddingPipeline();
  return extractor !== null;
}
