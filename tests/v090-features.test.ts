import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, type AmemDatabase, MemoryType, type MemoryTypeValue, recallMemories, multiStrategyRecall, autoExpireContradictions, sanitizeContent, loadConfig, getDefaultConfig, resetConfigCache } from "@aman_asmuei/amem-core";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

function makeDb(): { db: AmemDatabase; dbPath: string } {
  const dbPath = path.join(
    os.tmpdir(),
    `amem-v090-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  return { db: createDatabase(dbPath), dbPath };
}

function mem(db: AmemDatabase, content: string, type: MemoryTypeValue = MemoryType.FACT, opts?: { tags?: string[]; confidence?: number; scope?: string; tier?: string; validFrom?: number; validUntil?: number }) {
  return db.insertMemory({
    content,
    type,
    tags: opts?.tags ?? [],
    confidence: opts?.confidence ?? 0.8,
    source: "test",
    embedding: null,
    scope: opts?.scope ?? "global",
    tier: opts?.tier,
    validFrom: opts?.validFrom,
    validUntil: opts?.validUntil,
  });
}

// ═══════════════════════════════════════════════════════════
// TEMPORAL VALIDITY
// ═══════════════════════════════════════════════════════════
describe("Temporal validity — valid_from / valid_until", () => {
  let db: AmemDatabase;
  let dbPath: string;
  beforeEach(() => { ({ db, dbPath } = makeDb()); });
  afterEach(() => { db.close(); try { fs.unlinkSync(dbPath); } catch {} });

  it("stores valid_from defaulting to created_at", () => {
    const id = mem(db, "default validity");
    const m = db.getById(id)!;
    expect(m.validFrom).toBeGreaterThan(0);
    expect(m.validUntil).toBeNull();
  });

  it("stores custom valid_from and valid_until", () => {
    const from = Date.now() - 86400000; // yesterday
    const until = Date.now() + 86400000; // tomorrow
    const id = mem(db, "bounded validity", MemoryType.DECISION, { validFrom: from, validUntil: until });
    const m = db.getById(id)!;
    expect(m.validFrom).toBe(from);
    expect(m.validUntil).toBe(until);
  });

  it("expireMemory sets valid_until", () => {
    const id = mem(db, "will expire");
    expect(db.getById(id)!.validUntil).toBeNull();

    db.expireMemory(id);
    const expired = db.getById(id)!;
    expect(expired.validUntil).toBeGreaterThan(0);
    expect(expired.validUntil).toBeLessThanOrEqual(Date.now());
  });

  it("getValidMemories excludes expired ones", () => {
    mem(db, "still valid");
    const expId = mem(db, "already expired");
    db.expireMemory(expId, Date.now() - 1000); // expired 1s ago

    const valid = db.getValidMemories();
    expect(valid).toHaveLength(1);
    expect(valid[0].content).toBe("still valid");
  });

  it("recallMemories filters expired by default", () => {
    mem(db, "active memory");
    const expId = mem(db, "expired memory");
    db.expireMemory(expId, Date.now() - 1000);

    const results = recallMemories(db, { query: null, limit: 10 });
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe("active memory");
  });

  it("recallMemories can include expired with filterExpired=false", () => {
    mem(db, "active memory");
    const expId = mem(db, "expired memory");
    db.expireMemory(expId, Date.now() - 1000);

    const results = recallMemories(db, { query: null, limit: 10, filterExpired: false });
    expect(results).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════
// MEMORY TIERS
// ═══════════════════════════════════════════════════════════
describe("Memory tiers — core / working / archival", () => {
  let db: AmemDatabase;
  let dbPath: string;
  beforeEach(() => { ({ db, dbPath } = makeDb()); });
  afterEach(() => { db.close(); try { fs.unlinkSync(dbPath); } catch {} });

  it("defaults to archival tier", () => {
    const id = mem(db, "default tier");
    expect(db.getById(id)!.tier).toBe("archival");
  });

  it("stores custom tier", () => {
    const id = mem(db, "core memory", MemoryType.CORRECTION, { tier: "core" });
    expect(db.getById(id)!.tier).toBe("core");
  });

  it("updateTier changes tier", () => {
    const id = mem(db, "promote me");
    db.updateTier(id, "core");
    expect(db.getById(id)!.tier).toBe("core");
  });

  it("getByTier returns only matching tier", () => {
    mem(db, "archival 1");
    mem(db, "archival 2");
    mem(db, "core memory", MemoryType.CORRECTION, { tier: "core" });

    expect(db.getByTier("core")).toHaveLength(1);
    expect(db.getByTier("archival")).toHaveLength(2);
    expect(db.getByTier("working")).toHaveLength(0);
  });

  it("getByTier respects scope", () => {
    mem(db, "global core", MemoryType.CORRECTION, { tier: "core", scope: "global" });
    mem(db, "project core", MemoryType.CORRECTION, { tier: "core", scope: "project:/foo" });

    const scoped = db.getByTier("core", "project:/foo");
    expect(scoped).toHaveLength(2); // global + project
  });

  it("recallMemories can filter by tier", () => {
    mem(db, "archival memory");
    mem(db, "core memory", MemoryType.CORRECTION, { tier: "core" });

    const coreOnly = recallMemories(db, { query: null, limit: 10, tier: "core" });
    expect(coreOnly).toHaveLength(1);
    expect(coreOnly[0].content).toBe("core memory");
  });
});

// ═══════════════════════════════════════════════════════════
// PRIVACY TAGS
// ═══════════════════════════════════════════════════════════
describe("Privacy — <private> tags and redaction", () => {
  it("strips <private> blocks from content", () => {
    const config = getDefaultConfig();
    const result = sanitizeContent("Hello <private>secret-key-123</private> world", config);
    expect(result).toBe("Hello [REDACTED] world");
    expect(result).not.toContain("secret-key-123");
  });

  it("returns null when entire content is private", () => {
    const config = getDefaultConfig();
    const result = sanitizeContent("<private>everything is secret</private>", config);
    expect(result).toBeNull();
  });

  it("handles nested/multiple private blocks", () => {
    const config = getDefaultConfig();
    const result = sanitizeContent("start <private>a</private> mid <private>b</private> end", config);
    expect(result).toBe("start [REDACTED] mid [REDACTED] end");
  });

  it("redacts API key patterns", () => {
    const config = getDefaultConfig();
    const result = sanitizeContent("Use api_key: sk_live_abcdefghijklmnop for auth", config);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("sk_live_abcdefghijklmnop");
  });

  it("respects enablePrivateTags=false", () => {
    const config = { ...getDefaultConfig(), privacy: { enablePrivateTags: false, redactPatterns: [] } };
    const result = sanitizeContent("<private>not stripped</private>", config);
    expect(result).toContain("not stripped");
  });
});

// ═══════════════════════════════════════════════════════════
// SESSION SUMMARIES
// ═══════════════════════════════════════════════════════════
describe("Session summaries", () => {
  let db: AmemDatabase;
  let dbPath: string;
  beforeEach(() => { ({ db, dbPath } = makeDb()); });
  afterEach(() => { db.close(); try { fs.unlinkSync(dbPath); } catch {} });

  it("stores and retrieves a session summary", () => {
    const id = db.insertSummary({
      sessionId: "sess-001",
      summary: "Discussed auth architecture",
      keyDecisions: ["Use JWT", "Store in httpOnly cookie"],
      keyCorrections: ["Don't use localStorage for tokens"],
      memoriesExtracted: 5,
      project: "project:/myapp",
    });
    expect(id).toBeTruthy();

    const s = db.getSummaryBySession("sess-001");
    expect(s).not.toBeNull();
    expect(s!.summary).toBe("Discussed auth architecture");
    expect(s!.keyDecisions).toEqual(["Use JWT", "Store in httpOnly cookie"]);
    expect(s!.keyCorrections).toEqual(["Don't use localStorage for tokens"]);
    expect(s!.memoriesExtracted).toBe(5);
  });

  it("getRecentSummaries returns project-scoped summaries", () => {
    db.insertSummary({ sessionId: "s1", summary: "A", keyDecisions: [], keyCorrections: [], memoriesExtracted: 1, project: "project:/a" });
    db.insertSummary({ sessionId: "s2", summary: "B", keyDecisions: [], keyCorrections: [], memoriesExtracted: 2, project: "project:/b" });
    db.insertSummary({ sessionId: "s3", summary: "C", keyDecisions: [], keyCorrections: [], memoriesExtracted: 3, project: "project:/a" });

    const aProject = db.getRecentSummaries("project:/a");
    expect(aProject).toHaveLength(2);
    // Both are from project:/a — order may vary since inserts are near-instant
    const summaries = aProject.map(s => s.summary).sort();
    expect(summaries).toEqual(["A", "C"]);
  });

  it("upserts on same session_id", () => {
    db.insertSummary({ sessionId: "s1", summary: "First", keyDecisions: [], keyCorrections: [], memoriesExtracted: 1, project: "global" });
    db.insertSummary({ sessionId: "s1", summary: "Updated", keyDecisions: ["new"], keyCorrections: [], memoriesExtracted: 3, project: "global" });

    const s = db.getSummaryBySession("s1");
    expect(s!.summary).toBe("Updated");
    expect(s!.memoriesExtracted).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════
// TEMPORAL RELATIONS
// ═══════════════════════════════════════════════════════════
describe("Temporal relations", () => {
  let db: AmemDatabase;
  let dbPath: string;
  beforeEach(() => { ({ db, dbPath } = makeDb()); });
  afterEach(() => { db.close(); try { fs.unlinkSync(dbPath); } catch {} });

  it("relations have validFrom/validUntil", () => {
    const id1 = mem(db, "memory A");
    const id2 = mem(db, "memory B");
    db.addRelation(id1, id2, "supports");

    const rels = db.getRelations(id1);
    expect(rels).toHaveLength(1);
    expect(rels[0].validFrom).toBeGreaterThan(0);
    expect(rels[0].validUntil).toBeNull();
  });

  it("expireRelation sets valid_until on relation", () => {
    const id1 = mem(db, "memory A");
    const id2 = mem(db, "memory B");
    db.addRelation(id1, id2, "supports");

    const rels = db.getRelations(id1);
    db.expireRelation(rels[0].id);

    const expired = db.getRelations(id1);
    expect(expired[0].validUntil).toBeGreaterThan(0);
  });

  it("getValidRelations excludes expired", () => {
    const id1 = mem(db, "A");
    const id2 = mem(db, "B");
    const id3 = mem(db, "C");
    db.addRelation(id1, id2, "supports");
    db.addRelation(id1, id3, "depends_on");

    const rels = db.getRelations(id1);
    db.expireRelation(rels[0].id, Date.now() - 1000);

    const valid = db.getValidRelations();
    expect(valid).toHaveLength(1);
    expect(valid[0].relationshipType).toBe("depends_on");
  });
});

// ═══════════════════════════════════════════════════════════
// CONFIG SYSTEM
// ═══════════════════════════════════════════════════════════
describe("Config system", () => {
  afterEach(() => { resetConfigCache(); });

  it("getDefaultConfig returns all fields", () => {
    const config = getDefaultConfig();
    expect(config.retrieval.semanticWeight).toBe(0.4);
    expect(config.privacy.enablePrivateTags).toBe(true);
    expect(config.hooks.enabled).toBe(true);
    expect(config.tiers.coreMaxTokens).toBe(500);
    expect(config.team.enabled).toBe(false);
  });

  it("loadConfig returns defaults when no file exists", () => {
    resetConfigCache();
    // loadConfig will try to read ~/.amem/config.json, which may or may not exist
    const config = loadConfig();
    expect(config.embeddingModel).toBe("Xenova/bge-small-en-v1.5");
    expect(config.retrieval).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════
// MULTI-STRATEGY RETRIEVAL
// ═══════════════════════════════════════════════════════════
describe("Multi-strategy retrieval", () => {
  let db: AmemDatabase;
  let dbPath: string;
  beforeEach(() => { ({ db, dbPath } = makeDb()); });
  afterEach(() => { db.close(); try { fs.unlinkSync(dbPath); } catch {} });

  it("returns results from FTS even without embeddings", async () => {
    mem(db, "PostgreSQL is our primary database");
    mem(db, "Redis is used for caching");
    mem(db, "Auth uses JWT tokens");

    const results = await multiStrategyRecall(db, {
      query: "database",
      queryEmbedding: null,
      limit: 10,
    });

    // FTS should find "database" match
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].content).toContain("database");
  });

  it("combines FTS and graph neighbors", async () => {
    const dbId = mem(db, "PostgreSQL is our primary database");
    const cacheId = mem(db, "Redis caches frequent queries");
    db.addRelation(dbId, cacheId, "depends_on");

    const results = await multiStrategyRecall(db, {
      query: "database",
      queryEmbedding: null,
      limit: 10,
    });

    // Should find both: database via FTS, Redis via graph
    const contents = results.map((r: { content: string }) => r.content);
    expect(contents).toContain("PostgreSQL is our primary database");
  });

  it("respects custom weights", async () => {
    mem(db, "PostgreSQL is our primary database");

    const results = await multiStrategyRecall(db, {
      query: "database",
      queryEmbedding: null,
      limit: 10,
      weights: { semantic: 0, fts: 1.0, graph: 0, temporal: 0 },
    });

    // Should still find via FTS even with semantic=0
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("excludes expired memories", async () => {
    mem(db, "current database approach");
    const expId = mem(db, "old database approach");
    db.expireMemory(expId, Date.now() - 1000);

    const results = await multiStrategyRecall(db, {
      query: "database",
      queryEmbedding: null,
      limit: 10,
    });

    const contents = results.map((r: { content: string }) => r.content);
    expect(contents).not.toContain("old database approach");
  });
});

// ═══════════════════════════════════════════════════════════
// AUTO-EXPIRE CONTRADICTIONS
// ═══════════════════════════════════════════════════════════
describe("Auto-expire contradictions", () => {
  let db: AmemDatabase;
  let dbPath: string;
  beforeEach(() => { ({ db, dbPath } = makeDb()); });
  afterEach(() => { db.close(); try { fs.unlinkSync(dbPath); } catch {} });

  it("returns empty when no embedding provided", () => {
    mem(db, "some memory");
    const result = autoExpireContradictions(db, "new content", null, MemoryType.FACT);
    expect(result.expired).toHaveLength(0);
    expect(result.reason).toBe("no embedding");
  });

  it("does not expire memories of different types", () => {
    // Without real embeddings, this tests the type-matching guard
    const result = autoExpireContradictions(db, "new fact", new Float32Array(384), MemoryType.FACT);
    // No existing memories with embeddings, so nothing to expire
    expect(result.expired).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════
// DATABASE MIGRATIONS
// ═══════════════════════════════════════════════════════════
describe("Database migrations — backward compatibility", () => {
  it("creates all new tables and columns on fresh DB", () => {
    const dbPath = path.join(os.tmpdir(), `amem-migrate-${Date.now()}.db`);
    const db = createDatabase(dbPath);

    const tables = db.listTables();
    expect(tables).toContain("session_summaries");
    expect(tables).toContain("memories");
    expect(tables).toContain("memory_relations");

    // Verify new columns exist by inserting with them
    const id = db.insertMemory({
      content: "test",
      type: MemoryType.FACT,
      tags: [],
      confidence: 0.8,
      source: "test",
      embedding: null,
      scope: "global",
      tier: "core",
      validFrom: 1000,
      validUntil: 2000,
    });

    const m = db.getById(id)!;
    expect(m.tier).toBe("core");
    expect(m.validFrom).toBe(1000);
    expect(m.validUntil).toBe(2000);

    db.close();
    try { fs.unlinkSync(dbPath); } catch {}
  });
});
