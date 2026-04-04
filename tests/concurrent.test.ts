import { describe, it, expect, afterEach } from "vitest";
import { createDatabase, type AmemDatabase, MemoryType } from "@aman_asmuei/amem-core";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function makeTempDb(): string {
  return path.join(os.tmpdir(), `amem-concurrent-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

function cleanup(dbPath: string): void {
  for (const ext of ["", "-wal", "-shm"]) {
    try { fs.unlinkSync(dbPath + ext); } catch {}
  }
}

describe("Concurrent SQLite access (WAL mode)", () => {
  const openDbs: AmemDatabase[] = [];
  const dbPaths: string[] = [];

  function openDb(dbPath: string): AmemDatabase {
    const db = createDatabase(dbPath);
    openDbs.push(db);
    return db;
  }

  afterEach(() => {
    // Close all open connections
    while (openDbs.length > 0) {
      const db = openDbs.pop()!;
      try { db.close(); } catch {}
    }
    // Remove all temp DB files
    while (dbPaths.length > 0) {
      const p = dbPaths.pop()!;
      cleanup(p);
    }
  });

  it("two connections can read simultaneously", () => {
    const dbPath = makeTempDb();
    dbPaths.push(dbPath);

    // Seed data with first connection
    const db1 = openDb(dbPath);
    db1.insertMemory({
      content: "shared fact for reading",
      type: MemoryType.FACT,
      tags: ["concurrent"],
      confidence: 0.9,
      source: "test",
      embedding: null,
      scope: "global",
    });

    // Open a second connection to the same file
    const db2 = openDb(dbPath);

    // Both connections should be able to read without error
    const results1 = db1.getAll();
    const results2 = db2.getAll();

    expect(results1).toHaveLength(1);
    expect(results2).toHaveLength(1);
    expect(results1[0].content).toBe("shared fact for reading");
    expect(results2[0].content).toBe("shared fact for reading");
  });

  it("two connections can write without SQLITE_BUSY (WAL mode)", () => {
    const dbPath = makeTempDb();
    dbPaths.push(dbPath);

    const db1 = openDb(dbPath);
    const db2 = openDb(dbPath);

    // Write from first connection
    const id1 = db1.insertMemory({
      content: "write from connection 1",
      type: MemoryType.FACT,
      tags: ["conn1"],
      confidence: 0.8,
      source: "concurrent-test",
      embedding: null,
      scope: "global",
    });

    // Write from second connection — must not throw SQLITE_BUSY
    const id2 = db2.insertMemory({
      content: "write from connection 2",
      type: MemoryType.FACT,
      tags: ["conn2"],
      confidence: 0.8,
      source: "concurrent-test",
      embedding: null,
      scope: "global",
    });

    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);

    // Each connection should see both records
    const all1 = db1.getAll();
    const all2 = db2.getAll();
    expect(all1).toHaveLength(2);
    expect(all2).toHaveLength(2);
  });

  it("concurrent writes to different tables don't deadlock", () => {
    const dbPath = makeTempDb();
    dbPaths.push(dbPath);

    const db1 = openDb(dbPath);
    const db2 = openDb(dbPath);

    // db1 writes to memories, db2 writes to logs — interleaved
    const memId = db1.insertMemory({
      content: "memory from db1",
      type: MemoryType.DECISION,
      tags: [],
      confidence: 1.0,
      source: "concurrent-test",
      embedding: null,
      scope: "global",
    });

    const logId = db2.appendLog({
      sessionId: "session-concurrent-1",
      role: "user",
      content: "log from db2",
      project: "concurrent-test",
    });

    // db2 now writes to memories, db1 writes to logs
    const memId2 = db2.insertMemory({
      content: "memory from db2",
      type: MemoryType.FACT,
      tags: [],
      confidence: 0.7,
      source: "concurrent-test",
      embedding: null,
      scope: "global",
    });

    const logId2 = db1.appendLog({
      sessionId: "session-concurrent-2",
      role: "assistant",
      content: "log from db1",
      project: "concurrent-test",
    });

    expect(memId).toBeTruthy();
    expect(logId).toBeTruthy();
    expect(memId2).toBeTruthy();
    expect(logId2).toBeTruthy();

    // Verify data integrity
    const allMems = db1.getAll();
    const logs1 = db1.getLogBySession("session-concurrent-1");
    const logs2 = db2.getLogBySession("session-concurrent-2");

    expect(allMems).toHaveLength(2);
    expect(logs1).toHaveLength(1);
    expect(logs2).toHaveLength(1);
  });

  it("rapid alternating writes from two connections (50 writes)", () => {
    const dbPath = makeTempDb();
    dbPaths.push(dbPath);

    const db1 = openDb(dbPath);
    const db2 = openDb(dbPath);

    const ids: string[] = [];

    // 50 alternating writes — each connection writes 25 times
    for (let i = 0; i < 50; i++) {
      const db = i % 2 === 0 ? db1 : db2;
      const id = db.insertMemory({
        content: `rapid write ${i} from conn ${i % 2 + 1}`,
        type: MemoryType.FACT,
        tags: [`write-${i}`],
        confidence: 0.5,
        source: "rapid-test",
        embedding: null,
        scope: "global",
      });
      ids.push(id);
    }

    // All 50 IDs should be unique
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(50);

    // Both connections must observe all 50 records
    const all1 = db1.getAll();
    const all2 = db2.getAll();
    expect(all1).toHaveLength(50);
    expect(all2).toHaveLength(50);
  });

  it("transaction on one connection doesn't block reads on another", () => {
    const dbPath = makeTempDb();
    dbPaths.push(dbPath);

    const db1 = openDb(dbPath);
    const db2 = openDb(dbPath);

    // Pre-seed a record visible before the transaction
    db1.insertMemory({
      content: "pre-existing memory",
      type: MemoryType.FACT,
      tags: ["pre"],
      confidence: 1.0,
      source: "test",
      embedding: null,
      scope: "global",
    });

    let readsDuringTx: number = 0;

    // Run a transaction on db1 that inserts multiple records
    db1.transaction(() => {
      for (let i = 0; i < 5; i++) {
        db1.insertMemory({
          content: `tx memory ${i}`,
          type: MemoryType.DECISION,
          tags: ["tx"],
          confidence: 0.9,
          source: "tx-test",
          embedding: null,
          scope: "global",
        });
      }
      // While inside the transaction (before commit), db2 reads the pre-existing data
      // WAL readers see the last committed snapshot, so at least 1 record is visible
      const snapshot = db2.getAll();
      readsDuringTx = snapshot.length;
    });

    // After transaction commits, db2 sees all 6 records
    const afterCommit = db2.getAll();

    // During the transaction, db2 should have been able to read (WAL allows concurrent reads)
    // It saw either the pre-existing snapshot (1 record) or the committed result
    expect(readsDuringTx).toBeGreaterThanOrEqual(1);
    expect(afterCommit).toHaveLength(6);
  });
});
