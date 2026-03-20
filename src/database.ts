import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { Memory, MemoryTypeValue } from "./memory.js";

export interface MemoryInput {
  content: string;
  type: MemoryTypeValue;
  tags: string[];
  confidence: number;
  source: string;
  embedding: Float32Array | null;
  scope: string;
}

export interface MemoryStats {
  total: number;
  byType: Record<string, number>;
}

export interface AmemDatabase {
  insertMemory(input: MemoryInput): string;
  getById(id: string): Memory | null;
  searchByType(type: MemoryTypeValue): Memory[];
  searchByTag(tag: string): Memory[];
  getAllWithEmbeddings(): Memory[];
  getAll(): Memory[];
  updateConfidence(id: string, confidence: number): void;
  updateEmbedding(id: string, embedding: Float32Array): void;
  touchAccess(id: string): void;
  deleteMemory(id: string): void;
  getStats(): MemoryStats;
  searchByScope(scope: string): Memory[];
  getAllForProject(project: string): Memory[];
  listTables(): string[];
  close(): void;
}

interface MemoryRow {
  id: string;
  content: string;
  type: string;
  tags: string;
  confidence: number;
  access_count: number;
  created_at: number;
  last_accessed: number;
  source: string;
  embedding: Buffer | null;
  scope: string;
}

function rowToMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    content: row.content,
    type: row.type as MemoryTypeValue,
    tags: JSON.parse(row.tags) as string[],
    confidence: row.confidence,
    accessCount: row.access_count,
    createdAt: row.created_at,
    lastAccessed: row.last_accessed,
    source: row.source,
    embedding: row.embedding
      ? new Float32Array(
          row.embedding.buffer,
          row.embedding.byteOffset,
          row.embedding.byteLength / 4,
        )
      : null,
    scope: row.scope,
  };
}

export function createDatabase(dbPath: string): AmemDatabase {
  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      type TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      confidence REAL NOT NULL DEFAULT 1.0,
      access_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      last_accessed INTEGER NOT NULL,
      source TEXT NOT NULL,
      embedding BLOB,
      scope TEXT NOT NULL DEFAULT 'global'
    );

    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
    CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);
    CREATE INDEX IF NOT EXISTS idx_memories_confidence ON memories(confidence);
  `);

  // Migration: add scope column if not present
  const columns = db.pragma('table_info(memories)') as { name: string }[];
  const hasScope = columns.some(c => c.name === 'scope');
  if (!hasScope) {
    db.exec(`ALTER TABLE memories ADD COLUMN scope TEXT NOT NULL DEFAULT 'global'`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope)`);

  const stmts = {
    insert: db.prepare(`
      INSERT INTO memories (id, content, type, tags, confidence, access_count, created_at, last_accessed, source, embedding, scope)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    `),
    getById: db.prepare(`SELECT * FROM memories WHERE id = ?`),
    searchByType: db.prepare(`SELECT * FROM memories WHERE type = ? ORDER BY last_accessed DESC`),
    searchByTag: db.prepare(`SELECT * FROM memories WHERE tags LIKE ? ORDER BY last_accessed DESC`),
    getAllWithEmbeddings: db.prepare(`SELECT * FROM memories WHERE embedding IS NOT NULL`),
    getAll: db.prepare(`SELECT * FROM memories ORDER BY last_accessed DESC`),
    updateConfidence: db.prepare(`
      UPDATE memories SET confidence = ?, access_count = access_count + 1, last_accessed = ? WHERE id = ?
    `),
    updateEmbedding: db.prepare(`UPDATE memories SET embedding = ? WHERE id = ?`),
    touchAccess: db.prepare(`
      UPDATE memories SET access_count = access_count + 1, last_accessed = ? WHERE id = ?
    `),
    deleteMemory: db.prepare(`DELETE FROM memories WHERE id = ?`),
    countAll: db.prepare(`SELECT COUNT(*) as count FROM memories`),
    countByType: db.prepare(`SELECT type, COUNT(*) as count FROM memories GROUP BY type`),
    listTables: db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`),
    searchByScope: db.prepare(`SELECT * FROM memories WHERE scope = ? ORDER BY last_accessed DESC`),
    getAllForProject: db.prepare(`SELECT * FROM memories WHERE scope = 'global' OR scope = ? ORDER BY last_accessed DESC`),
  };

  return {
    insertMemory(input: MemoryInput): string {
      const id = randomUUID();
      const now = Date.now();
      const embeddingBuffer = input.embedding
        ? Buffer.from(input.embedding.buffer, input.embedding.byteOffset, input.embedding.byteLength)
        : null;
      stmts.insert.run(
        id,
        input.content,
        input.type,
        JSON.stringify(input.tags),
        input.confidence,
        now,
        now,
        input.source,
        embeddingBuffer,
        input.scope,
      );
      return id;
    },

    getById(id: string): Memory | null {
      const row = stmts.getById.get(id) as MemoryRow | undefined;
      return row ? rowToMemory(row) : null;
    },

    searchByType(type: MemoryTypeValue): Memory[] {
      const rows = stmts.searchByType.all(type) as MemoryRow[];
      return rows.map(rowToMemory);
    },

    searchByTag(tag: string): Memory[] {
      const pattern = `%"${tag}"%`;
      const rows = stmts.searchByTag.all(pattern) as MemoryRow[];
      return rows.map(rowToMemory);
    },

    getAllWithEmbeddings(): Memory[] {
      const rows = stmts.getAllWithEmbeddings.all() as MemoryRow[];
      return rows.map(rowToMemory);
    },

    getAll(): Memory[] {
      const rows = stmts.getAll.all() as MemoryRow[];
      return rows.map(rowToMemory);
    },

    updateConfidence(id: string, confidence: number): void {
      stmts.updateConfidence.run(confidence, Date.now(), id);
    },

    updateEmbedding(id: string, embedding: Float32Array): void {
      const buffer = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
      stmts.updateEmbedding.run(buffer, id);
    },

    touchAccess(id: string): void {
      stmts.touchAccess.run(Date.now(), id);
    },

    deleteMemory(id: string): void {
      stmts.deleteMemory.run(id);
    },

    getStats(): MemoryStats {
      const total = (stmts.countAll.get() as { count: number }).count;
      const typeCounts = stmts.countByType.all() as { type: string; count: number }[];
      const byType: Record<string, number> = {};
      for (const row of typeCounts) {
        byType[row.type] = row.count;
      }
      return { total, byType };
    },

    searchByScope(scope: string): Memory[] {
      const rows = stmts.searchByScope.all(scope) as MemoryRow[];
      return rows.map(rowToMemory);
    },

    getAllForProject(project: string): Memory[] {
      const rows = stmts.getAllForProject.all(project) as MemoryRow[];
      return rows.map(rowToMemory);
    },

    listTables(): string[] {
      const rows = stmts.listTables.all() as { name: string }[];
      return rows.map((r) => r.name);
    },

    close(): void {
      db.close();
    },
  };
}
