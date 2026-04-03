import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, type AmemDatabase } from "./database.js";
import { reflect } from "./reflection.js";
import type { MemoryTypeValue } from "./memory.js";

// ── Test helpers ───────────────────────────────────────

/** Create a deterministic fake embedding from a seed string. */
function fakeEmbedding(seed: string, dims = 384): Float32Array {
  const arr = new Float32Array(dims);
  for (let i = 0; i < dims; i++) {
    arr[i] = Math.sin(seed.charCodeAt(i % seed.length) * (i + 1) * 0.01);
  }
  // Normalize to unit vector
  let norm = 0;
  for (let i = 0; i < dims; i++) norm += arr[i] * arr[i];
  norm = Math.sqrt(norm);
  for (let i = 0; i < dims; i++) arr[i] /= norm;
  return arr;
}

/** Create a similar embedding by adding small noise to a base. */
function similarEmbedding(base: Float32Array, noise = 0.05): Float32Array {
  const arr = new Float32Array(base.length);
  for (let i = 0; i < base.length; i++) {
    arr[i] = base[i] + (Math.random() - 0.5) * noise;
  }
  // Normalize
  let norm = 0;
  for (let i = 0; i < arr.length; i++) norm += arr[i] * arr[i];
  norm = Math.sqrt(norm);
  for (let i = 0; i < arr.length; i++) arr[i] /= norm;
  return arr;
}

function insertMemory(
  db: AmemDatabase,
  content: string,
  type: MemoryTypeValue,
  embedding: Float32Array,
  opts?: { confidence?: number; tags?: string[]; createdAt?: number },
): string {
  return db.insertMemory({
    content,
    type,
    tags: opts?.tags ?? [],
    confidence: opts?.confidence ?? 0.8,
    source: "test",
    embedding,
    scope: "global",
    validFrom: opts?.createdAt,
  });
}

// ── Tests ──────────────────────────────────────────────

let db: AmemDatabase;

beforeEach(() => {
  db = createDatabase(":memory:");
});

afterEach(() => {
  db.close();
});

describe("reflect — empty database", () => {
  it("returns empty report for empty database", () => {
    const report = reflect(db);
    expect(report.stats.totalMemories).toBe(0);
    expect(report.clusters).toHaveLength(0);
    expect(report.contradictions).toHaveLength(0);
    expect(report.synthesisCandidates).toHaveLength(0);
    expect(report.stats.healthScore).toBe(100);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("reflect — clustering", () => {
  it("groups similar memories into a cluster", () => {
    // Create 4 memories with very similar embeddings (same seed base)
    const base = fakeEmbedding("typescript-types");
    insertMemory(db, "Always use strict TypeScript types", "correction", similarEmbedding(base, 0.02));
    insertMemory(db, "Prefer strict null checks in TypeScript", "correction", similarEmbedding(base, 0.02));
    insertMemory(db, "Use unknown instead of any in TypeScript", "correction", similarEmbedding(base, 0.02));
    insertMemory(db, "Enable strictNullChecks in tsconfig", "pattern", similarEmbedding(base, 0.02));

    // Create 1 unrelated memory
    insertMemory(db, "Deploy to AWS us-east-1", "decision", fakeEmbedding("deploy-cloud"));

    const report = reflect(db, { similarityThreshold: 0.5 });

    expect(report.stats.totalMemories).toBe(5);
    // Should have at least one cluster with the TS-related memories
    expect(report.clusters.length).toBeGreaterThanOrEqual(1);

    const tsCluster = report.clusters.find(
      (c) => c.members.some((m) => m.content.includes("TypeScript")),
    );
    expect(tsCluster).toBeDefined();
    expect(tsCluster!.members.length).toBeGreaterThanOrEqual(3);
  });

  it("does not cluster memories below similarity threshold", () => {
    // Create memories with very different embeddings
    insertMemory(db, "Use Python for data science", "decision", fakeEmbedding("python-data-science"));
    insertMemory(db, "Deploy via Kubernetes", "decision", fakeEmbedding("k8s-deploy-infra"));
    insertMemory(db, "Auth uses OAuth2", "decision", fakeEmbedding("oauth-authentication"));

    const report = reflect(db, { similarityThreshold: 0.9 });

    // With very high threshold, dissimilar memories shouldn't cluster
    expect(report.clusters).toHaveLength(0);
    expect(report.orphans).toBe(3);
  });

  it("respects minClusterSize", () => {
    const base = fakeEmbedding("react-hooks");
    insertMemory(db, "Use useEffect for side effects", "pattern", similarEmbedding(base, 0.02));
    insertMemory(db, "Prefer useMemo for expensive computations", "pattern", similarEmbedding(base, 0.02));

    // Only 2 similar memories, but min cluster size is 3
    const report = reflect(db, { minClusterSize: 3, similarityThreshold: 0.5 });
    expect(report.clusters).toHaveLength(0);

    // Lower min cluster size to 2 — should form a cluster
    const report2 = reflect(db, { minClusterSize: 2, similarityThreshold: 0.5 });
    expect(report2.clusters.length).toBeGreaterThanOrEqual(1);
  });

  it("identifies dominant type correctly", () => {
    const base = fakeEmbedding("testing-strategy");
    insertMemory(db, "Always write tests before code", "correction", similarEmbedding(base, 0.02));
    insertMemory(db, "Never skip unit tests", "correction", similarEmbedding(base, 0.02));
    insertMemory(db, "Test coverage should be above 80%", "pattern", similarEmbedding(base, 0.02));

    const report = reflect(db, { similarityThreshold: 0.5 });
    const cluster = report.clusters[0];
    expect(cluster).toBeDefined();
    expect(cluster.dominantType).toBe("correction");
  });
});

describe("reflect — contradiction detection", () => {
  it("detects opposing language in similar memories", () => {
    const base = fakeEmbedding("semicolons-style");
    const oldTime = Date.now() - 30 * 86_400_000; // 30 days ago

    insertMemory(db, "Always use semicolons in JavaScript", "pattern", similarEmbedding(base, 0.01), {
      createdAt: oldTime,
    });
    insertMemory(db, "Never use semicolons in JavaScript", "pattern", similarEmbedding(base, 0.01));
    // Third memory to satisfy min cluster size of 3
    insertMemory(db, "Semicolons are part of JavaScript style", "pattern", similarEmbedding(base, 0.01));

    const report = reflect(db, { similarityThreshold: 0.5 });

    expect(report.contradictions.length).toBeGreaterThanOrEqual(1);
    const c = report.contradictions[0];
    expect(c.reason).toContain("Opposing language");
    expect(c.suggestedAction).toBeTruthy();
  });

  it("does not flag non-opposing memories as contradictions", () => {
    const base = fakeEmbedding("code-style");
    insertMemory(db, "Use consistent indentation", "pattern", similarEmbedding(base, 0.02));
    insertMemory(db, "Use consistent naming conventions", "pattern", similarEmbedding(base, 0.02));
    insertMemory(db, "Use consistent formatting", "pattern", similarEmbedding(base, 0.02));

    const report = reflect(db, { similarityThreshold: 0.5 });

    expect(report.contradictions).toHaveLength(0);
  });
});

describe("reflect — synthesis candidates", () => {
  it("identifies clusters as synthesis candidates", () => {
    const base = fakeEmbedding("error-handling");
    insertMemory(db, "Always catch errors at service boundaries", "pattern", similarEmbedding(base, 0.02));
    insertMemory(db, "Log errors with full stack traces", "pattern", similarEmbedding(base, 0.02));
    insertMemory(db, "Return structured error responses", "pattern", similarEmbedding(base, 0.02));

    const report = reflect(db, { similarityThreshold: 0.5 });

    expect(report.synthesisCandidates.length).toBeGreaterThanOrEqual(1);
    const candidate = report.synthesisCandidates[0];
    expect(candidate.suggestedPrompt).toContain("Synthesize");
    expect(candidate.memories.length).toBeGreaterThanOrEqual(3);
    expect(candidate.dominantType).toBe("pattern");
  });

  it("skips clusters with already-high-confidence synthesis", () => {
    const base = fakeEmbedding("api-design");
    // One member has very high confidence (looks like an existing synthesis)
    insertMemory(db, "RESTful APIs should be versioned", "decision", similarEmbedding(base, 0.02), {
      confidence: 0.98,
    });
    insertMemory(db, "API endpoints should be consistent", "decision", similarEmbedding(base, 0.02));
    insertMemory(db, "Use proper HTTP status codes", "decision", similarEmbedding(base, 0.02));

    const report = reflect(db, { similarityThreshold: 0.5 });

    // Should NOT generate synthesis candidate since one member has 0.98 confidence
    const apiCandidate = report.synthesisCandidates.find(
      (s) => s.memories.some((m) => m.content.includes("API")),
    );
    expect(apiCandidate).toBeUndefined();
  });

  it("respects maxSynthesisCandidates", () => {
    // Create multiple distinct clusters
    for (let i = 0; i < 8; i++) {
      const base = fakeEmbedding(`cluster-${i}-unique-seed`);
      insertMemory(db, `Rule A for topic ${i}`, "pattern", similarEmbedding(base, 0.02));
      insertMemory(db, `Rule B for topic ${i}`, "pattern", similarEmbedding(base, 0.02));
      insertMemory(db, `Rule C for topic ${i}`, "pattern", similarEmbedding(base, 0.02));
    }

    const report = reflect(db, {
      similarityThreshold: 0.5,
      maxSynthesisCandidates: 3,
    });

    expect(report.synthesisCandidates.length).toBeLessThanOrEqual(3);
  });
});

describe("reflect — health score", () => {
  it("returns 100 for empty database", () => {
    const report = reflect(db);
    expect(report.stats.healthScore).toBe(100);
  });

  it("returns higher health for well-organized memories", () => {
    // High-confidence, well-clustered memories
    const base = fakeEmbedding("well-organized");
    for (let i = 0; i < 5; i++) {
      insertMemory(
        db,
        `Well-organized rule ${i}`,
        "correction",
        similarEmbedding(base, 0.02),
        { confidence: 0.95 },
      );
    }

    const report = reflect(db, { similarityThreshold: 0.5 });
    expect(report.stats.healthScore).toBeGreaterThan(30);
  });
});

describe("reflect — expired memories", () => {
  it("excludes expired memories from reflection", () => {
    const base = fakeEmbedding("expired-test");
    const id1 = insertMemory(db, "Old expired rule", "pattern", similarEmbedding(base, 0.02));
    insertMemory(db, "Active rule one", "pattern", similarEmbedding(base, 0.02));
    insertMemory(db, "Active rule two", "pattern", similarEmbedding(base, 0.02));
    insertMemory(db, "Active rule three", "pattern", similarEmbedding(base, 0.02));

    // Expire the first one
    db.expireMemory(id1);

    const report = reflect(db, { similarityThreshold: 0.5 });
    expect(report.stats.totalMemories).toBe(3);

    // Expired memory should not appear in any cluster
    for (const cluster of report.clusters) {
      for (const member of cluster.members) {
        expect(member.id).not.toBe(id1);
      }
    }
  });
});

describe("reflect — configuration", () => {
  it("accepts custom configuration", () => {
    const base = fakeEmbedding("config-test");
    insertMemory(db, "Config test A", "fact", similarEmbedding(base, 0.02));
    insertMemory(db, "Config test B", "fact", similarEmbedding(base, 0.02));
    insertMemory(db, "Config test C", "fact", similarEmbedding(base, 0.02));

    // Very high threshold should prevent clustering
    const strict = reflect(db, { similarityThreshold: 0.99 });
    expect(strict.clusters).toHaveLength(0);

    // Low threshold should allow clustering
    const loose = reflect(db, { similarityThreshold: 0.3 });
    expect(loose.stats.totalMemories).toBe(3);
  });

  it("respects maxMemories limit", () => {
    const base = fakeEmbedding("limit-test");
    for (let i = 0; i < 10; i++) {
      insertMemory(db, `Memory ${i}`, "fact", similarEmbedding(base, 0.02));
    }

    const report = reflect(db, { maxMemories: 5 });
    expect(report.stats.totalMemories).toBe(5);
  });
});

describe("reflect — report structure", () => {
  it("returns a complete report with all fields", () => {
    const report = reflect(db);

    expect(report).toHaveProperty("clusters");
    expect(report).toHaveProperty("contradictions");
    expect(report).toHaveProperty("synthesisCandidates");
    expect(report).toHaveProperty("orphans");
    expect(report).toHaveProperty("stats");
    expect(report).toHaveProperty("timestamp");
    expect(report).toHaveProperty("durationMs");

    expect(report.stats).toHaveProperty("totalMemories");
    expect(report.stats).toHaveProperty("clusteredMemories");
    expect(report.stats).toHaveProperty("totalClusters");
    expect(report.stats).toHaveProperty("avgClusterSize");
    expect(report.stats).toHaveProperty("contradictionsFound");
    expect(report.stats).toHaveProperty("synthesisCandidates");
    expect(report.stats).toHaveProperty("healthScore");

    expect(report.timestamp).toBeGreaterThan(0);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("cluster members have correct structure", () => {
    const base = fakeEmbedding("structure-test");
    insertMemory(db, "Structure test A", "pattern", similarEmbedding(base, 0.02), {
      tags: ["test"],
    });
    insertMemory(db, "Structure test B", "pattern", similarEmbedding(base, 0.02), {
      tags: ["test"],
    });
    insertMemory(db, "Structure test C", "pattern", similarEmbedding(base, 0.02), {
      tags: ["test"],
    });

    const report = reflect(db, { similarityThreshold: 0.5 });

    if (report.clusters.length > 0) {
      const cluster = report.clusters[0];
      expect(cluster).toHaveProperty("id");
      expect(cluster).toHaveProperty("members");
      expect(cluster).toHaveProperty("dominantType");
      expect(cluster).toHaveProperty("coherence");
      expect(cluster).toHaveProperty("tags");
      expect(cluster).toHaveProperty("isSynthesisCandidate");

      const member = cluster.members[0];
      expect(member).toHaveProperty("id");
      expect(member).toHaveProperty("content");
      expect(member).toHaveProperty("type");
      expect(member).toHaveProperty("confidence");
      expect(member).toHaveProperty("createdAt");
      expect(member).toHaveProperty("tags");
    }
  });
});
