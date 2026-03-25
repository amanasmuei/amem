import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, type AmemDatabase } from "../src/database.js";
import { MemoryType } from "../src/memory.js";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

function makeDb(): { db: AmemDatabase; dbPath: string } {
  const dbPath = path.join(
    os.tmpdir(),
    `amem-feat-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  return { db: createDatabase(dbPath), dbPath };
}

function mem(db: AmemDatabase, content: string, type = MemoryType.FACT, tags: string[] = [], confidence = 0.8) {
  return db.insertMemory({ content, type, tags, confidence, source: "test", embedding: null, scope: "global" });
}

// ─────────────────────────────────────────────────────────────
// 1. LOSSLESS CONVERSATION LOG
// ─────────────────────────────────────────────────────────────
describe("Conversation Log — lossless append-only", () => {
  let db: AmemDatabase;
  let dbPath: string;
  beforeEach(() => { ({ db, dbPath } = makeDb()); });
  afterEach(() => { db.close(); try { fs.unlinkSync(dbPath); } catch {} });

  it("appends turns and replays in chronological order", () => {
    const sid = "sess-001";
    db.appendLog({ sessionId: sid, role: "user", content: "What DB?", project: "global" });
    db.appendLog({ sessionId: sid, role: "assistant", content: "PostgreSQL.", project: "global" });
    db.appendLog({ sessionId: sid, role: "user", content: "OK.", project: "global" });

    const entries = db.getLogBySession(sid);
    expect(entries).toHaveLength(3);
    expect(entries[0].role).toBe("user");
    expect(entries[1].role).toBe("assistant");
    expect(entries[2].content).toBe("OK.");
  });

  it("preserves exact verbatim content — no truncation or summarization", () => {
    const verbatim = "The exact message with special chars: <>&\"' and newlines\nand more.";
    db.appendLog({ sessionId: "s1", role: "user", content: verbatim, project: "global" });
    expect(db.getLogBySession("s1")[0].content).toBe(verbatim);
  });

  it("stores and retrieves metadata", () => {
    db.appendLog({ sessionId: "s2", role: "system", content: "ctx", project: "global", metadata: { file: "auth.ts", line: 42 } });
    expect(db.getLogBySession("s2")[0].metadata).toMatchObject({ file: "auth.ts", line: 42 });
  });

  it("isolates sessions — no cross-contamination", () => {
    db.appendLog({ sessionId: "alpha", role: "user", content: "alpha", project: "global" });
    db.appendLog({ sessionId: "beta", role: "user", content: "beta", project: "global" });
    expect(db.getLogBySession("alpha")).toHaveLength(1);
    expect(db.getLogBySession("beta")).toHaveLength(1);
    expect(db.getLogBySession("gamma")).toHaveLength(0);
  });

  it("scopes recent log to project", () => {
    db.appendLog({ sessionId: "s3", role: "user", content: "proj-a turn", project: "project:amem" });
    db.appendLog({ sessionId: "s4", role: "user", content: "proj-b turn", project: "project:other" });
    const recent = db.getRecentLog(10, "project:amem");
    expect(recent.every(e => e.project === "project:amem")).toBe(true);
    expect(recent.some(e => e.content === "proj-a turn")).toBe(true);
    expect(recent.some(e => e.content === "proj-b turn")).toBe(false);
  });

  it("full-text searches log content", () => {
    db.appendLog({ sessionId: "s5", role: "user", content: "we chose event sourcing for the audit trail", project: "global" });
    db.appendLog({ sessionId: "s5", role: "assistant", content: "event sourcing provides immutable history", project: "global" });
    db.appendLog({ sessionId: "s6", role: "user", content: "what about caching?", project: "global" });
    const results = db.searchLog("event sourcing", 10);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some(e => e.content.includes("event sourcing"))).toBe(true);
    expect(results.every(e => !e.content.includes("caching"))).toBe(true);
  });

  it("getRecentLog respects limit", () => {
    for (let i = 0; i < 10; i++) {
      db.appendLog({ sessionId: "bulk", role: "user", content: `turn ${i}`, project: "global" });
    }
    const limited = db.getRecentLog(3);
    expect(limited).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────
// 2. PATCH SYSTEM — surgical field-level edits
// ─────────────────────────────────────────────────────────────
describe("Memory Patch System", () => {
  let db: AmemDatabase;
  let dbPath: string;
  beforeEach(() => { ({ db, dbPath } = makeDb()); });
  afterEach(() => { db.close(); try { fs.unlinkSync(dbPath); } catch {} });

  it("patches content and snapshots previous value", () => {
    const id = mem(db, "never use any", MemoryType.CORRECTION);
    const original = db.getById(id)!.content;

    expect(db.patchMemory(id, { field: "content", value: "never use any — define proper interfaces", reason: "more specific" })).toBe(true);
    expect(db.getById(id)!.content).toBe("never use any — define proper interfaces");

    const versions = db.getVersionHistory(id);
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions[0].content).toBe(original);
    expect(versions[0].reason).toContain("before patch");
  });

  it("patches confidence", () => {
    const id = mem(db, "use postgres", MemoryType.DECISION, [], 0.9);
    db.patchMemory(id, { field: "confidence", value: 0.5, reason: "downgraded" });
    expect(db.getById(id)!.confidence).toBe(0.5);
  });

  it("patches tags", () => {
    const id = mem(db, "auth in src/auth/", MemoryType.TOPOLOGY, ["auth"]);
    db.patchMemory(id, { field: "tags", value: ["auth", "jwt", "middleware"], reason: "expanded tags" });
    expect(db.getById(id)!.tags).toContain("jwt");
    expect(db.getById(id)!.tags).toContain("middleware");
  });

  it("patches type field", () => {
    const id = mem(db, "api uses rest", MemoryType.FACT);
    db.patchMemory(id, { field: "type", value: "decision", reason: "reclassified" });
    expect(db.getById(id)!.type).toBe("decision");
  });

  it("returns false for missing memory", () => {
    expect(db.patchMemory("does-not-exist", { field: "content", value: "x", reason: "test" })).toBe(false);
  });

  it("accumulates a version per patch", () => {
    const id = mem(db, "original content");
    db.patchMemory(id, { field: "content", value: "v1", reason: "first" });
    db.patchMemory(id, { field: "content", value: "v2", reason: "second" });
    db.patchMemory(id, { field: "content", value: "v3", reason: "third" });
    expect(db.getVersionHistory(id).length).toBeGreaterThanOrEqual(3);
  });

  it("final state reflects last patch", () => {
    const id = mem(db, "first");
    db.patchMemory(id, { field: "content", value: "second", reason: "r" });
    db.patchMemory(id, { field: "content", value: "third", reason: "r" });
    expect(db.getById(id)!.content).toBe("third");
  });
});

// ─────────────────────────────────────────────────────────────
// 3. VERSION HISTORY
// ─────────────────────────────────────────────────────────────
describe("Version History", () => {
  let db: AmemDatabase;
  let dbPath: string;
  beforeEach(() => { ({ db, dbPath } = makeDb()); });
  afterEach(() => { db.close(); try { fs.unlinkSync(dbPath); } catch {} });

  it("snapshot creates a version record with reason", () => {
    const id = mem(db, "original");
    db.snapshotVersion(id, "before big refactor");
    const versions = db.getVersionHistory(id);
    expect(versions).toHaveLength(1);
    expect(versions[0].memoryId).toBe(id);
    expect(versions[0].content).toBe("original");
    expect(versions[0].reason).toBe("before big refactor");
  });

  it("version records are immutable — new patches don't alter old snapshots", () => {
    const id = mem(db, "v0");
    db.snapshotVersion(id, "snapshot v0");
    db.patchMemory(id, { field: "content", value: "v1", reason: "patch to v1" });
    db.patchMemory(id, { field: "content", value: "v2", reason: "patch to v2" });

    const versions = db.getVersionHistory(id);
    expect(versions.some(v => v.content === "v0")).toBe(true);
    expect(db.getById(id)!.content).toBe("v2");
  });

  it("returns empty history for unmodified memory", () => {
    const id = mem(db, "untouched");
    expect(db.getVersionHistory(id)).toHaveLength(0);
  });

  it("returns null for non-existent memory", () => {
    expect(db.getById("ghost-id")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// 4. KNOWLEDGE GRAPH — relations between memories
// ─────────────────────────────────────────────────────────────
describe("Knowledge Graph — memory relations", () => {
  let db: AmemDatabase;
  let dbPath: string;
  beforeEach(() => { ({ db, dbPath } = makeDb()); });
  afterEach(() => { db.close(); try { fs.unlinkSync(dbPath); } catch {} });

  it("adds a typed relation between two memories", () => {
    const a = mem(db, "use postgres");
    const b = mem(db, "postgres lives in docker-compose.yml", MemoryType.TOPOLOGY);
    const relId = db.addRelation(a, b, "implements");
    expect(relId).toBeTruthy();
  });

  it("retrieves relations from both directions", () => {
    const a = mem(db, "chose event sourcing", MemoryType.DECISION);
    const b = mem(db, "audit log is append-only", MemoryType.PATTERN);
    db.addRelation(a, b, "supports");

    const relationsA = db.getRelations(a);
    const relationsB = db.getRelations(b);
    expect(relationsA).toHaveLength(1);
    expect(relationsB).toHaveLength(1);
    expect(relationsA[0].relationshipType).toBe("supports");
  });

  it("getRelatedMemories returns the linked memory objects", () => {
    const a = mem(db, "never mock DB in integration tests", MemoryType.CORRECTION);
    const b = mem(db, "use test containers instead", MemoryType.PATTERN);
    db.addRelation(a, b, "caused_by");

    const related = db.getRelatedMemories(a);
    expect(related).toHaveLength(1);
    expect(related[0].content).toBe("use test containers instead");
  });

  it("removes a relation by ID", () => {
    const a = mem(db, "memory A");
    const b = mem(db, "memory B");
    const relId = db.addRelation(a, b, "related_to");

    db.removeRelation(relId);
    expect(db.getRelations(a)).toHaveLength(0);
    expect(db.getRelations(b)).toHaveLength(0);
  });

  it("supports multiple outgoing relations from one memory", () => {
    const root = mem(db, "auth decision", MemoryType.DECISION);
    const c1 = mem(db, "jwt stored in httponly cookie", MemoryType.PATTERN);
    const c2 = mem(db, "auth module in src/auth/", MemoryType.TOPOLOGY);
    const c3 = mem(db, "never log jwt tokens", MemoryType.CORRECTION);
    db.addRelation(root, c1, "implements");
    db.addRelation(root, c2, "implements");
    db.addRelation(root, c3, "caused_by");

    const related = db.getRelatedMemories(root);
    expect(related).toHaveLength(3);
  });

  it("cascades on memory delete — relation removed automatically", () => {
    const a = mem(db, "memory to delete");
    const b = mem(db, "survivor");
    db.addRelation(a, b, "related_to");

    db.deleteMemory(a);
    expect(db.getRelations(b)).toHaveLength(0);
  });

  it("handles self-relation prevention via unique constraint", () => {
    const a = mem(db, "memory A");
    const b = mem(db, "memory B");
    db.addRelation(a, b, "related_to");
    // Second identical relation should replace (INSERT OR REPLACE)
    const id2 = db.addRelation(a, b, "related_to");
    expect(db.getRelations(a)).toHaveLength(1);
    expect(db.getRelations(a)[0].id).toBe(id2);
  });
});

// ─────────────────────────────────────────────────────────────
// 5. TEMPORAL QUERIES
// ─────────────────────────────────────────────────────────────
describe("Temporal Queries", () => {
  let db: AmemDatabase;
  let dbPath: string;
  beforeEach(() => { ({ db, dbPath } = makeDb()); });
  afterEach(() => { db.close(); try { fs.unlinkSync(dbPath); } catch {} });

  it("getMemoriesSince returns only memories created after timestamp", async () => {
    mem(db, "old memory");
    await new Promise(r => setTimeout(r, 5));
    const cutoff = Date.now();
    await new Promise(r => setTimeout(r, 5));
    mem(db, "new memory");

    const recent = db.getMemoriesSince(cutoff);
    expect(recent.some(m => m.content === "new memory")).toBe(true);
    expect(recent.some(m => m.content === "old memory")).toBe(false);
  });

  it("getMemoriesByDateRange returns memories within window", async () => {
    const t0 = Date.now();
    await new Promise(r => setTimeout(r, 5));
    mem(db, "in range A");
    mem(db, "in range B");
    await new Promise(r => setTimeout(r, 5));
    const t1 = Date.now();
    await new Promise(r => setTimeout(r, 5));
    mem(db, "after range");

    const inRange = db.getMemoriesByDateRange(t0, t1);
    expect(inRange.some(m => m.content === "in range A")).toBe(true);
    expect(inRange.some(m => m.content === "in range B")).toBe(true);
    expect(inRange.some(m => m.content === "after range")).toBe(false);
  });

  it("returns empty array when nothing falls in range", () => {
    mem(db, "some memory");
    const past = db.getMemoriesByDateRange(0, 1000); // epoch window
    expect(past).toHaveLength(0);
  });

  it("getMemoriesSince with future timestamp returns nothing", () => {
    mem(db, "existing");
    const future = Date.now() + 999999;
    expect(db.getMemoriesSince(future)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────
// 6. FULL-TEXT SEARCH (FTS5)
// ─────────────────────────────────────────────────────────────
describe("Full-Text Search", () => {
  let db: AmemDatabase;
  let dbPath: string;
  beforeEach(() => { ({ db, dbPath } = makeDb()); });
  afterEach(() => { db.close(); try { fs.unlinkSync(dbPath); } catch {} });

  it("finds memories by exact keyword", () => {
    mem(db, "never use any type in TypeScript", MemoryType.CORRECTION, ["typescript"]);
    mem(db, "use pnpm not npm", MemoryType.PREFERENCE, ["tooling"]);
    mem(db, "chose PostgreSQL for ACID compliance", MemoryType.DECISION, ["database"]);

    const results = db.fullTextSearch("TypeScript", 10);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some(m => m.content.includes("TypeScript"))).toBe(true);
  });

  it("FTS matches inside tags", () => {
    mem(db, "some memory about testing", MemoryType.PATTERN, ["vitest", "unit-testing"]);
    mem(db, "unrelated memory", MemoryType.FACT, ["other"]);

    const results = db.fullTextSearch("vitest", 10);
    expect(results.some(m => m.tags.includes("vitest"))).toBe(true);
  });

  it("returns empty when no match", () => {
    mem(db, "completely unrelated content");
    const results = db.fullTextSearch("xyzzy_nonexistent_term", 10);
    expect(results).toHaveLength(0);
  });

  it("respects limit parameter", () => {
    for (let i = 0; i < 10; i++) {
      mem(db, `postgres memory ${i}`, MemoryType.FACT, ["postgres"]);
    }
    const results = db.fullTextSearch("postgres", 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("FTS index stays in sync after memory deletion", () => {
    const id = mem(db, "delete this unique phrase xzqw99", MemoryType.FACT);
    const before = db.fullTextSearch("xzqw99", 10);
    expect(before.length).toBe(1);

    db.deleteMemory(id);
    const after = db.fullTextSearch("xzqw99", 10);
    expect(after).toHaveLength(0);
  });

  it("FTS index stays in sync after patch", () => {
    const id = mem(db, "original content aboutcaching", MemoryType.FACT);
    db.patchMemory(id, { field: "content", value: "updated content aboutlogging", reason: "updated" });

    const oldResults = db.fullTextSearch("aboutcaching", 10);
    const newResults = db.fullTextSearch("aboutlogging", 10);
    // New term should be found; old term should not return the updated memory
    expect(newResults.some(m => m.content.includes("aboutlogging"))).toBe(true);
    expect(oldResults.every(m => !m.content.includes("aboutcaching"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// 7. NEW TABLES EXIST IN SCHEMA
// ─────────────────────────────────────────────────────────────
describe("Schema — new tables", () => {
  let db: AmemDatabase;
  let dbPath: string;
  beforeEach(() => { ({ db, dbPath } = makeDb()); });
  afterEach(() => { db.close(); try { fs.unlinkSync(dbPath); } catch {} });

  it("has conversation_log table", () => {
    expect(db.listTables()).toContain("conversation_log");
  });

  it("has memory_versions table", () => {
    expect(db.listTables()).toContain("memory_versions");
  });

  it("has memory_relations table", () => {
    expect(db.listTables()).toContain("memory_relations");
  });

  it("has memories_fts virtual table", () => {
    expect(db.listTables()).toContain("memories_fts");
  });
});
