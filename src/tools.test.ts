import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createDatabase, type AmemDatabase, recallMemories, detectConflict, type MemoryTypeValue } from "@aman_asmuei/amem-core";
import { formatAge, TYPE_ORDER } from "./tools/index.js";

/**
 * Since registerTools requires an McpServer instance (complex to mock),
 * we test the underlying logic that tools invoke: database operations,
 * recallMemories, detectConflict, formatAge, and TYPE_ORDER.
 * This exercises the same critical paths the tool handlers do.
 */

let db: AmemDatabase;

beforeEach(() => {
  db = createDatabase(":memory:");
});

afterEach(() => {
  db.close();
});

describe("TYPE_ORDER", () => {
  it("puts corrections first, then decisions", () => {
    expect(TYPE_ORDER[0]).toBe("correction");
    expect(TYPE_ORDER[1]).toBe("decision");
  });

  it("contains all 6 types", () => {
    expect(TYPE_ORDER).toHaveLength(6);
    expect(TYPE_ORDER).toContain("correction");
    expect(TYPE_ORDER).toContain("decision");
    expect(TYPE_ORDER).toContain("pattern");
    expect(TYPE_ORDER).toContain("preference");
    expect(TYPE_ORDER).toContain("topology");
    expect(TYPE_ORDER).toContain("fact");
  });
});

describe("formatAge", () => {
  it("formats minutes ago", () => {
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    expect(formatAge(tenMinAgo)).toBe("10m ago");
  });

  it("formats hours ago", () => {
    const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
    expect(formatAge(threeHoursAgo)).toBe("3h ago");
  });

  it("formats days ago", () => {
    const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000;
    expect(formatAge(fiveDaysAgo)).toBe("5d ago");
  });

  it("formats months ago", () => {
    const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
    expect(formatAge(sixtyDaysAgo)).toBe("2mo ago");
  });

  it("formats 0 minutes for just-now timestamp", () => {
    expect(formatAge(Date.now())).toBe("0m ago");
  });
});

describe("memory_store critical path (via db + recall)", () => {
  it("stores a memory and it becomes retrievable via recall", () => {
    const id = db.insertMemory({
      content: "Never mock the database in integration tests",
      type: "correction",
      tags: ["testing"],
      confidence: 1.0,
      source: "conversation",
      embedding: null,
      scope: "global",
    });

    const results = recallMemories(db, { query: "database testing", limit: 10 });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some(r => r.id === id)).toBe(true);
  });

  it("conflict detection: identical content not flagged", () => {
    const result = detectConflict("same content", "same content", 1.0);
    expect(result.isConflict).toBe(false);
  });

  it("conflict detection: similar but different content IS flagged", () => {
    const result = detectConflict("Use pnpm for packages", "Use npm for packages", 0.9);
    expect(result.isConflict).toBe(true);
  });
});

describe("memory_recall critical path", () => {
  it("returns ranked results with scores", () => {
    db.insertMemory({ content: "TypeScript strict mode is required", type: "correction", tags: ["typescript"], confidence: 1.0, source: "t", embedding: null, scope: "global" });
    db.insertMemory({ content: "Auth module is in src/auth", type: "topology", tags: ["auth"], confidence: 0.7, source: "t", embedding: null, scope: "global" });
    db.insertMemory({ content: "Prefers TypeScript over JavaScript", type: "preference", tags: ["typescript"], confidence: 0.8, source: "t", embedding: null, scope: "global" });

    const results = recallMemories(db, { query: "TypeScript", limit: 10 });
    // TypeScript memories should be ranked higher due to keyword matching
    expect(results.length).toBeGreaterThanOrEqual(2);

    // All results have a score property
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(typeof r.score).toBe("number");
    }

    // Verify sorted by score descending
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
    }
  });

  it("returns empty array for no matches", () => {
    const results = recallMemories(db, { query: "nonexistent topic xyz", limit: 10 });
    expect(results).toHaveLength(0);
  });
});

describe("memory_inject critical path", () => {
  it("corrections and decisions are retrievable and properly ordered", () => {
    db.insertMemory({ content: "Never use unsafe dynamic code execution", type: "correction", tags: ["security"], confidence: 1.0, source: "t", embedding: null, scope: "global" });
    db.insertMemory({ content: "Use REST not GraphQL", type: "decision", tags: ["api"], confidence: 0.9, source: "t", embedding: null, scope: "global" });
    db.insertMemory({ content: "Prefer early returns", type: "pattern", tags: ["style"], confidence: 0.7, source: "t", embedding: null, scope: "global" });

    // memory_inject calls recallMemories then filters by type
    const results = recallMemories(db, { query: null, limit: 30 });

    const corrections = results.filter(r => r.type === "correction");
    const decisions = results.filter(r => r.type === "decision");
    const patterns = results.filter(r => r.type === "pattern");

    expect(corrections).toHaveLength(1);
    expect(corrections[0].content).toBe("Never use unsafe dynamic code execution");
    expect(decisions).toHaveLength(1);
    expect(decisions[0].content).toBe("Use REST not GraphQL");

    // Corrections have higher importance weight, so should score higher
    expect(corrections[0].score).toBeGreaterThan(decisions[0].score);
    expect(decisions[0].score).toBeGreaterThan(patterns[0].score);
  });
});

describe("memory_forget critical path", () => {
  it("deleting by ID removes the memory", () => {
    const id = db.insertMemory({ content: "to forget", type: "fact", tags: [], confidence: 0.5, source: "t", embedding: null, scope: "global" });

    // Verify it exists
    expect(db.getById(id)).not.toBeNull();

    // Delete it (what memory_forget does)
    db.deleteMemory(id);

    // Gone
    expect(db.getById(id)).toBeNull();
  });

  it("deleting a nonexistent ID is a no-op", () => {
    // Should not throw
    db.deleteMemory("nonexistent-id");
  });
});

describe("memory_patch critical path", () => {
  it("patching content updates the memory and creates a version", () => {
    const id = db.insertMemory({ content: "original", type: "fact", tags: ["a"], confidence: 0.8, source: "t", embedding: null, scope: "global" });

    const success = db.patchMemory(id, {
      field: "content",
      value: "updated content",
      reason: "corrected info",
    });
    expect(success).toBe(true);

    const mem = db.getById(id);
    expect(mem!.content).toBe("updated content");

    const versions = db.getVersionHistory(id);
    expect(versions).toHaveLength(1);
    expect(versions[0].content).toBe("original");
  });

  it("patching confidence updates the value", () => {
    const id = db.insertMemory({ content: "x", type: "fact", tags: [], confidence: 0.5, source: "t", embedding: null, scope: "global" });

    db.patchMemory(id, { field: "confidence", value: 0.95, reason: "validated by user" });
    expect(db.getById(id)!.confidence).toBe(0.95);
  });

  it("patching tags updates the array", () => {
    const id = db.insertMemory({ content: "x", type: "fact", tags: ["old"], confidence: 0.5, source: "t", embedding: null, scope: "global" });

    db.patchMemory(id, { field: "tags", value: ["new", "tags"], reason: "retagged" });
    expect(db.getById(id)!.tags).toEqual(["new", "tags"]);
  });

  it("patching a nonexistent memory returns false", () => {
    const success = db.patchMemory("bad-id", { field: "content", value: "x", reason: "test" });
    expect(success).toBe(false);
  });

  it("multiple patches create multiple version snapshots", () => {
    const id = db.insertMemory({ content: "v1", type: "fact", tags: [], confidence: 0.5, source: "t", embedding: null, scope: "global" });

    db.patchMemory(id, { field: "content", value: "v2", reason: "first edit" });
    db.patchMemory(id, { field: "content", value: "v3", reason: "second edit" });

    const versions = db.getVersionHistory(id);
    expect(versions).toHaveLength(2);
    // Both previous contents should be captured (order depends on timestamp resolution)
    const versionContents = versions.map(v => v.content).sort();
    expect(versionContents).toEqual(["v1", "v2"]);

    const mem = db.getById(id);
    expect(mem!.content).toBe("v3");
  });
});

describe("end-to-end: store, recall, inject, patch, forget", () => {
  it("full lifecycle", () => {
    // Store
    const id1 = db.insertMemory({
      content: "Always use strict TypeScript config",
      type: "correction",
      tags: ["typescript", "config"],
      confidence: 1.0,
      source: "conversation",
      embedding: null,
      scope: "global",
    });
    const id2 = db.insertMemory({
      content: "Chose Tailwind for styling",
      type: "decision",
      tags: ["css", "tailwind"],
      confidence: 0.9,
      source: "conversation",
      embedding: null,
      scope: "project:myapp",
    });

    // Recall
    const allResults = recallMemories(db, { query: null, limit: 10 });
    expect(allResults).toHaveLength(2);

    // Inject-style: filter to corrections and decisions
    const corrections = allResults.filter(r => r.type === "correction");
    const decisions = allResults.filter(r => r.type === "decision");
    expect(corrections).toHaveLength(1);
    expect(decisions).toHaveLength(1);

    // Patch
    db.patchMemory(id2, { field: "confidence", value: 0.95, reason: "team approved" });
    expect(db.getById(id2)!.confidence).toBe(0.95);

    // Forget
    db.deleteMemory(id1);
    expect(db.getById(id1)).toBeNull();

    const remaining = recallMemories(db, { query: null, limit: 10 });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(id2);
  });
});
