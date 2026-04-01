import type { AmemDatabase } from "./database.js";
import { loadConfig } from "./config.js";

export interface DiagnosticIssue {
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  suggestion: string;
}

export interface DiagnosticReport {
  status: "healthy" | "warning" | "critical";
  stats: {
    totalMemories: number;
    embeddingCoverage: number; // 0-100%
    coreTierTokens: number;
    coreTierBudget: number;
    staleCount: number;
    orphanedGraphNodes: number;
    byType: Record<string, number>;
    graphEdges: number;
    remindersOverdue: number;
  };
  issues: DiagnosticIssue[];
}

export function runDiagnostics(db: AmemDatabase): DiagnosticReport {
  const config = loadConfig();
  const issues: DiagnosticIssue[] = [];

  // Basic stats
  const stats = db.getStats();
  const totalMemories = stats.total;
  const byType = stats.byType;

  // Embedding coverage
  const embeddingCount = db.getEmbeddingCount();
  const embeddingCoverage = totalMemories > 0
    ? Math.round((embeddingCount / totalMemories) * 100)
    : 100; // empty DB is fine

  // Core tier token analysis
  const coreTierBudget = config.tiers.coreMaxTokens;
  const coreMemories = db.getByTier("core");
  const coreTierTokens = coreMemories.reduce(
    (sum, m) => sum + Math.ceil(m.content.length / 4),
    0,
  );

  // Stale memories: 60+ days old, <0.5 confidence, not corrections
  const now = Date.now();
  const staleCutoff = now - 60 * 24 * 60 * 60 * 1000;
  const allMemories = db.getAll();
  const staleMemories = allMemories.filter(
    (m) =>
      m.createdAt < staleCutoff &&
      m.confidence < 0.5 &&
      m.type !== "correction",
  );
  const staleCount = staleMemories.length;

  // Graph analysis
  const allRelations = db.getAllRelations();
  const graphEdges = allRelations.length;
  const memoryIds = new Set(allMemories.map((m) => m.id));
  const orphanedGraphNodes = allRelations.filter(
    (r) => !memoryIds.has(r.fromId) || !memoryIds.has(r.toId),
  ).length;

  // Overdue reminders
  const reminders = db.checkReminders();
  const remindersOverdue = reminders.filter((r) => r.status === "overdue").length;

  // ── Issue detection ──────────────────────────────────────

  if (totalMemories > 0 && embeddingCoverage < 50) {
    issues.push({
      type: "low_embedding_coverage",
      severity: "warning",
      message: `Only ${embeddingCoverage}% of memories have embeddings`,
      suggestion:
        "Semantic search quality is reduced. Use the MCP server to auto-generate embeddings on access.",
    });
  }

  if (coreTierTokens > coreTierBudget * 0.9 && coreTierBudget > 0) {
    issues.push({
      type: "core_tier_near_budget",
      severity: coreTierTokens > coreTierBudget ? "critical" : "warning",
      message: `Core tier uses ${coreTierTokens}/${coreTierBudget} tokens (${Math.round((coreTierTokens / coreTierBudget) * 100)}%)`,
      suggestion:
        "Review core memories with 'amem list --type correction' and consolidate or demote less important ones.",
    });
  }

  if (staleCount > 10) {
    issues.push({
      type: "stale_memories",
      severity: "warning",
      message: `${staleCount} stale memories (60+ days old, low confidence)`,
      suggestion:
        "Run 'amem list' to review and 'amem forget <id>' to clean up outdated entries.",
    });
  }

  if (orphanedGraphNodes > 0) {
    issues.push({
      type: "orphaned_graph_nodes",
      severity: "warning",
      message: `${orphanedGraphNodes} graph edge(s) reference deleted memories`,
      suggestion:
        "These orphaned relations can be cleaned up by consolidating the knowledge graph.",
    });
  }

  if (remindersOverdue > 0) {
    issues.push({
      type: "overdue_reminders",
      severity: "info",
      message: `${remindersOverdue} overdue reminder(s)`,
      suggestion:
        "Check reminders via the MCP 'reminder_check' tool or address them in your next session.",
    });
  }

  if (totalMemories >= 100 && (byType["correction"] ?? 0) === 0) {
    issues.push({
      type: "no_corrections",
      severity: "info",
      message: "100+ memories but no corrections stored",
      suggestion:
        "Corrections are the highest-priority memory type. Store them when the AI makes mistakes.",
    });
  }

  // ── Determine overall status ────────────────────────────

  let status: DiagnosticReport["status"] = "healthy";
  if (issues.some((i) => i.severity === "critical")) {
    status = "critical";
  } else if (issues.some((i) => i.severity === "warning")) {
    status = "warning";
  }

  return {
    status,
    stats: {
      totalMemories,
      embeddingCoverage,
      coreTierTokens,
      coreTierBudget,
      staleCount,
      orphanedGraphNodes,
      byType,
      graphEdges,
      remindersOverdue,
    },
    issues,
  };
}
