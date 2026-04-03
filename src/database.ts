import Database from "better-sqlite3";
import { randomUUID, createHash } from "node:crypto";
import type { Memory, MemoryTypeValue } from "./memory.js";

export interface MemoryInput {
  content: string;
  type: MemoryTypeValue;
  tags: string[];
  confidence: number;
  source: string;
  embedding: Float32Array | null;
  scope: string;
  validFrom?: number;
  validUntil?: number;
  tier?: string;
}

export interface SessionSummary {
  id: string;
  sessionId: string;
  summary: string;
  keyDecisions: string[];
  keyCorrections: string[];
  memoriesExtracted: number;
  project: string;
  createdAt: number;
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
  validFrom?: number | null;
  validUntil?: number | null;
}

export interface PatchInput {
  field: "content" | "confidence" | "tags" | "type";
  value: string | number | string[];
  reason: string;
  skipSnapshot?: boolean;
}

export interface KnowledgeGap {
  id: string;
  queryPattern: string;
  hitCount: number;
  avgConfidence: number;
  avgResults: number;
  firstSeen: number;
  lastSeen: number;
  resolved: boolean;
}

export interface AmemDatabase {
  insertMemory(input: MemoryInput): string;
  findByContentHash(content: string): Memory | null;
  getById(id: string): Memory | null;
  searchByType(type: MemoryTypeValue): Memory[];
  searchByTag(tag: string): Memory[];
  getAllWithEmbeddings(): Memory[];
  getRecentWithEmbeddings(limit: number): Memory[];
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
  deleteLogBefore(timestamp: number): number;
  getLogCount(): number;
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
  // Reminders
  insertReminder(content: string, dueAt: number | null, scope: string): string;
  listReminders(includeCompleted?: boolean, scope?: string): Array<{ id: string; content: string; dueAt: number | null; completed: boolean; createdAt: number; scope: string }>;
  checkReminders(): Array<{ id: string; content: string; dueAt: number | null; status: "overdue" | "today" | "upcoming"; scope: string }>;
  completeReminder(id: string): boolean;
  // Efficient aggregation (no full table load)
  getConfidenceStats(): { high: number; medium: number; low: number };
  getEmbeddingCount(): number;
  // Utilities
  transaction(fn: () => void): void;
  resolveId(partialId: string): string | null;
  resolveReminderId(partialId: string): string | null;
  getAllRelations(): MemoryRelation[];
  // Temporal validity
  expireMemory(id: string, timestamp?: number): void;
  getValidMemories(asOf?: number): Memory[];
  updateTier(id: string, tier: string): void;
  getByTier(tier: string, scope?: string): Memory[];
  // Session summaries
  insertSummary(input: { sessionId: string; summary: string; keyDecisions: string[]; keyCorrections: string[]; memoriesExtracted: number; project: string }): string;
  getSummaryBySession(sessionId: string): SessionSummary | null;
  getRecentSummaries(project: string, limit?: number): SessionSummary[];
  // Temporal relations
  expireRelation(relationId: string, timestamp?: number): void;
  getValidRelations(asOf?: number): MemoryRelation[];
  // ── Self-evolving loop (v0.19) ────────��──────────────
  // Synthesis lineage
  insertSynthesisLineage(synthesisId: string, sourceIds: string[]): void;
  getSynthesisSources(synthesisId: string): string[];
  hasAnySynthesis(sourceIds: string[]): boolean;
  // Knowledge gaps
  upsertKnowledgeGap(queryPattern: string, avgConfidence: number, resultCount: number): string;
  getActiveKnowledgeGaps(limit?: number): KnowledgeGap[];
  resolveKnowledgeGap(id: string): void;
  // Utility score
  bumpUtilityScore(id: string): void;
  // Reflection metadata
  getReflectionMeta(key: string): string | null;
  setReflectionMeta(key: string, value: string): void;
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
  valid_from: number | null;
  valid_until: number | null;
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
  valid_from: number | null;
  valid_until: number | null;
  tier: string;
  utility_score: number;
}

interface KnowledgeGapRow {
  id: string;
  query_pattern: string;
  hit_count: number;
  avg_confidence: number;
  avg_results: number;
  first_seen: number;
  last_seen: number;
  resolved: number;
}

interface SummaryRow {
  id: string;
  session_id: string;
  summary: string;
  key_decisions: string;
  key_corrections: string;
  memories_extracted: number;
  project: string;
  created_at: number;
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
    validFrom: row.valid_from ?? row.created_at,
    validUntil: row.valid_until ?? null,
    tier: (row.tier ?? 'archival') as Memory['tier'],
    utilityScore: row.utility_score ?? 0,
  };
}

function rowToSummary(row: SummaryRow): SessionSummary {
  return {
    id: row.id,
    sessionId: row.session_id,
    summary: row.summary,
    keyDecisions: JSON.parse(row.key_decisions) as string[],
    keyCorrections: JSON.parse(row.key_corrections) as string[],
    memoriesExtracted: row.memories_extracted,
    project: row.project,
    createdAt: row.created_at,
  };
}

function rowToRelation(r: RelationRow): MemoryRelation {
  return {
    id: r.id,
    fromId: r.from_id,
    toId: r.to_id,
    relationshipType: r.relationship_type,
    strength: r.strength,
    createdAt: r.created_at,
    validFrom: r.valid_from ?? null,
    validUntil: r.valid_until ?? null,
  };
}

export function createDatabase(dbPath: string): AmemDatabase {
  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000"); // Wait up to 5s for lock — enables multi-process safety

  // Expose transaction support for atomic multi-step operations
  const runTransaction = db.transaction((fn: () => void) => fn());

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

    -- Reminders
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      due_at INTEGER,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      scope TEXT NOT NULL DEFAULT 'global'
    );
    CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(due_at);
    CREATE INDEX IF NOT EXISTS idx_reminders_completed ON reminders(completed);

    -- Session summaries
    CREATE TABLE IF NOT EXISTS session_summaries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      key_decisions TEXT NOT NULL DEFAULT '[]',
      key_corrections TEXT NOT NULL DEFAULT '[]',
      memories_extracted INTEGER NOT NULL DEFAULT 0,
      project TEXT NOT NULL DEFAULT 'global',
      created_at INTEGER NOT NULL,
      UNIQUE(session_id)
    );
    CREATE INDEX IF NOT EXISTS idx_summaries_session ON session_summaries(session_id);
    CREATE INDEX IF NOT EXISTS idx_summaries_project ON session_summaries(project);
  `);

  // ── Schema migrations ──────────────────────────────────
  // Versioned migration system — each migration runs exactly once.
  // New migrations MUST be appended to the end of this array.

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);

  const appliedVersions = new Set(
    (db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map(r => r.version),
  );

  const hasColumn = (table: string, column: string): boolean => {
    const cols = db.pragma(`table_info(${table})`) as { name: string }[];
    return cols.some(c => c.name === column);
  };

  const migrations: Array<{ version: number; name: string; up: () => void }> = [
    {
      version: 1,
      name: "add_scope_column",
      up: () => {
        if (!hasColumn("memories", "scope")) {
          db.exec(`ALTER TABLE memories ADD COLUMN scope TEXT NOT NULL DEFAULT 'global'`);
        }
        db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope)`);
      },
    },
    {
      version: 2,
      name: "add_content_hash",
      up: () => {
        if (!hasColumn("memories", "content_hash")) {
          db.exec(`ALTER TABLE memories ADD COLUMN content_hash TEXT`);
          const allRows = db.prepare("SELECT id, content FROM memories").all() as { id: string; content: string }[];
          const updateHash = db.prepare("UPDATE memories SET content_hash = ? WHERE id = ?");
          for (const row of allRows) {
            updateHash.run(createHash("sha256").update(row.content).digest("hex").slice(0, 16), row.id);
          }
        }
        db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_content_hash ON memories(content_hash)`);
      },
    },
    {
      version: 3,
      name: "add_temporal_validity_and_tiers",
      up: () => {
        if (!hasColumn("memories", "valid_from")) {
          db.exec(`ALTER TABLE memories ADD COLUMN valid_from INTEGER`);
          db.exec(`ALTER TABLE memories ADD COLUMN valid_until INTEGER`);
          db.exec(`ALTER TABLE memories ADD COLUMN tier TEXT NOT NULL DEFAULT 'archival'`);
          db.exec(`UPDATE memories SET valid_from = created_at WHERE valid_from IS NULL`);
        }
        db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_valid_until ON memories(valid_until)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_tier ON memories(tier)`);
      },
    },
    {
      version: 4,
      name: "add_temporal_relations",
      up: () => {
        if (!hasColumn("memory_relations", "valid_from")) {
          db.exec(`ALTER TABLE memory_relations ADD COLUMN valid_from INTEGER`);
          db.exec(`ALTER TABLE memory_relations ADD COLUMN valid_until INTEGER`);
          db.exec(`UPDATE memory_relations SET valid_from = created_at WHERE valid_from IS NULL`);
        }
      },
    },
    {
      version: 5,
      name: "add_self_evolving_loop_support",
      up: () => {
        if (!hasColumn("memories", "utility_score")) {
          db.exec("ALTER TABLE memories ADD COLUMN utility_score INTEGER NOT NULL DEFAULT 0");
        }
        db.exec("CREATE TABLE IF NOT EXISTS synthesis_lineage (synthesis_id TEXT NOT NULL, source_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(synthesis_id, source_id), FOREIGN KEY(synthesis_id) REFERENCES memories(id) ON DELETE CASCADE, FOREIGN KEY(source_id) REFERENCES memories(id) ON DELETE CASCADE)");
        db.exec("CREATE INDEX IF NOT EXISTS idx_lineage_synthesis ON synthesis_lineage(synthesis_id)");
        db.exec("CREATE INDEX IF NOT EXISTS idx_lineage_source ON synthesis_lineage(source_id)");
        db.exec("CREATE TABLE IF NOT EXISTS knowledge_gaps (id TEXT PRIMARY KEY, query_pattern TEXT NOT NULL, hit_count INTEGER NOT NULL DEFAULT 1, avg_confidence REAL NOT NULL DEFAULT 0, avg_results INTEGER NOT NULL DEFAULT 0, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, resolved INTEGER NOT NULL DEFAULT 0)");
        db.exec("CREATE INDEX IF NOT EXISTS idx_gaps_resolved ON knowledge_gaps(resolved)");
        db.exec("CREATE INDEX IF NOT EXISTS idx_gaps_hit_count ON knowledge_gaps(hit_count)");
        db.exec("CREATE TABLE IF NOT EXISTS reflection_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)");
      },
    },
  ];

  const insertMigration = db.prepare(
    "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
  );

  for (const m of migrations) {
    if (appliedVersions.has(m.version)) continue;
    m.up();
    insertMigration.run(m.version, m.name, Date.now());
  }

  const stmts = {
    insert: db.prepare(`
      INSERT INTO memories (id, content, type, tags, confidence, access_count, created_at, last_accessed, source, embedding, scope, content_hash, valid_from, valid_until, tier)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getById: db.prepare(`SELECT * FROM memories WHERE id = ?`),
    searchByType: db.prepare(`SELECT * FROM memories WHERE type = ? ORDER BY last_accessed DESC`),
    searchByTag: db.prepare(`SELECT * FROM memories WHERE tags LIKE ? ORDER BY last_accessed DESC`),
    getAllWithEmbeddings: db.prepare(`SELECT * FROM memories WHERE embedding IS NOT NULL`),
    getRecentWithEmbeddings: db.prepare(`SELECT * FROM memories WHERE embedding IS NOT NULL ORDER BY last_accessed DESC LIMIT ?`),
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
    countHighConf: db.prepare(`SELECT COUNT(*) as count FROM memories WHERE confidence >= 0.8`),
    countMedConf: db.prepare(`SELECT COUNT(*) as count FROM memories WHERE confidence >= 0.5 AND confidence < 0.8`),
    countLowConf: db.prepare(`SELECT COUNT(*) as count FROM memories WHERE confidence < 0.5`),
    countWithEmbeddings: db.prepare(`SELECT COUNT(*) as count FROM memories WHERE embedding IS NOT NULL`),
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
    deleteLogBefore: db.prepare(`DELETE FROM conversation_log WHERE timestamp < ?`),
    countLog: db.prepare(`SELECT COUNT(*) as count FROM conversation_log`),
    // Versions
    insertVersion: db.prepare(`
      INSERT INTO memory_versions (version_id, memory_id, content, confidence, edited_at, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    getVersions: db.prepare(`SELECT * FROM memory_versions WHERE memory_id = ? ORDER BY edited_at DESC`),
    // Relations
    insertRelation: db.prepare(`
      INSERT OR REPLACE INTO memory_relations (id, from_id, to_id, relationship_type, strength, created_at, valid_from)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    getRelationsFrom: db.prepare(`SELECT * FROM memory_relations WHERE from_id = ?`),
    getRelationsTo: db.prepare(`SELECT * FROM memory_relations WHERE to_id = ?`),
    deleteRelation: db.prepare(`DELETE FROM memory_relations WHERE id = ?`),
    // Reminders
    insertReminder: db.prepare("INSERT INTO reminders (id, content, due_at, completed, created_at, scope) VALUES (?, ?, ?, 0, ?, ?)"),
    listReminders: db.prepare("SELECT * FROM reminders WHERE completed = 0 ORDER BY due_at ASC NULLS LAST"),
    listAllReminders: db.prepare("SELECT * FROM reminders ORDER BY due_at ASC NULLS LAST"),
    listRemindersByScope: db.prepare("SELECT * FROM reminders WHERE completed = 0 AND (scope = 'global' OR scope = ?) ORDER BY due_at ASC NULLS LAST"),
    listAllRemindersByScope: db.prepare("SELECT * FROM reminders WHERE (scope = 'global' OR scope = ?) ORDER BY due_at ASC NULLS LAST"),
    completeReminder: db.prepare("UPDATE reminders SET completed = 1 WHERE id = ?"),
    // Content hash dedup
    findByContentHash: db.prepare("SELECT * FROM memories WHERE content_hash = ? LIMIT 1"),
    // ID resolution via SQL prefix match (avoids full table scan)
    resolveIdPrefix: db.prepare("SELECT id FROM memories WHERE id LIKE ? LIMIT 2"),
    resolveReminderIdPrefix: db.prepare("SELECT id FROM reminders WHERE id LIKE ? LIMIT 2"),
    // Batch relation loading
    getAllRelations: db.prepare("SELECT * FROM memory_relations ORDER BY created_at DESC"),
    // Temporal validity
    getValidMemories: db.prepare(`SELECT * FROM memories WHERE (valid_until IS NULL OR valid_until > ?) ORDER BY last_accessed DESC`),
    expireMemory: db.prepare(`UPDATE memories SET valid_until = ? WHERE id = ?`),
    updateTier: db.prepare(`UPDATE memories SET tier = ?, last_accessed = ? WHERE id = ?`),
    getByTier: db.prepare(`SELECT * FROM memories WHERE tier = ? ORDER BY last_accessed DESC`),
    getByTierAndScope: db.prepare(`SELECT * FROM memories WHERE tier = ? AND (scope = 'global' OR scope = ?) ORDER BY last_accessed DESC`),
    // Session summaries
    insertSummary: db.prepare(`INSERT OR REPLACE INTO session_summaries (id, session_id, summary, key_decisions, key_corrections, memories_extracted, project, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
    getSummaryBySession: db.prepare(`SELECT * FROM session_summaries WHERE session_id = ?`),
    getRecentSummaries: db.prepare(`SELECT * FROM session_summaries WHERE project = ? ORDER BY created_at DESC LIMIT ?`),
    // Temporal relations
    expireRelation: db.prepare(`UPDATE memory_relations SET valid_until = ? WHERE id = ?`),
    getValidRelations: db.prepare(`SELECT * FROM memory_relations WHERE (valid_until IS NULL OR valid_until > ?) ORDER BY created_at DESC`),
    // Self-evolving loop
    insertLineage: db.prepare(`INSERT OR IGNORE INTO synthesis_lineage (synthesis_id, source_id, created_at) VALUES (?, ?, ?)`),
    getLineageSources: db.prepare(`SELECT source_id FROM synthesis_lineage WHERE synthesis_id = ?`),
    getLineageBySrc: db.prepare(`SELECT DISTINCT synthesis_id FROM synthesis_lineage WHERE source_id = ?`),
    findGapByPattern: db.prepare(`SELECT * FROM knowledge_gaps WHERE query_pattern = ? AND resolved = 0 LIMIT 1`),
    insertGap: db.prepare(`INSERT INTO knowledge_gaps (id, query_pattern, hit_count, avg_confidence, avg_results, first_seen, last_seen, resolved) VALUES (?, ?, 1, ?, ?, ?, ?, 0)`),
    updateGap: db.prepare(`UPDATE knowledge_gaps SET hit_count = hit_count + 1, avg_confidence = ?, avg_results = ?, last_seen = ? WHERE id = ?`),
    getActiveGaps: db.prepare(`SELECT * FROM knowledge_gaps WHERE resolved = 0 ORDER BY hit_count DESC LIMIT ?`),
    resolveGap: db.prepare(`UPDATE knowledge_gaps SET resolved = 1 WHERE id = ?`),
    bumpUtility: db.prepare(`UPDATE memories SET utility_score = utility_score + 1 WHERE id = ?`),
    getMeta: db.prepare(`SELECT value FROM reflection_meta WHERE key = ?`),
    setMeta: db.prepare(`INSERT OR REPLACE INTO reflection_meta (key, value, updated_at) VALUES (?, ?, ?)`),
  };

  // Keep FTS index in sync via triggers.
  // External-content FTS5 tables require explicit rowid in all operations.
  // Drop and recreate triggers to pick up the rowid fix for existing DBs.
  db.exec(`
    DROP TRIGGER IF EXISTS memories_ai;
    DROP TRIGGER IF EXISTS memories_ad;
    DROP TRIGGER IF EXISTS memories_au;
    DROP TRIGGER IF EXISTS log_ai;
    DROP TRIGGER IF EXISTS log_ad;
    DROP TRIGGER IF EXISTS log_au;

    CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, id, content, tags) VALUES (new.rowid, new.id, new.content, new.tags);
    END;
    CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, id, content, tags) VALUES ('delete', old.rowid, old.id, old.content, old.tags);
    END;
    CREATE TRIGGER memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, id, content, tags) VALUES ('delete', old.rowid, old.id, old.content, old.tags);
      INSERT INTO memories_fts(rowid, id, content, tags) VALUES (new.rowid, new.id, new.content, new.tags);
    END;
    CREATE TRIGGER log_ai AFTER INSERT ON conversation_log BEGIN
      INSERT INTO log_fts(rowid, id, content) VALUES (new.rowid, new.id, new.content);
    END;
    CREATE TRIGGER log_ad AFTER DELETE ON conversation_log BEGIN
      INSERT INTO log_fts(log_fts, rowid, id, content) VALUES ('delete', old.rowid, old.id, old.content);
    END;
    CREATE TRIGGER log_au AFTER UPDATE ON conversation_log BEGIN
      INSERT INTO log_fts(log_fts, rowid, id, content) VALUES ('delete', old.rowid, old.id, old.content);
      INSERT INTO log_fts(rowid, id, content) VALUES (new.rowid, new.id, new.content);
    END;
  `);

  return {
    insertMemory(input: MemoryInput): string {
      const id = randomUUID();
      const now = Date.now();
      const embeddingBuffer = input.embedding
        ? Buffer.from(input.embedding.buffer, input.embedding.byteOffset, input.embedding.byteLength)
        : null;
      const contentHash = createHash("sha256").update(input.content).digest("hex").slice(0, 16);
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
        contentHash,
        input.validFrom ?? now,
        input.validUntil ?? null,
        input.tier ?? "archival",
      );
      return id;
    },

    findByContentHash(content: string): Memory | null {
      const hash = createHash("sha256").update(content).digest("hex").slice(0, 16);
      const row = stmts.findByContentHash.get(hash) as MemoryRow | undefined;
      return row ? rowToMemory(row) : null;
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

    getRecentWithEmbeddings(limit: number): Memory[] {
      const rows = stmts.getRecentWithEmbeddings.all(limit) as MemoryRow[];
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

    getConfidenceStats(): { high: number; medium: number; low: number } {
      return {
        high: (stmts.countHighConf.get() as { count: number }).count,
        medium: (stmts.countMedConf.get() as { count: number }).count,
        low: (stmts.countLowConf.get() as { count: number }).count,
      };
    },

    getEmbeddingCount(): number {
      return (stmts.countWithEmbeddings.get() as { count: number }).count;
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
      } catch (error) {
        // FTS5 may fail on special characters — fall back to LIKE
        console.error("[amem] FTS5 log search failed, falling back to LIKE:", error instanceof Error ? error.message : String(error));
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

    deleteLogBefore(timestamp: number): number {
      const result = stmts.deleteLogBefore.run(timestamp);
      return result.changes;
    },

    getLogCount(): number {
      return (stmts.countLog.get() as { count: number }).count;
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
      // Snapshot before patching (can be skipped for batch operations like restore)
      if (!patch.skipSnapshot) {
        this.snapshotVersion(id, `before patch: ${patch.reason}`);
      }
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
      const now = Date.now();
      stmts.insertRelation.run(id, fromId, toId, type, strength, now, now);
      return id;
    },

    getRelations(memoryId: string): MemoryRelation[] {
      const from = stmts.getRelationsFrom.all(memoryId) as RelationRow[];
      const to = stmts.getRelationsTo.all(memoryId) as RelationRow[];
      return [...from, ...to].map(rowToRelation);
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

    // ── Reminders ────────────────────────────────────────────
    insertReminder(content: string, dueAt: number | null, scope: string): string {
      const id = randomUUID();
      stmts.insertReminder.run(id, content, dueAt, Date.now(), scope);
      return id;
    },

    listReminders(includeCompleted = false, scope?: string): Array<{ id: string; content: string; dueAt: number | null; completed: boolean; createdAt: number; scope: string }> {
      const rows = (scope
        ? (includeCompleted ? stmts.listAllRemindersByScope.all(scope) : stmts.listRemindersByScope.all(scope))
        : (includeCompleted ? stmts.listAllReminders.all() : stmts.listReminders.all())
      ) as Array<{ id: string; content: string; due_at: number | null; completed: number; created_at: number; scope: string }>;
      return rows.map(r => ({
        id: r.id, content: r.content, dueAt: r.due_at,
        completed: r.completed === 1, createdAt: r.created_at, scope: r.scope,
      }));
    },

    checkReminders(): Array<{ id: string; content: string; dueAt: number | null; status: "overdue" | "today" | "upcoming"; scope: string }> {
      const reminders = this.listReminders();
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
      const weekFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;

      return reminders
        .filter(r => r.dueAt !== null)
        .map(r => {
          let status: "overdue" | "today" | "upcoming";
          if (r.dueAt! < todayStart.getTime()) status = "overdue";
          else if (r.dueAt! <= todayEnd.getTime()) status = "today";
          else status = "upcoming";
          return { id: r.id, content: r.content, dueAt: r.dueAt, status, scope: r.scope };
        })
        .filter(r => r.status === "overdue" || r.status === "today" || r.dueAt! <= weekFromNow);
    },

    completeReminder(id: string): boolean {
      const result = stmts.completeReminder.run(id);
      return result.changes > 0;
    },

    // ── Full-text search ─────────────────────────────────────
    fullTextSearch(query: string, limit = 20, scopeProject?: string): Memory[] {
      try {
        // Sanitize query for FTS5: quote each token to prevent column prefix
        // interpretation (e.g. "partner:" being parsed as column "partner")
        const sanitized = query
          .replace(/["\u201C\u201D]/g, "") // strip existing quotes
          .split(/\s+/)
          .filter(Boolean)
          .map(token => `"${token.replace(/:/g, "")}"`) // quote tokens, strip colons
          .join(" ");
        if (!sanitized) throw new Error("empty query after sanitization");
        if (scopeProject) {
          const stmt = db.prepare(`
            SELECT memories.* FROM memories_fts
            JOIN memories ON memories.id = memories_fts.id
            WHERE memories_fts MATCH ? AND (memories.scope = 'global' OR memories.scope = ?)
            ORDER BY rank
            LIMIT ?
          `);
          const rows = stmt.all(sanitized, scopeProject, limit) as MemoryRow[];
          return rows.map(rowToMemory);
        }
        const stmt = db.prepare(`
          SELECT memories.* FROM memories_fts
          JOIN memories ON memories.id = memories_fts.id
          WHERE memories_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `);
        const rows = stmt.all(sanitized, limit) as MemoryRow[];
        return rows.map(rowToMemory);
      } catch (error) {
        // FTS may fail on complex queries — fall back to LIKE
        console.error("[amem] FTS5 memory search failed, falling back to LIKE:", error instanceof Error ? error.message : String(error));
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

    // ── Utilities ────────────────────────────────────────────
    transaction(fn: () => void): void {
      runTransaction(fn);
    },

    resolveId(partialId: string): string | null {
      if (partialId.length >= 36) {
        const mem = this.getById(partialId);
        return mem ? partialId : null;
      }
      const rows = stmts.resolveIdPrefix.all(`${partialId}%`) as { id: string }[];
      if (rows.length === 1) return rows[0].id;
      return null;
    },

    resolveReminderId(partialId: string): string | null {
      if (partialId.length >= 36) return partialId;
      const rows = stmts.resolveReminderIdPrefix.all(`${partialId}%`) as { id: string }[];
      if (rows.length === 1) return rows[0].id;
      return null;
    },

    getAllRelations(): MemoryRelation[] {
      const rows = stmts.getAllRelations.all() as RelationRow[];
      return rows.map(rowToRelation);
    },

    // ── Temporal validity ───────────────────────────────────
    expireMemory(id: string, timestamp?: number): void {
      stmts.expireMemory.run(timestamp ?? Date.now(), id);
    },

    getValidMemories(asOf?: number): Memory[] {
      const rows = stmts.getValidMemories.all(asOf ?? Date.now()) as MemoryRow[];
      return rows.map(rowToMemory);
    },

    updateTier(id: string, tier: string): void {
      stmts.updateTier.run(tier, Date.now(), id);
    },

    getByTier(tier: string, scope?: string): Memory[] {
      const rows = scope
        ? stmts.getByTierAndScope.all(tier, scope) as MemoryRow[]
        : stmts.getByTier.all(tier) as MemoryRow[];
      return rows.map(rowToMemory);
    },

    // ── Session summaries ───────────────────────────────────
    insertSummary(input: { sessionId: string; summary: string; keyDecisions: string[]; keyCorrections: string[]; memoriesExtracted: number; project: string }): string {
      const id = randomUUID();
      stmts.insertSummary.run(
        id,
        input.sessionId,
        input.summary,
        JSON.stringify(input.keyDecisions),
        JSON.stringify(input.keyCorrections),
        input.memoriesExtracted,
        input.project,
        Date.now(),
      );
      return id;
    },

    getSummaryBySession(sessionId: string): SessionSummary | null {
      const row = stmts.getSummaryBySession.get(sessionId) as SummaryRow | undefined;
      return row ? rowToSummary(row) : null;
    },

    getRecentSummaries(project: string, limit = 10): SessionSummary[] {
      const rows = stmts.getRecentSummaries.all(project, limit) as SummaryRow[];
      return rows.map(rowToSummary);
    },

    // ── Temporal relations ──────────────────────────────────
    expireRelation(relationId: string, timestamp?: number): void {
      stmts.expireRelation.run(timestamp ?? Date.now(), relationId);
    },

    getValidRelations(asOf?: number): MemoryRelation[] {
      const rows = stmts.getValidRelations.all(asOf ?? Date.now()) as RelationRow[];
      return rows.map(rowToRelation);
    },

    // ── Self-evolving loop ─────────────────────────────────

    insertSynthesisLineage(synthesisId: string, sourceIds: string[]): void {
      const now = Date.now();
      for (const sourceId of sourceIds) {
        stmts.insertLineage.run(synthesisId, sourceId, now);
      }
    },

    getSynthesisSources(synthesisId: string): string[] {
      const rows = stmts.getLineageSources.all(synthesisId) as { source_id: string }[];
      return rows.map(r => r.source_id);
    },

    hasAnySynthesis(sourceIds: string[]): boolean {
      for (const id of sourceIds) {
        const row = stmts.getLineageBySrc.get(id) as { synthesis_id: string } | undefined;
        if (row) return true;
      }
      return false;
    },

    upsertKnowledgeGap(queryPattern: string, avgConfidence: number, resultCount: number): string {
      const now = Date.now();
      const existing = stmts.findGapByPattern.get(queryPattern) as KnowledgeGapRow | undefined;
      if (existing) {
        stmts.updateGap.run(avgConfidence, resultCount, now, existing.id);
        return existing.id;
      }
      const id = randomUUID();
      stmts.insertGap.run(id, queryPattern, avgConfidence, resultCount, now, now);
      return id;
    },

    getActiveKnowledgeGaps(limit = 10): KnowledgeGap[] {
      const rows = stmts.getActiveGaps.all(limit) as KnowledgeGapRow[];
      return rows.map(r => ({
        id: r.id,
        queryPattern: r.query_pattern,
        hitCount: r.hit_count,
        avgConfidence: r.avg_confidence,
        avgResults: r.avg_results,
        firstSeen: r.first_seen,
        lastSeen: r.last_seen,
        resolved: r.resolved === 1,
      }));
    },

    resolveKnowledgeGap(id: string): void {
      stmts.resolveGap.run(id);
    },

    bumpUtilityScore(id: string): void {
      stmts.bumpUtility.run(id);
    },

    getReflectionMeta(key: string): string | null {
      const row = stmts.getMeta.get(key) as { value: string } | undefined;
      return row?.value ?? null;
    },

    setReflectionMeta(key: string, value: string): void {
      stmts.setMeta.run(key, value, Date.now());
    },
  };
}
