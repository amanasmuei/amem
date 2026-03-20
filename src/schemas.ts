import { z } from "zod";

export const StoreResultSchema = z.union([
  z.object({
    action: z.literal("stored"),
    id: z.string(),
    type: z.string(),
    confidence: z.number(),
    tags: z.array(z.string()),
    total: z.number(),
    reinforced: z.number(),
  }),
  z.object({
    action: z.literal("conflict_resolved"),
    existingId: z.string(),
    similarity: z.number(),
    existingContent: z.string(),
  }),
]);

const RecalledMemorySchema = z.object({
  id: z.string(),
  content: z.string(),
  type: z.string(),
  score: z.number(),
  confidence: z.number(),
  tags: z.array(z.string()),
  age: z.string(),
});

export const RecallResultSchema = z.object({
  query: z.string(),
  total: z.number(),
  memories: z.array(RecalledMemorySchema),
});

const ContextGroupSchema = z.object({
  type: z.string(),
  memories: z.array(z.object({
    content: z.string(),
    confidence: z.number(),
  })),
});

export const ContextResultSchema = z.object({
  topic: z.string(),
  groups: z.array(ContextGroupSchema),
  memoriesUsed: z.number(),
});

export const ForgetResultSchema = z.union([
  z.object({
    action: z.literal("deleted"),
    id: z.string(),
    content: z.string(),
    type: z.string(),
  }),
  z.object({
    action: z.literal("preview"),
    query: z.string(),
    total: z.number(),
    previewed: z.array(z.object({
      id: z.string(),
      content: z.string(),
    })),
  }),
  z.object({
    action: z.literal("bulk_deleted"),
    query: z.string(),
    deleted: z.number(),
  }),
]);

export const ExtractResultSchema = z.object({
  stored: z.number(),
  reinforced: z.number(),
  total: z.number(),
  details: z.array(z.object({
    action: z.enum(["stored", "reinforced"]),
    content: z.string(),
    type: z.string().optional(),
    id: z.string().optional(),
    matchedContent: z.string().optional(),
    similarity: z.number().optional(),
  })),
});

export const StatsResultSchema = z.object({
  total: z.number(),
  byType: z.record(z.string(), z.number()),
  confidence: z.object({
    high: z.number(),
    medium: z.number(),
    low: z.number(),
  }),
  embeddingCoverage: z.object({
    withEmbeddings: z.number(),
    total: z.number(),
  }),
});

export const ExportResultSchema = z.object({
  exportedAt: z.string(),
  total: z.number(),
  markdown: z.string(),
  truncated: z.boolean(),
});

export const InjectResultSchema = z.object({
  topic: z.string(),
  corrections: z.array(z.string()),
  decisions: z.array(z.string()),
  context: z.string(),
  memoriesUsed: z.number(),
});

export const ConsolidateResultSchema = z.object({
  merged: z.number(),
  pruned: z.number(),
  promoted: z.number(),
  healthScore: z.number(),
  before: z.object({ total: z.number() }),
  after: z.object({ total: z.number() }),
  actions: z.array(z.object({
    action: z.enum(["merged", "pruned", "promoted"]),
    memoryIds: z.array(z.string()),
    description: z.string(),
  })),
});
