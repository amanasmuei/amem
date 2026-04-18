import { describe, it, expect, afterEach } from "vitest";
import { createDatabase, type AmemDatabase, MemoryType } from "@aman_asmuei/amem-core";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ── Copied helpers from src/tools/admin.ts (not exported) ──────────────────

function getByPath(obj: unknown, dotPath: string): unknown {
  if (dotPath === "") return obj;
  const parts = dotPath.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function setByPath<T extends object>(obj: T, dotPath: string, value: unknown): T {
  const parts = dotPath.split(".");
  const clone = structuredClone(obj) as Record<string, unknown>;
  let cur: Record<string, unknown> = clone;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = cur[key];
    if (next === null || typeof next !== "object" || Array.isArray(next)) {
      throw new Error(`Path segment "${parts.slice(0, i + 1).join(".")}" is not an object`);
    }
    const nextClone = { ...(next as Record<string, unknown>) };
    cur[key] = nextClone;
    cur = nextClone;
  }
  cur[parts[parts.length - 1]] = value;
  return clone as T;
}

type DiffEntry = { key: string; from: unknown; to: unknown };

function diffConfig(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): DiffEntry[] {
  const diffs: DiffEntry[] = [];
  function walk(a: unknown, b: unknown, prefix: string): void {
    if (
      typeof a !== "object" ||
      a === null ||
      Array.isArray(a) ||
      typeof b !== "object" ||
      b === null ||
      Array.isArray(b)
    ) {
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        diffs.push({ key: prefix, from: a, to: b });
      }
      return;
    }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      walk(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        prefix ? `${prefix}.${k}` : k,
      );
    }
  }
  walk(before, after, "");
  return diffs;
}

function findOrphanRelations(
  db: AmemDatabase,
): { id: string; fromId: string; toId: string; reason: string }[] {
  const orphans: { id: string; fromId: string; toId: string; reason: string }[] = [];
  const relations = db.getAllRelations();
  const existingIds = new Set(db.getAll().map((m) => m.id));
  for (const r of relations) {
    const missingFrom = !existingIds.has(r.fromId);
    const missingTo = !existingIds.has(r.toId);
    if (missingFrom || missingTo) {
      orphans.push({
        id: r.id,
        fromId: r.fromId,
        toId: r.toId,
        reason: [missingFrom && "fromId missing", missingTo && "toId missing"]
          .filter(Boolean)
          .join(", "),
      });
    }
  }
  return orphans;
}

function runIntegrityCheck(
  dbPath: string,
): { ok: boolean; details: string[] } {
  try {
    const ro = new Database(dbPath, { readonly: true, fileMustExist: true });
    const rows = ro.pragma("integrity_check") as { integrity_check: string }[];
    ro.close();
    const details = rows.map((r) => r.integrity_check);
    return { ok: details.length === 1 && details[0] === "ok", details };
  } catch (err) {
    return {
      ok: false,
      details: [err instanceof Error ? err.message : String(err)],
    };
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("getByPath", () => {
  const obj = { a: { b: { c: 42 } }, x: [1, 2, 3], n: null };

  it("returns the full object for empty path", () => {
    expect(getByPath(obj, "")).toBe(obj);
  });

  it("resolves a simple top-level key", () => {
    expect(getByPath(obj, "x")).toEqual([1, 2, 3]);
  });

  it("resolves a nested key via dot-path", () => {
    expect(getByPath(obj, "a.b.c")).toBe(42);
  });

  it("returns undefined for a missing key", () => {
    expect(getByPath(obj, "missing")).toBeUndefined();
  });

  it("returns undefined when traversing through a non-object", () => {
    expect(getByPath(obj, "x.foo")).toBeUndefined();
  });

  it("returns undefined when traversing through null", () => {
    expect(getByPath(obj, "n.foo")).toBeUndefined();
  });
});

describe("setByPath", () => {
  it("sets a top-level key", () => {
    const obj = { a: 1, b: 2 };
    const result = setByPath(obj, "b", 99);
    expect(result.b).toBe(99);
    expect(obj.b).toBe(2); // original unchanged
  });

  it("sets a nested key", () => {
    const obj = { a: { b: { c: 1 } } };
    const result = setByPath(obj, "a.b.c", 100);
    expect(getByPath(result, "a.b.c")).toBe(100);
    expect(getByPath(obj, "a.b.c")).toBe(1); // original unchanged
  });

  it("creates a new key at the target path", () => {
    const obj = { a: { b: {} as Record<string, unknown> } };
    const result = setByPath(obj, "a.b.newKey", "hello");
    expect(getByPath(result, "a.b.newKey")).toBe("hello");
  });

  it("throws when an intermediate segment is not an object", () => {
    const obj = { a: 42 };
    expect(() => setByPath(obj, "a.b", "x")).toThrow(
      'Path segment "a" is not an object',
    );
  });

  it("throws when traversing through an array", () => {
    const obj = { a: [1, 2, 3] };
    expect(() => setByPath(obj, "a.b", "x")).toThrow(
      'Path segment "a" is not an object',
    );
  });
});

describe("diffConfig", () => {
  it("returns empty array for identical objects", () => {
    const cfg = { a: 1, b: { c: "hello" } };
    expect(diffConfig(cfg, structuredClone(cfg))).toHaveLength(0);
  });

  it("detects a changed leaf value", () => {
    const before = { a: 1, b: 2 };
    const after = { a: 1, b: 99 };
    const diffs = diffConfig(before, after);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({ key: "b", from: 2, to: 99 });
  });

  it("detects a changed nested value", () => {
    const before = { retrieval: { semanticWeight: 0.7 } };
    const after = { retrieval: { semanticWeight: 0.9 } };
    const diffs = diffConfig(before, after);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].key).toBe("retrieval.semanticWeight");
    expect(diffs[0].from).toBe(0.7);
    expect(diffs[0].to).toBe(0.9);
  });

  it("detects multiple changed values", () => {
    const before = { a: 1, b: 2, c: 3 };
    const after = { a: 1, b: 20, c: 30 };
    const diffs = diffConfig(before, after);
    expect(diffs).toHaveLength(2);
    const keys = diffs.map((d) => d.key).sort();
    expect(keys).toEqual(["b", "c"]);
  });

  it("detects added keys", () => {
    const before = { a: 1 } as Record<string, unknown>;
    const after = { a: 1, b: 2 } as Record<string, unknown>;
    const diffs = diffConfig(before, after);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({ key: "b", from: undefined, to: 2 });
  });

  it("detects removed keys", () => {
    const before = { a: 1, b: 2 } as Record<string, unknown>;
    const after = { a: 1 } as Record<string, unknown>;
    const diffs = diffConfig(before, after);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({ key: "b", from: 2, to: undefined });
  });
});

describe("findOrphanRelations", () => {
  let db: AmemDatabase;
  let dbPath: string;

  afterEach(() => {
    db.close();
    try {
      fs.unlinkSync(dbPath);
    } catch {}
  });

  it("returns empty array when no relations exist", () => {
    dbPath = path.join(os.tmpdir(), `amem-admin-test-${Date.now()}.db`);
    db = createDatabase(dbPath);
    expect(findOrphanRelations(db)).toHaveLength(0);
  });

  it("returns empty array when all relations reference existing memories", () => {
    dbPath = path.join(os.tmpdir(), `amem-admin-test-${Date.now()}.db`);
    db = createDatabase(dbPath);

    const idA = db.insertMemory({
      content: "memory A",
      type: MemoryType.FACT,
      tags: [],
      confidence: 0.8,
      source: "test",
      embedding: null,
      scope: "global",
    });
    const idB = db.insertMemory({
      content: "memory B",
      type: MemoryType.FACT,
      tags: [],
      confidence: 0.8,
      source: "test",
      embedding: null,
      scope: "global",
    });

    db.addRelation(idA, idB, "related_to", 0.9);
    expect(findOrphanRelations(db)).toHaveLength(0);
  });

  it("detects orphan when target memory is deleted", () => {
    dbPath = path.join(os.tmpdir(), `amem-admin-test-${Date.now()}.db`);
    db = createDatabase(dbPath);

    const idA = db.insertMemory({
      content: "memory A",
      type: MemoryType.FACT,
      tags: [],
      confidence: 0.8,
      source: "test",
      embedding: null,
      scope: "global",
    });

    // Insert an orphan relation directly (bypassing FK cascade) by pointing to a
    // non-existent memory ID — simulates legacy data or a DB without FK enforcement.
    const rawDb = new Database(dbPath);
    rawDb.pragma("foreign_keys = OFF");
    const orphanToId = "00000000-0000-0000-0000-000000000001";
    rawDb.prepare(
      "INSERT INTO memory_relations (id, from_id, to_id, relationship_type, strength, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(
      "rel-orphan-to",
      idA,
      orphanToId,
      "related_to",
      0.9,
      Date.now(),
    );
    rawDb.pragma("foreign_keys = ON");
    rawDb.close();

    const orphans = findOrphanRelations(db);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].fromId).toBe(idA);
    expect(orphans[0].toId).toBe(orphanToId);
    expect(orphans[0].reason).toBe("toId missing");
  });

  it("detects orphan when source memory is deleted", () => {
    dbPath = path.join(os.tmpdir(), `amem-admin-test-${Date.now()}.db`);
    db = createDatabase(dbPath);

    const idB = db.insertMemory({
      content: "memory B",
      type: MemoryType.FACT,
      tags: [],
      confidence: 0.8,
      source: "test",
      embedding: null,
      scope: "global",
    });

    // Insert an orphan relation where the source (fromId) does not exist.
    const rawDb = new Database(dbPath);
    rawDb.pragma("foreign_keys = OFF");
    const orphanFromId = "00000000-0000-0000-0000-000000000002";
    rawDb.prepare(
      "INSERT INTO memory_relations (id, from_id, to_id, relationship_type, strength, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(
      "rel-orphan-from",
      orphanFromId,
      idB,
      "related_to",
      0.9,
      Date.now(),
    );
    rawDb.pragma("foreign_keys = ON");
    rawDb.close();

    const orphans = findOrphanRelations(db);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].reason).toBe("fromId missing");
  });
});

describe("runIntegrityCheck", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("returns ok:true for a valid SQLite database", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amem-integ-"));
    tempDirs.push(dir);
    const dbPath = path.join(dir, "test.db");
    const db = createDatabase(dbPath);
    db.close();

    const result = runIntegrityCheck(dbPath);
    expect(result.ok).toBe(true);
    expect(result.details).toEqual(["ok"]);
  });

  it("returns ok:false for a non-existent file", () => {
    const result = runIntegrityCheck("/tmp/nonexistent-amem-test.db");
    expect(result.ok).toBe(false);
    expect(result.details.length).toBeGreaterThan(0);
  });

  it("returns ok:false for a corrupt file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amem-integ-"));
    tempDirs.push(dir);
    const dbPath = path.join(dir, "corrupt.db");
    fs.writeFileSync(dbPath, "this is not a sqlite database");

    const result = runIntegrityCheck(dbPath);
    expect(result.ok).toBe(false);
  });
});
