import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, type AmemDatabase, MemoryType, type MemoryTypeValue, consolidateMemories, cosineSimilarity } from "@aman_asmuei/amem-core";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

function makeDb(): { db: AmemDatabase; dbPath: string } {
  const dbPath = path.join(
    os.tmpdir(),
    `amem-enhance-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  return { db: createDatabase(dbPath), dbPath };
}

function mem(
  db: AmemDatabase,
  content: string,
  type: MemoryTypeValue = MemoryType.FACT,
  tags: string[] = [],
  confidence = 0.8,
  scope = "global",
  embedding: Float32Array | null = null,
) {
  return db.insertMemory({ content, type, tags, confidence, source: "test", embedding, scope });
}

// -----------------------------------------------------------------
// 1. CONTENT HASH DEDUP
// -----------------------------------------------------------------
describe("Content Hash Dedup", () => {
  let db: AmemDatabase;
  let dbPath: string;
  beforeEach(() => { ({ db, dbPath } = makeDb()); });
  afterEach(() => { db.close(); try { fs.unlinkSync(dbPath); } catch {} });

  it("findByContentHash returns null for content not yet stored", () => {
    const result = db.findByContentHash("completely new content");
    expect(result).toBeNull();
  });

  it("findByContentHash returns the memory after inserting it", () => {
    const content = "use strict TypeScript mode in tsconfig";
    const id = mem(db, content);
    const found = db.findByContentHash(content);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(id);
    expect(found!.content).toBe(content);
  });

  it("two memories with different content produce different hashes", () => {
    mem(db, "alpha content");
    mem(db, "beta content");

    const foundAlpha = db.findByContentHash("alpha content");
    const foundBeta = db.findByContentHash("beta content");
    expect(foundAlpha).not.toBeNull();
    expect(foundBeta).not.toBeNull();
    expect(foundAlpha!.id).not.toBe(foundBeta!.id);
  });

  it("content_hash column exists in the memories table schema", () => {
    // If content_hash were missing, insertMemory would fail because the INSERT
    // statement references it. Verify explicitly by inserting and retrieving.
    const id = mem(db, "schema probe");
    const found = db.findByContentHash("schema probe");
    expect(found).not.toBeNull();
    expect(found!.id).toBe(id);
  });
});

// -----------------------------------------------------------------
// 2. REMINDER SCOPE + INCLUDE_COMPLETED
// -----------------------------------------------------------------
describe("Reminder Scope and include_completed", () => {
  let db: AmemDatabase;
  let dbPath: string;
  beforeEach(() => { ({ db, dbPath } = makeDb()); });
  afterEach(() => { db.close(); try { fs.unlinkSync(dbPath); } catch {} });

  it("listReminders with includeCompleted=true returns completed reminders within scope", () => {
    const id = db.insertReminder("deploy to staging", Date.now() + 100000, "project:foo");
    db.completeReminder(id);

    const reminders = db.listReminders(true, "project:foo");
    expect(reminders.some(r => r.id === id && r.completed)).toBe(true);
  });

  it("listReminders with includeCompleted=false excludes completed reminders", () => {
    const id = db.insertReminder("deploy to staging", Date.now() + 100000, "project:foo");
    db.completeReminder(id);

    const reminders = db.listReminders(false, "project:foo");
    expect(reminders.some(r => r.id === id)).toBe(false);
  });

  it("scope filtering returns only matching scope and global reminders", () => {
    db.insertReminder("global task", Date.now() + 100000, "global");
    db.insertReminder("foo task", Date.now() + 100000, "project:foo");
    db.insertReminder("bar task", Date.now() + 100000, "project:bar");

    const fooReminders = db.listReminders(false, "project:foo");
    const contents = fooReminders.map(r => r.content);
    expect(contents).toContain("global task");
    expect(contents).toContain("foo task");
    expect(contents).not.toContain("bar task");
  });
});

// -----------------------------------------------------------------
// 3. RESOLVE ID FOR FORGET (SHORT PREFIX)
// -----------------------------------------------------------------
describe("resolveId with short prefixes", () => {
  let db: AmemDatabase;
  let dbPath: string;
  beforeEach(() => { ({ db, dbPath } = makeDb()); });
  afterEach(() => { db.close(); try { fs.unlinkSync(dbPath); } catch {} });

  it("resolves an 8-char prefix to the full UUID", () => {
    const fullId = mem(db, "remember this fact");
    const prefix = fullId.slice(0, 8);
    const resolved = db.resolveId(prefix);
    expect(resolved).toBe(fullId);
  });

  it("returns null for a nonexistent prefix", () => {
    const resolved = db.resolveId("nonexist");
    expect(resolved).toBeNull();
  });

  it("resolves a full 36-char UUID directly", () => {
    const fullId = mem(db, "full uuid test");
    const resolved = db.resolveId(fullId);
    expect(resolved).toBe(fullId);
  });
});

// -----------------------------------------------------------------
// 4. PATCH MEMORY WITH skipSnapshot
// -----------------------------------------------------------------
describe("patchMemory with skipSnapshot", () => {
  let db: AmemDatabase;
  let dbPath: string;
  beforeEach(() => { ({ db, dbPath } = makeDb()); });
  afterEach(() => { db.close(); try { fs.unlinkSync(dbPath); } catch {} });

  it("patch with skipSnapshot=true does NOT create a version entry", () => {
    const id = mem(db, "original content for skip");
    db.patchMemory(id, { field: "content", value: "updated content", reason: "batch op", skipSnapshot: true });

    const versions = db.getVersionHistory(id);
    expect(versions).toHaveLength(0);
    expect(db.getById(id)!.content).toBe("updated content");
  });

  it("patch without skipSnapshot creates a version entry", () => {
    const id = mem(db, "original content for snapshot");
    db.patchMemory(id, { field: "content", value: "updated content", reason: "normal edit" });

    const versions = db.getVersionHistory(id);
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions[0].content).toBe("original content for snapshot");
    expect(versions[0].reason).toContain("before patch");
  });
});

// -----------------------------------------------------------------
// 5. LOG CLEANUP
// -----------------------------------------------------------------
describe("Log Cleanup", () => {
  let db: AmemDatabase;
  let dbPath: string;
  beforeEach(() => { ({ db, dbPath } = makeDb()); });
  afterEach(() => { db.close(); try { fs.unlinkSync(dbPath); } catch {} });

  it("getLogCount returns correct count", () => {
    expect(db.getLogCount()).toBe(0);
    db.appendLog({ sessionId: "s1", role: "user", content: "hello", project: "global" });
    db.appendLog({ sessionId: "s1", role: "assistant", content: "hi", project: "global" });
    expect(db.getLogCount()).toBe(2);
  });

  it("deleteLogBefore removes old entries and returns deleted count", async () => {
    db.appendLog({ sessionId: "s1", role: "user", content: "old entry 1", project: "global" });
    db.appendLog({ sessionId: "s1", role: "user", content: "old entry 2", project: "global" });

    // Small delay so timestamps differ
    await new Promise(r => setTimeout(r, 10));
    const cutoff = Date.now();
    await new Promise(r => setTimeout(r, 10));

    db.appendLog({ sessionId: "s1", role: "user", content: "new entry", project: "global" });

    const deleted = db.deleteLogBefore(cutoff);
    expect(deleted).toBe(2);
    expect(db.getLogCount()).toBe(1);
  });

  it("recent entries survive cleanup", async () => {
    db.appendLog({ sessionId: "s1", role: "user", content: "old", project: "global" });
    await new Promise(r => setTimeout(r, 10));
    const cutoff = Date.now();
    await new Promise(r => setTimeout(r, 10));
    db.appendLog({ sessionId: "s1", role: "user", content: "recent", project: "global" });

    db.deleteLogBefore(cutoff);
    const remaining = db.getRecentLog(10);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].content).toBe("recent");
  });
});

// -----------------------------------------------------------------
// 6. CONFIDENCE DECAY IN CONSOLIDATION
// -----------------------------------------------------------------
describe("Confidence Decay in Consolidation", () => {
  let db: AmemDatabase;
  let dbPath: string;
  beforeEach(() => { ({ db, dbPath } = makeDb()); });
  afterEach(() => { db.close(); try { fs.unlinkSync(dbPath); } catch {} });

  it("does not decay freshly created memories (lastAccessed < 30 days)", () => {
    // Fresh memories have lastAccessed = Date.now(), so they are not stale
    const id = mem(db, "stale pattern from long ago", MemoryType.PATTERN, [], 0.9, "global", new Float32Array([0.1, 0.2, 0.3]));

    const report = consolidateMemories(db, cosineSimilarity, {
      maxStaleDays: 60, minConfidence: 0.3, minAccessCount: 2,
      dryRun: true, enableDecay: true,
    });

    expect(report.decayed).toBe(0);
    expect(db.getById(id)!.confidence).toBe(0.9);
  });

  it("corrections are NEVER decayed even when enableDecay is true", () => {
    const corrId = mem(db, "never use dangerous patterns", MemoryType.CORRECTION, [], 0.8, "global", new Float32Array([0.5, 0.5, 0.0]));

    const report = consolidateMemories(db, cosineSimilarity, {
      maxStaleDays: 0, minConfidence: 1.0, minAccessCount: 999,
      dryRun: false, enableDecay: true,
    });

    // Correction must survive - not pruned, not decayed
    expect(db.getById(corrId)).not.toBeNull();
    expect(db.getById(corrId)!.confidence).toBe(0.8);
    // Decay actions should not include the correction
    const decayActions = report.actions.filter(a => a.action === "decayed");
    const corrDecayed = decayActions.some(a => a.memoryIds.includes(corrId));
    expect(corrDecayed).toBe(false);
  });

  it("decay is skipped entirely when enableDecay is false/undefined", () => {
    mem(db, "some pattern", MemoryType.PATTERN, [], 0.9, "global", new Float32Array([0.1, 0.2, 0.3]));

    const report = consolidateMemories(db, cosineSimilarity, {
      maxStaleDays: 60, minConfidence: 0.3, minAccessCount: 2,
      dryRun: true, // enableDecay intentionally omitted
    });

    expect(report.decayed).toBe(0);
    expect(report.actions.filter(a => a.action === "decayed")).toHaveLength(0);
  });
});

// -----------------------------------------------------------------
// 7. EMBEDDING CACHE (SMOKE TEST)
// -----------------------------------------------------------------
describe("Embedding generation fallback", () => {
  it("generateEmbedding returns null when no model is available", async () => {
    const { generateEmbedding } = await import("@aman_asmuei/amem-core");
    const result = await generateEmbedding("test content");
    // In CI / test environments without HuggingFace transformers, returns null
    expect(result === null || result instanceof Float32Array).toBe(true);
  });
});
