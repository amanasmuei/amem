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

export interface LogEntry {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  project: string;
  metadata: Record<string, unknown>;
}

export interface LogEntryInput {
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  project: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryVersion {
  versionId: string;
  memoryId: string;
  content: string;
  confidence: number;
  editedAt: number;
  reason: string;
}

export interface MemoryRelation {
  id: string;
  fromId: string;
  toId: string;
  relationshipType: string;
  strength: number;
  createdAt: number;
}

export interface PatchInput {
  field: "content" | "confidence" | "tags" | "type";
  value: string | number | string[];
  reason: string;
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
  // Raw log
  appendLog(entry: LogEntryInput): string;
  getLogBySession(sessionId: string): LogEntry[];
  searchLog(query: string, limit?: number): LogEntry[];
  getRecentLog(limit: number, project?: string): LogEntry[];
  // Versioning
  snapshotVersion(memoryId: string, reason: string): void;
  getVersionHistory(memoryId: string): MemoryVersion[];
  patchMemory(id: string, patch: PatchInput): boolean;
  // Relations / knowledge graph
  addRelation(fromId: string, toId: string, type: string, strength?: number): string;
  getRelations(memoryId: string): MemoryRelation[];
  removeRelation(relationId: string): void;
  getRelatedMemories(memoryId: string): Memory[];
  // Temporal queries
  getMemoriesByDateRange(from: number, to: number): Memory[];
  getMemoriesSince(timestamp: number): Memory[];
  // Full-text search
  fullTextSearch(query: string, limit?: number, scopeProject?: string): Memory[];
}

interface LogRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  timestamp: number;
  project: string;
  metadata: string;
}

interface VersionRow {
  version_id: string;
  memory_id: string;
  content: string;
  confidence: number;
  edited_at: number;
  reason: string;
}

interface RelationRow {
  id: string;
  from_id: string;
  to_id: string;
  relationship_type: string;
  strength: number;
  created_at: number;
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
  db.pragma("foreign_keys = ON");

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

    -- Lossless raw conversation log (append-only)
    CREATE TABLE IF NOT EXISTS conversation_log (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      project TEXT NOT NULL DEFAULT 'global',
      metadata TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_log_session ON conversation_log(session_id);
    CREATE INDEX IF NOT EXISTS idx_log_timestamp ON conversation_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_log_project ON conversation_log(project);

    -- FTS for full-text search on memories
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      id UNINDEXED,
      content,
      tags,
      content='memories',
      content_rowid='rowid'
    );

    -- FTS for full-text search on conversation log
    CREATE VIRTUAL TABLE IF NOT EXISTS log_fts USING fts5(
      id UNINDEXED,
      content,
      content='conversation_log',
      content_rowid='rowid'
    );

    -- Memory version history
    CREATE TABLE IF NOT EXISTS memory_versions (
      version_id TEXT PRIMARY KEY,
      memory_id TEXT NOT NULL,
      content TEXT NOT NULL,
      confidence REAL NOT NULL,
      edited_at INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT 'manual edit',
      FOREIGN KEY(memory_id) REFERENCES memories(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_versions_memory_id ON memory_versions(memory_id);

    -- Knowledge graph: relations between memories
    CREATE TABLE IF NOT EXISTS memory_relations (
      id TEXT PRIMARY KEY,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      relationship_type TEXT NOT NULL,
      strength REAL NOT NULL DEFAULT 0.8,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(from_id) REFERENCES memories(id) ON DELETE CASCADE,
      FOREIGN KEY(to_id) REFERENCES memories(id) ON DELETE CASCADE,
      UNIQUE(from_id, to_id, relationship_type)
    );
    CREATE INDEX IF NOT EXISTS idx_relations_from ON memory_relations(from_id);
    CREATE INDEX IF NOT EXISTS idx_relations_to ON memory_relations(to_id);
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
    updateContent: db.prepare(`UPDATE memories SET content = ?, last_accessed = ? WHERE id = ?`),
    updateType: db.prepare(`UPDATE memories SET type = ?, last_accessed = ? WHERE id = ?`),
    updateTags: db.prepare(`UPDATE memories SET tags = ?, last_accessed = ? WHERE id = ?`),
    getByDateRange: db.prepare(`SELECT * FROM memories WHERE created_at BETWEEN ? AND ? ORDER BY created_at DESC`),
    getSince: db.prepare(`SELECT * FROM memories WHERE created_at >= ? ORDER BY created_at DESC`),
    // Log
    insertLog: db.prepare(`
      INSERT INTO conversation_log (id, session_id, role, content, timestamp, project, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    getLogBySession: db.prepare(`SELECT * FROM conversation_log WHERE session_id = ? ORDER BY timestamp ASC`),
    getRecentLog: db.prepare(`SELECT * FROM conversation_log ORDER BY timestamp DESC LIMIT ?`),
    getRecentLogByProject: db.prepare(`SELECT * FROM conversation_log WHERE project = ? ORDER BY timestamp DESC LIMIT ?`),
    // Versions
    insertVersion: db.prepare(`
      INSERT INTO memory_versions (version_id, memory_id, content, confidence, edited_at, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    getVersions: db.prepare(`SELECT * FROM memory_versions WHERE memory_id = ? ORDER BY edited_at DESC`),
    // Relations
    insertRelation: db.prepare(`
      INSERT OR REPLACE INTO memory_relations (id, from_id, to_id, relationship_type, strength, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    getRelationsFrom: db.prepare(`SELECT * FROM memory_relations WHERE from_id = ?`),
    getRelationsTo: db.prepare(`SELECT * FROM memory_relations WHERE to_id = ?`),
    deleteRelation: db.prepare(`DELETE FROM memory_relations WHERE id = ?`),
  };

  // Keep FTS index in sync via triggers
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(id, content, tags) VALUES (new.id, new.content, new.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, id, content, tags) VALUES ('delete', old.id, old.content, old.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, id, content, tags) VALUES ('delete', old.id, old.content, old.tags);
      INSERT INTO memories_fts(id, content, tags) VALUES (new.id, new.content, new.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS log_ai AFTER INSERT ON conversation_log BEGIN
      INSERT INTO log_fts(id, content) VALUES (new.id, new.content);
    END;
  `);

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

    // ── Raw log ──────────────────────────────────────────────
    appendLog(entry: LogEntryInput): string {
      const id = randomUUID();
      stmts.insertLog.run(
        id,
        entry.sessionId,
        entry.role,
        entry.content,
        Date.now(),
        entry.project,
        JSON.stringify(entry.metadata ?? {}),
      );
      return id;
    },

    getLogBySession(sessionId: string): LogEntry[] {
      const rows = stmts.getLogBySession.all(sessionId) as LogRow[];
      return rows.map(r => ({
        id: r.id,
        sessionId: r.session_id,
        role: r.role as LogEntry["role"],
        content: r.content,
        timestamp: r.timestamp,
        project: r.project,
        metadata: JSON.parse(r.metadata) as Record<string, unknown>,
      }));
    },

    searchLog(query: string, limit = 20): LogEntry[] {
      const mapRow = (r: LogRow): LogEntry => ({
        id: r.id,
        sessionId: r.session_id,
        role: r.role as LogEntry["role"],
        content: r.content,
        timestamp: r.timestamp,
        project: r.project,
        metadata: JSON.parse(r.metadata) as Record<string, unknown>,
      });

      try {
        const stmt = db.prepare(`
          SELECT conversation_log.* FROM log_fts
          JOIN conversation_log ON conversation_log.id = log_fts.id
          WHERE log_fts.content MATCH ?
          ORDER BY rank
          LIMIT ?
        `);
        const rows = stmt.all(query, limit) as LogRow[];
        return rows.map(mapRow);
      } catch {
        // FTS5 may fail on special characters — fall back to LIKE
        const escaped = query.replace(/[%_]/g, ch => "\\" + ch);
        const pattern = `%${escaped}%`;
        const stmt = db.prepare(`
          SELECT * FROM conversation_log WHERE content LIKE ? ESCAPE '\\' ORDER BY timestamp DESC LIMIT ?
        `);
        const rows = stmt.all(pattern, limit) as LogRow[];
        return rows.map(mapRow);
      }
    },

    getRecentLog(limit: number, project?: string): LogEntry[] {
      const rows = (project
        ? stmts.getRecentLogByProject.all(project, limit)
        : stmts.getRecentLog.all(limit)) as LogRow[];
      return rows.map(r => ({
        id: r.id,
        sessionId: r.session_id,
        role: r.role as LogEntry["role"],
        content: r.content,
        timestamp: r.timestamp,
        project: r.project,
        metadata: JSON.parse(r.metadata) as Record<string, unknown>,
      }));
    },

    // ── Versioning ──────────────────────────────────────────
    snapshotVersion(memoryId: string, reason: string): void {
      const mem = this.getById(memoryId);
      if (!mem) return;
      stmts.insertVersion.run(randomUUID(), mem.id, mem.content, mem.confidence, Date.now(), reason);
    },

    getVersionHistory(memoryId: string): MemoryVersion[] {
      const rows = stmts.getVersions.all(memoryId) as VersionRow[];
      return rows.map(r => ({
        versionId: r.version_id,
        memoryId: r.memory_id,
        content: r.content,
        confidence: r.confidence,
        editedAt: r.edited_at,
        reason: r.reason,
      }));
    },

    patchMemory(id: string, patch: PatchInput): boolean {
      const mem = this.getById(id);
      if (!mem) return false;
      // Snapshot before patching
      this.snapshotVersion(id, `before patch: ${patch.reason}`);
      const now = Date.now();
      switch (patch.field) {
        case "content":
          stmts.updateContent.run(patch.value as string, now, id);
          break;
        case "confidence":
          stmts.updateConfidence.run(patch.value as number, now, id);
          break;
        case "tags":
          stmts.updateTags.run(JSON.stringify(patch.value as string[]), now, id);
          break;
        case "type":
          stmts.updateType.run(patch.value as string, now, id);
          break;
        default:
          return false;
      }
      return true;
    },

    // ── Relations ────────────────────────────────────────────
    addRelation(fromId: string, toId: string, type: string, strength = 0.8): string {
      const id = randomUUID();
      stmts.insertRelation.run(id, fromId, toId, type, strength, Date.now());
      return id;
    },

    getRelations(memoryId: string): MemoryRelation[] {
      const from = stmts.getRelationsFrom.all(memoryId) as RelationRow[];
      const to = stmts.getRelationsTo.all(memoryId) as RelationRow[];
      return [...from, ...to].map(r => ({
        id: r.id,
        fromId: r.from_id,
        toId: r.to_id,
        relationshipType: r.relationship_type,
        strength: r.strength,
        createdAt: r.created_at,
      }));
    },

    removeRelation(relationId: string): void {
      stmts.deleteRelation.run(relationId);
    },

    getRelatedMemories(memoryId: string): Memory[] {
      const relations = this.getRelations(memoryId);
      const ids = relations.map(r => r.fromId === memoryId ? r.toId : r.fromId);
      return ids
        .map(id => this.getById(id))
        .filter((m): m is Memory => m !== null);
    },

    // ── Temporal queries ─────────────────────────────────────
    getMemoriesByDateRange(from: number, to: number): Memory[] {
      const rows = stmts.getByDateRange.all(from, to) as MemoryRow[];
      return rows.map(rowToMemory);
    },

    getMemoriesSince(timestamp: number): Memory[] {
      const rows = stmts.getSince.all(timestamp) as MemoryRow[];
      return rows.map(rowToMemory);
    },

    // ── Full-text search ─────────────────────────────────────
    fullTextSearch(query: string, limit = 20, scopeProject?: string): Memory[] {
      try {
        if (scopeProject) {
          const stmt = db.prepare(`
            SELECT memories.* FROM memories_fts
            JOIN memories ON memories.id = memories_fts.id
            WHERE memories_fts MATCH ? AND (memories.scope = 'global' OR memories.scope = ?)
            ORDER BY rank
            LIMIT ?
          `);
          const rows = stmt.all(query, scopeProject, limit) as MemoryRow[];
          return rows.map(rowToMemory);
        }
        const stmt = db.prepare(`
          SELECT memories.* FROM memories_fts
          JOIN memories ON memories.id = memories_fts.id
          WHERE memories_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `);
        const rows = stmt.all(query, limit) as MemoryRow[];
        return rows.map(rowToMemory);
      } catch {
        // FTS may fail on complex queries — fall back to LIKE
        const escaped = query.replace(/[%_]/g, ch => "\\" + ch);
        const pattern = `%${escaped}%`;
        if (scopeProject) {
          const stmt = db.prepare(`
            SELECT * FROM memories WHERE (content LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')
            AND (scope = 'global' OR scope = ?) ORDER BY last_accessed DESC LIMIT ?
          `);
          const rows = stmt.all(pattern, pattern, scopeProject, limit) as MemoryRow[];
          return rows.map(rowToMemory);
        }
        const stmt = db.prepare(`
          SELECT * FROM memories WHERE content LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\' ORDER BY last_accessed DESC LIMIT ?
        `);
        const rows = stmt.all(pattern, pattern, limit) as MemoryRow[];
        return rows.map(rowToMemory);
      }
    },
  };
}
