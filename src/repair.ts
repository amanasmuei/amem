import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export interface RepairResult {
  status: "healthy" | "repaired" | "failed";
  integrityCheck: string;
  backupUsed: string | null;
  memoriesRecovered: number;
  message: string;
}

export function repairDatabase(dbPath: string): RepairResult {
  const backupDir = path.join(path.dirname(dbPath), "backups");

  // Step 1: Try to open and check integrity
  try {
    const db = new Database(dbPath);
    const result = db.pragma("integrity_check") as { integrity_check: string }[];
    const status = result[0]?.integrity_check ?? "unknown";

    if (status === "ok") {
      let count = 0;
      try {
        const row = db.prepare("SELECT COUNT(*) as c FROM memories").get() as { c: number };
        count = row.c;
      } catch {}
      db.close();
      return {
        status: "healthy",
        integrityCheck: "ok",
        backupUsed: null,
        memoriesRecovered: count,
        message: `Database is healthy (${count} memories).`,
      };
    }
    db.close();
  } catch {
    // DB is corrupted or unreadable — fall through
  }

  // Step 2: Find and restore from backup
  if (!fs.existsSync(backupDir)) {
    return {
      status: "failed",
      integrityCheck: "failed",
      backupUsed: null,
      memoriesRecovered: 0,
      message: "Database is corrupted and no backups found.",
    };
  }

  const backups = fs.readdirSync(backupDir)
    .filter(f => f.startsWith("memory-") && f.endsWith(".db"))
    .sort()
    .reverse();

  for (const backup of backups) {
    const backupPath = path.join(backupDir, backup);
    try {
      const testDb = new Database(backupPath);
      const check = testDb.pragma("integrity_check") as { integrity_check: string }[];
      if (check[0]?.integrity_check !== "ok") {
        testDb.close();
        continue;
      }
      const row = testDb.prepare("SELECT COUNT(*) as c FROM memories").get() as { c: number };
      const count = row.c;
      testDb.close();

      // Remove WAL/SHM files
      for (const suffix of ["-wal", "-shm"]) {
        try { fs.unlinkSync(dbPath + suffix); } catch {}
      }
      fs.copyFileSync(backupPath, dbPath);

      // Ensure restored DB uses WAL mode
      const restored = new Database(dbPath);
      restored.pragma("journal_mode = WAL");
      restored.close();

      return {
        status: "repaired",
        integrityCheck: "restored",
        backupUsed: backup,
        memoriesRecovered: count,
        message: `Restored from ${backup} (${count} memories recovered).`,
      };
    } catch {
      continue;
    }
  }

  return {
    status: "failed",
    integrityCheck: "failed",
    backupUsed: null,
    memoriesRecovered: 0,
    message: "Database is corrupted and all backups are unusable.",
  };
}
