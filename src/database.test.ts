import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, type AmemDatabase } from "./database.js";

let db: AmemDatabase;

beforeEach(() => {
  db = createDatabase(":memory:");
});

afterEach(() => {
  db.close();
});

describe("schema creation", () => {
  it("creates all expected tables", () => {
    const tables = db.listTables();
    expect(tables).toContain("memories");
    expect(tables).toContain("conversation_log");
    expect(tables).toContain("memory_versions");
    expect(tables).toContain("memory_relations");
    expect(tables).toContain("reminders");
  });
});

describe("insertMemory / getById", () => {
  it("stores a memory and retrieves it by ID", () => {
    const id = db.insertMemory({
      content: "Use pnpm not npm",
      type: "preference",
      tags: ["tooling"],
      confidence: 0.9,
      source: "conversation",
      embedding: null,
      scope: "global",
    });

    expect(id).toBeTruthy();
    const mem = db.getById(id);
    expect(mem).not.toBeNull();
    expect(mem!.content).toBe("Use pnpm not npm");
    expect(mem!.type).toBe("preference");
    expect(mem!.tags).toEqual(["tooling"]);
    expect(mem!.confidence).toBe(0.9);
    expect(mem!.source).toBe("conversation");
    expect(mem!.scope).toBe("global");
    expect(mem!.accessCount).toBe(0);
    expect(mem!.embedding).toBeNull();
  });

  it("stores and retrieves an embedding", () => {
    const embedding = new Float32Array([0.1, 0.2, 0.3]);
    const id = db.insertMemory({
      content: "test embedding",
      type: "fact",
      tags: [],
      confidence: 0.5,
      source: "test",
      embedding,
      scope: "global",
    });

    const mem = db.getById(id);
    expect(mem!.embedding).toBeInstanceOf(Float32Array);
    expect(mem!.embedding!.length).toBe(3);
    expect(mem!.embedding![0]).toBeCloseTo(0.1);
    expect(mem!.embedding![1]).toBeCloseTo(0.2);
    expect(mem!.embedding![2]).toBeCloseTo(0.3);
  });

  it("returns null for nonexistent ID", () => {
    expect(db.getById("nonexistent")).toBeNull();
  });
});

describe("searchByType", () => {
  it("filters memories by type", () => {
    db.insertMemory({ content: "c1", type: "correction", tags: [], confidence: 1, source: "t", embedding: null, scope: "global" });
    db.insertMemory({ content: "d1", type: "decision", tags: [], confidence: 0.9, source: "t", embedding: null, scope: "global" });
    db.insertMemory({ content: "c2", type: "correction", tags: [], confidence: 1, source: "t", embedding: null, scope: "global" });

    const corrections = db.searchByType("correction");
    expect(corrections).toHaveLength(2);
    expect(corrections.every(m => m.type === "correction")).toBe(true);
  });
});

describe("searchByTag", () => {
  it("filters memories by tag", () => {
    db.insertMemory({ content: "a", type: "fact", tags: ["typescript", "testing"], confidence: 0.5, source: "t", embedding: null, scope: "global" });
    db.insertMemory({ content: "b", type: "fact", tags: ["rust"], confidence: 0.5, source: "t", embedding: null, scope: "global" });

    const results = db.searchByTag("typescript");
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe("a");
  });
});

describe("fullTextSearch", () => {
  it("finds memories by content keywords", () => {
    db.insertMemory({ content: "Always use Tailwind for styling", type: "preference", tags: [], confidence: 0.8, source: "t", embedding: null, scope: "global" });
    db.insertMemory({ content: "Database schema uses SQLite", type: "fact", tags: [], confidence: 0.6, source: "t", embedding: null, scope: "global" });

    const results = db.fullTextSearch("Tailwind");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].content).toContain("Tailwind");
  });

  it("scoped search filters by project", () => {
    db.insertMemory({ content: "Global memory", type: "fact", tags: [], confidence: 0.6, source: "t", embedding: null, scope: "global" });
    db.insertMemory({ content: "Project specific memory", type: "fact", tags: [], confidence: 0.6, source: "t", embedding: null, scope: "project:foo" });

    const results = db.fullTextSearch("memory", 20, "project:foo");
    // Should include both global and project:foo
    const scopes = results.map(r => r.scope);
    for (const s of scopes) {
      expect(["global", "project:foo"]).toContain(s);
    }
  });
});

describe("updateConfidence", () => {
  it("updates confidence and increments access count", () => {
    const id = db.insertMemory({ content: "x", type: "fact", tags: [], confidence: 0.5, source: "t", embedding: null, scope: "global" });
    db.updateConfidence(id, 0.9);

    const mem = db.getById(id);
    expect(mem!.confidence).toBe(0.9);
    expect(mem!.accessCount).toBe(1);
  });
});

describe("deleteMemory", () => {
  it("removes a memory", () => {
    const id = db.insertMemory({ content: "to delete", type: "fact", tags: [], confidence: 0.5, source: "t", embedding: null, scope: "global" });
    expect(db.getById(id)).not.toBeNull();

    db.deleteMemory(id);
    expect(db.getById(id)).toBeNull();
  });
});

describe("getStats", () => {
  it("returns correct totals and type breakdown", () => {
    db.insertMemory({ content: "c", type: "correction", tags: [], confidence: 1, source: "t", embedding: null, scope: "global" });
    db.insertMemory({ content: "d", type: "decision", tags: [], confidence: 0.9, source: "t", embedding: null, scope: "global" });
    db.insertMemory({ content: "d2", type: "decision", tags: [], confidence: 0.85, source: "t", embedding: null, scope: "global" });

    const stats = db.getStats();
    expect(stats.total).toBe(3);
    expect(stats.byType["correction"]).toBe(1);
    expect(stats.byType["decision"]).toBe(2);
  });
});

describe("version history", () => {
  it("snapshots and retrieves versions", () => {
    const id = db.insertMemory({ content: "original content", type: "fact", tags: [], confidence: 0.8, source: "t", embedding: null, scope: "global" });

    db.snapshotVersion(id, "initial snapshot");
    const versions = db.getVersionHistory(id);
    expect(versions).toHaveLength(1);
    expect(versions[0].content).toBe("original content");
    expect(versions[0].confidence).toBe(0.8);
    expect(versions[0].reason).toBe("initial snapshot");
    expect(versions[0].memoryId).toBe(id);
  });

  it("patchMemory creates a version snapshot before patching", () => {
    const id = db.insertMemory({ content: "old content", type: "fact", tags: ["a"], confidence: 0.7, source: "t", embedding: null, scope: "global" });

    const success = db.patchMemory(id, { field: "content", value: "new content", reason: "updated info" });
    expect(success).toBe(true);

    const mem = db.getById(id);
    expect(mem!.content).toBe("new content");

    const versions = db.getVersionHistory(id);
    expect(versions).toHaveLength(1);
    expect(versions[0].content).toBe("old content");
    expect(versions[0].reason).toContain("before patch: updated info");
  });

  it("patchMemory updates confidence", () => {
    const id = db.insertMemory({ content: "x", type: "fact", tags: [], confidence: 0.5, source: "t", embedding: null, scope: "global" });

    db.patchMemory(id, { field: "confidence", value: 0.95, reason: "validated" });
    const mem = db.getById(id);
    expect(mem!.confidence).toBe(0.95);
  });

  it("patchMemory updates tags", () => {
    const id = db.insertMemory({ content: "x", type: "fact", tags: ["old"], confidence: 0.5, source: "t", embedding: null, scope: "global" });

    db.patchMemory(id, { field: "tags", value: ["new", "tags"], reason: "retagged" });
    const mem = db.getById(id);
    expect(mem!.tags).toEqual(["new", "tags"]);
  });

  it("patchMemory updates type", () => {
    const id = db.insertMemory({ content: "x", type: "fact", tags: [], confidence: 0.5, source: "t", embedding: null, scope: "global" });

    db.patchMemory(id, { field: "type", value: "decision", reason: "reclassified" });
    const mem = db.getById(id);
    expect(mem!.type).toBe("decision");
  });

  it("patchMemory returns false for nonexistent ID", () => {
    const success = db.patchMemory("nonexistent-id", { field: "content", value: "x", reason: "test" });
    expect(success).toBe(false);
  });
});

describe("relations (knowledge graph)", () => {
  it("creates and queries relations", () => {
    const id1 = db.insertMemory({ content: "memory A", type: "decision", tags: [], confidence: 0.9, source: "t", embedding: null, scope: "global" });
    const id2 = db.insertMemory({ content: "memory B", type: "pattern", tags: [], confidence: 0.7, source: "t", embedding: null, scope: "global" });

    const relId = db.addRelation(id1, id2, "supports", 0.9);
    expect(relId).toBeTruthy();

    const relations = db.getRelations(id1);
    expect(relations).toHaveLength(1);
    expect(relations[0].fromId).toBe(id1);
    expect(relations[0].toId).toBe(id2);
    expect(relations[0].relationshipType).toBe("supports");
    expect(relations[0].strength).toBe(0.9);
  });

  it("getRelations returns both directions", () => {
    const id1 = db.insertMemory({ content: "A", type: "fact", tags: [], confidence: 0.5, source: "t", embedding: null, scope: "global" });
    const id2 = db.insertMemory({ content: "B", type: "fact", tags: [], confidence: 0.5, source: "t", embedding: null, scope: "global" });
    const id3 = db.insertMemory({ content: "C", type: "fact", tags: [], confidence: 0.5, source: "t", embedding: null, scope: "global" });

    db.addRelation(id1, id2, "relates");
    db.addRelation(id3, id1, "depends_on");

    const relations = db.getRelations(id1);
    expect(relations).toHaveLength(2);
  });

  it("getRelatedMemories returns the related Memory objects", () => {
    const id1 = db.insertMemory({ content: "A", type: "fact", tags: [], confidence: 0.5, source: "t", embedding: null, scope: "global" });
    const id2 = db.insertMemory({ content: "B", type: "fact", tags: [], confidence: 0.5, source: "t", embedding: null, scope: "global" });

    db.addRelation(id1, id2, "supports");

    const related = db.getRelatedMemories(id1);
    expect(related).toHaveLength(1);
    expect(related[0].content).toBe("B");
  });

  it("removeRelation deletes a relation", () => {
    const id1 = db.insertMemory({ content: "A", type: "fact", tags: [], confidence: 0.5, source: "t", embedding: null, scope: "global" });
    const id2 = db.insertMemory({ content: "B", type: "fact", tags: [], confidence: 0.5, source: "t", embedding: null, scope: "global" });

    const relId = db.addRelation(id1, id2, "supports");
    db.removeRelation(relId);

    expect(db.getRelations(id1)).toHaveLength(0);
  });
});

describe("temporal queries", () => {
  it("getMemoriesSince returns memories after timestamp", () => {
    const before = Date.now() - 1000;
    db.insertMemory({ content: "recent", type: "fact", tags: [], confidence: 0.5, source: "t", embedding: null, scope: "global" });

    const results = db.getMemoriesSince(before);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].content).toBe("recent");
  });

  it("getMemoriesByDateRange returns memories within range", () => {
    const now = Date.now();
    db.insertMemory({ content: "in range", type: "fact", tags: [], confidence: 0.5, source: "t", embedding: null, scope: "global" });

    const results = db.getMemoriesByDateRange(now - 1000, now + 1000);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});

describe("conversation log", () => {
  it("appends and retrieves log entries", () => {
    const id = db.appendLog({
      sessionId: "session-1",
      role: "user",
      content: "Hello world",
      project: "test-project",
    });
    expect(id).toBeTruthy();

    const entries = db.getLogBySession("session-1");
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe("Hello world");
    expect(entries[0].role).toBe("user");
    expect(entries[0].project).toBe("test-project");
  });

  it("getRecentLog returns entries in descending order", () => {
    db.appendLog({ sessionId: "s1", role: "user", content: "first", project: "p" });
    db.appendLog({ sessionId: "s1", role: "assistant", content: "second", project: "p" });

    const recent = db.getRecentLog(10);
    expect(recent).toHaveLength(2);
    // Most recent first
    expect(recent[0].content).toBe("second");
  });
});

describe("reminders", () => {
  it("inserts and lists reminders", () => {
    const id = db.insertReminder("Review PR", Date.now() + 86400000, "global");
    expect(id).toBeTruthy();

    const reminders = db.listReminders();
    expect(reminders).toHaveLength(1);
    expect(reminders[0].content).toBe("Review PR");
    expect(reminders[0].completed).toBe(false);
  });

  it("completes a reminder", () => {
    const id = db.insertReminder("Do thing", null, "global");
    const success = db.completeReminder(id);
    expect(success).toBe(true);

    // Completed reminders excluded by default
    const reminders = db.listReminders();
    expect(reminders).toHaveLength(0);

    // But included when requested
    const all = db.listReminders(true);
    expect(all).toHaveLength(1);
    expect(all[0].completed).toBe(true);
  });
});
