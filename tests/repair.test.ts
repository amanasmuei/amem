import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createDatabase } from "../src/database.js";
import { repairDatabase } from "../src/repair.js";
import { MemoryType } from "../src/memory.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amem-repair-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

describe("repairDatabase", () => {
  it("reports healthy on a good database", () => {
    const tempDir = makeTempDir();
    const dbPath = path.join(tempDir, "memory.db");
    const db = createDatabase(dbPath);
    db.insertMemory({
      content: "use TypeScript strict mode",
      type: MemoryType.PREFERENCE,
      tags: ["typescript"],
      confidence: 0.9,
      source: "test",
      embedding: null,
      scope: "global",
    });
    db.close();

    const result = repairDatabase(dbPath);

    expect(result.status).toBe("healthy");
    expect(result.integrityCheck).toBe("ok");
    expect(result.backupUsed).toBeNull();
    expect(result.memoriesRecovered).toBe(1);
    expect(result.message).toContain("healthy");
  });

  it("restores from backup when DB is corrupted and restored DB is usable", () => {
    const tempDir = makeTempDir();
    const dbPath = path.join(tempDir, "memory.db");
    const backupDir = path.join(tempDir, "backups");
    fs.mkdirSync(backupDir, { recursive: true });

    // Create a valid backup DB with one memory
    const backupName = `memory-${Date.now()}.db`;
    const backupPath = path.join(backupDir, backupName);
    const backupDb = createDatabase(backupPath);
    backupDb.insertMemory({
      content: "always write tests",
      type: MemoryType.PATTERN,
      tags: ["testing"],
      confidence: 1.0,
      source: "test",
      embedding: null,
      scope: "global",
    });
    backupDb.close();

    // Write a corrupted main DB
    fs.writeFileSync(dbPath, "this is not a valid sqlite database");

    const result = repairDatabase(dbPath);

    expect(result.status).toBe("repaired");
    expect(result.integrityCheck).toBe("restored");
    expect(result.backupUsed).toBe(backupName);
    expect(result.memoriesRecovered).toBe(1);
    expect(result.message).toContain("Restored from");

    // Verify the restored DB is actually usable
    const restoredDb = createDatabase(dbPath);
    const memories = restoredDb.getAll();
    expect(memories).toHaveLength(1);
    expect(memories[0].content).toBe("always write tests");
    restoredDb.close();
  });

  it("fails gracefully when DB is corrupted and no backups exist", () => {
    const tempDir = makeTempDir();
    const dbPath = path.join(tempDir, "memory.db");

    // Write a corrupted DB, no backups directory
    fs.writeFileSync(dbPath, "corrupted data");

    const result = repairDatabase(dbPath);

    expect(result.status).toBe("failed");
    expect(result.integrityCheck).toBe("failed");
    expect(result.backupUsed).toBeNull();
    expect(result.memoriesRecovered).toBe(0);
    expect(result.message).toContain("no backups found");
  });

  it("skips corrupted backups and uses the next good one", () => {
    const tempDir = makeTempDir();
    const dbPath = path.join(tempDir, "memory.db");
    const backupDir = path.join(tempDir, "backups");
    fs.mkdirSync(backupDir, { recursive: true });

    // Create a corrupted backup (newer timestamp — sorted last after reverse)
    const corruptedName = `memory-${Date.now() + 2000}.db`;
    fs.writeFileSync(path.join(backupDir, corruptedName), "not a real db");

    // Small gap to ensure distinct timestamps
    const goodName = `memory-${Date.now() + 1000}.db`;
    const goodBackupPath = path.join(backupDir, goodName);
    const goodDb = createDatabase(goodBackupPath);
    goodDb.insertMemory({
      content: "prefer explicit types",
      type: MemoryType.PREFERENCE,
      tags: ["typescript"],
      confidence: 0.8,
      source: "test",
      embedding: null,
      scope: "global",
    });
    goodDb.close();

    // Write a corrupted main DB
    fs.writeFileSync(dbPath, "not valid sqlite");

    const result = repairDatabase(dbPath);

    expect(result.status).toBe("repaired");
    expect(result.backupUsed).toBe(goodName);
    expect(result.memoriesRecovered).toBe(1);

    // Verify the restored DB is usable
    const restoredDb = createDatabase(dbPath);
    const memories = restoredDb.getAll();
    expect(memories).toHaveLength(1);
    restoredDb.close();
  });
});
