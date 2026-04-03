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
  content: z.string().optional(),
  preview: z.string().optional(),
  type: z.string(),
  score: z.number(),
  confidence: z.number(),
  tags: z.array(z.string()).optional(),
  age: z.string().optional(),
});

export const RecallResultSchema = z.object({
  query: z.string(),
  total: z.number(),
  compact: z.boolean().optional(),
  tokenEstimate: z.number().optional(),
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
  decayed: z.number(),
  healthScore: z.number(),
  before: z.object({ total: z.number() }),
  after: z.object({ total: z.number() }),
  actions: z.array(z.object({
    action: z.enum(["merged", "pruned", "promoted", "decayed"]),
    memoryIds: z.array(z.string()),
    description: z.string(),
  })),
});

export const PatchResultSchema = z.union([
  z.object({
    action: z.literal("patched"),
    id: z.string(),
    field: z.string(),
    previousContent: z.string(),
    reason: z.string(),
    versionSaved: z.boolean(),
  }),
  z.object({
    action: z.literal("not_found"),
    id: z.string(),
  }),
]);

export const LogAppendResultSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  role: z.string(),
  appended: z.boolean(),
});

export const LogRecallResultSchema = z.object({
  query: z.string().optional(),
  sessionId: z.string().optional(),
  total: z.number(),
  entries: z.array(z.object({
    id: z.string(),
    role: z.string(),
    content: z.string(),
    timestamp: z.number(),
    age: z.string(),
    project: z.string(),
  })),
});

export const RelateResultSchema = z.union([
  z.object({
    action: z.literal("related"),
    relationId: z.string(),
    fromId: z.string(),
    toId: z.string(),
    type: z.string(),
    strength: z.number(),
  }),
  z.object({
    action: z.literal("unrelated"),
    relationId: z.string(),
  }),
  z.object({
    action: z.literal("graph"),
    memoryId: z.string(),
    relations: z.array(z.object({
      relatedId: z.string(),
      direction: z.enum(["outgoing", "incoming"]),
      type: z.string(),
      strength: z.number(),
      content: z.string().optional(),
    })),
  }),
]);

export const VersionResultSchema = z.union([
  z.object({
    action: z.literal("history"),
    memoryId: z.string(),
    currentContent: z.string(),
    versions: z.array(z.object({
      versionId: z.string(),
      content: z.string(),
      confidence: z.number(),
      editedAt: z.number(),
      age: z.string(),
      reason: z.string(),
    })),
  }),
  z.object({
    action: z.literal("restored"),
    memoryId: z.string(),
    restoredContent: z.string(),
    versionId: z.string(),
  }),
]);

export const TemporalResultSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  total: z.number(),
  memories: z.array(z.object({
    id: z.string(),
    content: z.string(),
    type: z.string(),
    confidence: z.number(),
    createdAt: z.number(),
    age: z.string(),
    tags: z.array(z.string()),
  })),
});

// ── Memory Detail ───────────────────────────────────────
export const DetailResultSchema = z.object({
  total: z.number(),
  tokenEstimate: z.number(),
  memories: z.array(z.object({
    id: z.string(),
    content: z.string(),
    type: z.string(),
    confidence: z.number(),
    tags: z.array(z.string()),
    age: z.string(),
    scope: z.string(),
  })),
});

// ── Reminders ───────────────────────────────────────────
export const ReminderSetResultSchema = z.object({
  id: z.string(),
  content: z.string(),
  dueAt: z.number().nullable(),
  scope: z.string(),
});

export const ReminderListResultSchema = z.object({
  total: z.number(),
  reminders: z.array(z.object({
    id: z.string(),
    content: z.string(),
    dueAt: z.number().nullable(),
    completed: z.boolean(),
    scope: z.string(),
  })),
});

export const ReminderCheckResultSchema = z.object({
  total: z.number(),
  reminders: z.array(z.object({
    id: z.string(),
    content: z.string(),
    dueAt: z.number().nullable(),
    status: z.enum(["overdue", "today", "upcoming"]),
    scope: z.string(),
  })),
});

export const ReminderCompleteResultSchema = z.object({
  id: z.string(),
  completed: z.boolean(),
  content: z.string().optional(),
});

// ── Log Cleanup ─────────────────────────────────────────
export const LogCleanupResultSchema = z.object({
  deleted: z.number(),
  remaining: z.number(),
  cutoffDate: z.string(),
});

// ── Reflection ──────────────────────────────────────────
export const ReflectResultSchema = z.object({
  stats: z.object({
    totalMemories: z.number(),
    clusteredMemories: z.number(),
    totalClusters: z.number(),
    avgClusterSize: z.number(),
    contradictionsFound: z.number(),
    synthesisCandidates: z.number(),
    knowledgeGaps: z.number(),
    healthScore: z.number(),
  }),
  clusters: z.array(z.object({
    id: z.string(),
    memberCount: z.number(),
    dominantType: z.string(),
    coherence: z.number(),
    tags: z.array(z.string()),
    memberIds: z.array(z.string()),
  })),
  contradictions: z.array(z.object({
    olderMemoryId: z.string(),
    newerMemoryId: z.string(),
    similarity: z.number(),
    reason: z.string(),
    suggestedAction: z.string(),
  })),
  synthesisCandidates: z.array(z.object({
    clusterId: z.string(),
    dominantType: z.string(),
    memoryIds: z.array(z.string()),
    suggestedPrompt: z.string(),
  })),
  knowledgeGaps: z.array(z.object({
    id: z.string(),
    queryPattern: z.string(),
    hitCount: z.number(),
    avgConfidence: z.number(),
    avgResults: z.number(),
  })),
  orphans: z.number(),
  durationMs: z.number(),
});

