import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, type EngramDatabase } from "../src/database.js";
import { MemoryType } from "../src/memory.js";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

describe("Tool Integration", () => {
  let db: EngramDatabase;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `engram-integration-${Date.now()}.db`);
    db = createDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    try {
      fs.unlinkSync(dbPath);
    } catch {}
  });

  it("full lifecycle: store, recall, forget", () => {
    const id = db.insertMemory({
      content: "never use any type in TypeScript",
      type: MemoryType.CORRECTION,
      tags: ["typescript", "types"],
      confidence: 1.0,
      source: "test",
      embedding: null,
    });
    expect(id).toBeTruthy();

    const corrections = db.searchByType(MemoryType.CORRECTION);
    expect(corrections).toHaveLength(1);
    expect(corrections[0].content).toContain("never use any");

    const tsMemories = db.searchByTag("typescript");
    expect(tsMemories).toHaveLength(1);

    db.deleteMemory(id);
    expect(db.getById(id)).toBeNull();
    expect(db.searchByType(MemoryType.CORRECTION)).toHaveLength(0);
  });

  it("confidence reinforcement", () => {
    const id = db.insertMemory({
      content: "user prefers functional style",
      type: MemoryType.PATTERN,
      tags: ["code-style"],
      confidence: 0.6,
      source: "test",
      embedding: null,
    });

    db.updateConfidence(id, 0.9);
    const memory = db.getById(id);
    expect(memory!.confidence).toBe(0.9);
    expect(memory!.accessCount).toBe(1);
  });

  it("stats reflect stored memories", () => {
    db.insertMemory({
      content: "a",
      type: MemoryType.CORRECTION,
      tags: [],
      confidence: 1,
      source: "s",
      embedding: null,
    });
    db.insertMemory({
      content: "b",
      type: MemoryType.DECISION,
      tags: [],
      confidence: 1,
      source: "s",
      embedding: null,
    });
    db.insertMemory({
      content: "c",
      type: MemoryType.CORRECTION,
      tags: [],
      confidence: 1,
      source: "s",
      embedding: null,
    });

    const stats = db.getStats();
    expect(stats.total).toBe(3);
    expect(stats.byType.correction).toBe(2);
    expect(stats.byType.decision).toBe(1);
  });
});
