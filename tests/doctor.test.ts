import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, type AmemDatabase, MemoryType, runDiagnostics } from "@aman_asmuei/amem-core";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("runDiagnostics", () => {
  let db: AmemDatabase;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `amem-doctor-${Date.now()}.db`);
    db = createDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    try {
      fs.unlinkSync(dbPath);
    } catch {}
  });

  it("reports healthy on empty database", () => {
    const report = runDiagnostics(db);
    expect(report.status).toBe("healthy");
    expect(report.stats.totalMemories).toBe(0);
    expect(report.issues).toHaveLength(0);
  });

  it("warns about low embedding coverage", () => {
    for (let i = 0; i < 10; i++) {
      db.insertMemory({
        content: `memory ${i}`,
        type: MemoryType.FACT,
        tags: [],
        confidence: 0.8,
        source: "test",
        embedding: null,
        scope: "global",
      });
    }

    const report = runDiagnostics(db);
    expect(report.stats.embeddingCoverage).toBe(0);
    const embIssue = report.issues.find(
      (i) => i.type === "low_embedding_coverage",
    );
    expect(embIssue).toBeDefined();
    expect(embIssue!.severity).toBe("warning");
  });

  it("reports correct stats (totalMemories, byType)", () => {
    db.insertMemory({
      content: "correction 1",
      type: MemoryType.CORRECTION,
      tags: [],
      confidence: 1.0,
      source: "test",
      embedding: null,
      scope: "global",
    });
    db.insertMemory({
      content: "decision 1",
      type: MemoryType.DECISION,
      tags: [],
      confidence: 0.9,
      source: "test",
      embedding: null,
      scope: "global",
    });
    db.insertMemory({
      content: "decision 2",
      type: MemoryType.DECISION,
      tags: [],
      confidence: 0.9,
      source: "test",
      embedding: null,
      scope: "global",
    });

    const report = runDiagnostics(db);
    expect(report.stats.totalMemories).toBe(3);
    expect(report.stats.byType["correction"]).toBe(1);
    expect(report.stats.byType["decision"]).toBe(2);
  });

  it("detects core tier budget usage", () => {
    // Insert a large core-tier memory
    const bigContent = "x".repeat(4000); // ~1000 tokens at content.length/4
    const id = db.insertMemory({
      content: bigContent,
      type: MemoryType.CORRECTION,
      tags: [],
      confidence: 1.0,
      source: "test",
      embedding: null,
      scope: "global",
      tier: "core",
    });

    const report = runDiagnostics(db);
    expect(report.stats.coreTierTokens).toBeGreaterThan(0);
    // Default budget is 500 tokens; 1000 tokens should exceed it
    const budgetIssue = report.issues.find(
      (i) => i.type === "core_tier_near_budget",
    );
    expect(budgetIssue).toBeDefined();
    expect(budgetIssue!.severity).toBe("critical");
  });

  it("empty DB has no issues", () => {
    const report = runDiagnostics(db);
    expect(report.issues).toHaveLength(0);
    expect(report.status).toBe("healthy");
  });
});
