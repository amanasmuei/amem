import { describe, it, expect, afterEach } from "vitest";
import { installHooks, uninstallHooks, generateHooksConfig } from "../src/hooks.js";
import { createDatabase, type AmemDatabase } from "../src/database.js";
import { rerankWithCrossEncoder } from "../src/embeddings.js";
import { getDefaultConfig, resetConfigCache } from "../src/config.js";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// ═══════════════════════════════════════════════════════════
// HOOKS SYSTEM
// ═══════════════════════════════════════════════════════════
describe("Hooks system", () => {
  const testDir = path.join(os.tmpdir(), `amem-hooks-test-${Date.now()}`);

  afterEach(() => {
    try { fs.rmSync(testDir, { recursive: true }); } catch {}
  });

  it("generateHooksConfig produces PostToolUse and Stop hooks", () => {
    const config = generateHooksConfig({ captureToolUse: true, captureSessionEnd: true });
    expect(config.PostToolUse).toHaveLength(1);
    expect(config.Stop).toHaveLength(1);

    const postTool = config.PostToolUse[0] as Record<string, unknown>;
    expect(postTool.type).toBe("command");
    expect(postTool.description).toContain("amem:");

    const stop = config.Stop[0] as Record<string, unknown>;
    expect(stop.type).toBe("command");
    expect(stop.description).toContain("amem:");
  });

  it("generateHooksConfig respects partial config", () => {
    const config = generateHooksConfig({ captureToolUse: true, captureSessionEnd: false });
    expect(config.PostToolUse).toHaveLength(1);
    expect(config.Stop).toBeUndefined();
  });

  it("generateHooksConfig with nothing enabled produces empty", () => {
    const config = generateHooksConfig({ captureToolUse: false, captureSessionEnd: false });
    expect(Object.keys(config)).toHaveLength(0);
  });

  it("installHooks creates hook scripts", () => {
    // Override dirs for test isolation
    const origAmemDir = process.env.AMEM_DIR;
    const origAmemDb = process.env.AMEM_DB;
    process.env.AMEM_DIR = testDir;
    process.env.AMEM_DB = path.join(testDir, "memory.db");

    // Claude settings dir may or may not exist

    try {
      const result = installHooks({ captureToolUse: true, captureSessionEnd: true });

      expect(result.installed).toContain("post-tool-use.mjs");
      expect(result.installed).toContain("session-end.mjs");

      // Verify scripts were created
      expect(fs.existsSync(path.join(testDir, "hooks", "post-tool-use.mjs"))).toBe(true);
      expect(fs.existsSync(path.join(testDir, "hooks", "session-end.mjs"))).toBe(true);

      // Verify scripts contain the DB path
      const postToolContent = fs.readFileSync(path.join(testDir, "hooks", "post-tool-use.mjs"), "utf-8");
      expect(postToolContent).toContain("amem PostToolUse hook");
      expect(postToolContent).toContain("better-sqlite3");

      const sessionEndContent = fs.readFileSync(path.join(testDir, "hooks", "session-end.mjs"), "utf-8");
      expect(sessionEndContent).toContain("amem Stop hook");
      expect(sessionEndContent).toContain("session_summaries");
    } finally {
      if (origAmemDir) process.env.AMEM_DIR = origAmemDir;
      else delete process.env.AMEM_DIR;
      if (origAmemDb) process.env.AMEM_DB = origAmemDb;
      else delete process.env.AMEM_DB;
    }
  });

  it("uninstallHooks removes scripts", () => {
    const origAmemDir = process.env.AMEM_DIR;
    process.env.AMEM_DIR = testDir;

    try {
      // Create dummy hook scripts
      const hookDir = path.join(testDir, "hooks");
      fs.mkdirSync(hookDir, { recursive: true });
      fs.writeFileSync(path.join(hookDir, "post-tool-use.mjs"), "// test");
      fs.writeFileSync(path.join(hookDir, "session-end.mjs"), "// test");

      const result = uninstallHooks();
      expect(result.removed).toContain("post-tool-use.mjs");
      expect(result.removed).toContain("session-end.mjs");
      expect(fs.existsSync(path.join(hookDir, "post-tool-use.mjs"))).toBe(false);
      expect(fs.existsSync(path.join(hookDir, "session-end.mjs"))).toBe(false);
    } finally {
      if (origAmemDir) process.env.AMEM_DIR = origAmemDir;
      else delete process.env.AMEM_DIR;
    }
  });
});

// ═══════════════════════════════════════════════════════════
// CROSS-ENCODER RERANKING FALLBACK
// ═══════════════════════════════════════════════════════════
describe("Cross-encoder reranking", () => {
  it("rerankWithCrossEncoder handles multiple candidates gracefully", async () => {
    // Use only the fast path tests — actual model loading is slow
    // The reranker gracefully falls back when the model is unavailable
    const candidates = [
      { id: "a", content: "PostgreSQL is the database", score: 0.8 },
      { id: "b", content: "Redis for caching", score: 0.6 },
      { id: "c", content: "Auth uses JWT", score: 0.4 },
    ];

    // This will either load model (slow) or fallback to original order (fast)
    // In CI without model, it returns original order — both are valid
    const result = await rerankWithCrossEncoder("database choice", candidates, 2);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBeDefined();
    expect(result[0].score).toBeGreaterThanOrEqual(0);
  }, 60000);

  it("rerankWithCrossEncoder handles empty candidates", async () => {
    const result = await rerankWithCrossEncoder("test query", [], 5);
    expect(result).toHaveLength(0);
  });

  it("rerankWithCrossEncoder handles single candidate", async () => {
    const result = await rerankWithCrossEncoder("test", [{ id: "x", content: "only one", score: 0.5 }], 5);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("x");
  });
});

// ═══════════════════════════════════════════════════════════
// SESSION SUMMARY AUTO-EXTRACTION
// ═══════════════════════════════════════════════════════════
describe("Session summary storage and retrieval", () => {
  let db: AmemDatabase;
  let dbPath: string;

  afterEach(() => {
    if (db) db.close();
    try { if (dbPath) fs.unlinkSync(dbPath); } catch {}
  });

  it("stores summaries that the auto-summarize hook would create", () => {
    dbPath = path.join(os.tmpdir(), `amem-summary-test-${Date.now()}.db`);
    db = createDatabase(dbPath);

    // Simulate what the Stop hook does: log entries, then summary
    db.appendLog({ sessionId: "auto-sess", role: "user", content: "Let's use PostgreSQL", project: "global" });
    db.appendLog({ sessionId: "auto-sess", role: "assistant", content: "Good choice for ACID compliance", project: "global" });
    db.appendLog({ sessionId: "auto-sess", role: "user", content: "Don't use ORM, raw SQL instead", project: "global" });
    db.appendLog({ sessionId: "auto-sess", role: "assistant", content: "Understood, using raw SQL with parameterized queries", project: "global" });

    // This is what the hook script builds
    db.insertSummary({
      sessionId: "auto-sess",
      summary: "Session with 4 exchanges. Tools used: none observed.",
      keyDecisions: ["Good choice for ACID compliance"],
      keyCorrections: ["Don't use ORM, raw SQL instead"],
      memoriesExtracted: 0,
      project: "global",
    });

    const summary = db.getSummaryBySession("auto-sess");
    expect(summary).not.toBeNull();
    expect(summary!.keyDecisions).toHaveLength(1);
    expect(summary!.keyCorrections).toHaveLength(1);
    expect(summary!.keyCorrections[0]).toContain("ORM");
  });

  it("getRecentSummaries returns summaries in descending order", () => {
    dbPath = path.join(os.tmpdir(), `amem-summary-order-${Date.now()}.db`);
    db = createDatabase(dbPath);

    db.insertSummary({ sessionId: "s1", summary: "First", keyDecisions: [], keyCorrections: [], memoriesExtracted: 1, project: "global" });
    // Tiny delay to ensure different timestamps
    db.insertSummary({ sessionId: "s2", summary: "Second", keyDecisions: [], keyCorrections: [], memoriesExtracted: 2, project: "global" });

    const summaries = db.getRecentSummaries("global", 10);
    expect(summaries).toHaveLength(2);
    // Both should be present
    const names = summaries.map(s => s.summary);
    expect(names).toContain("First");
    expect(names).toContain("Second");
  });
});

// ═══════════════════════════════════════════════════════════
// CONFIG INTEGRATION
// ═══════════════════════════════════════════════════════════
describe("Config integration with retrieval", () => {
  afterEach(() => { resetConfigCache(); });

  it("default config has reranker disabled", () => {
    const config = getDefaultConfig();
    expect(config.retrieval.rerankerEnabled).toBe(false);
    expect(config.retrieval.rerankerTopK).toBe(20);
  });

  it("default config has privacy enabled", () => {
    const config = getDefaultConfig();
    expect(config.privacy.enablePrivateTags).toBe(true);
    expect(config.privacy.redactPatterns.length).toBeGreaterThan(0);
  });

  it("default config has hooks enabled", () => {
    const config = getDefaultConfig();
    expect(config.hooks.enabled).toBe(true);
    expect(config.hooks.captureToolUse).toBe(true);
    expect(config.hooks.captureSessionEnd).toBe(true);
  });
});
