import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Copy of backupDatabase from src/index.ts (not exported)
const BACKUP_THROTTLE_MS = 60 * 60 * 1000; // 1 hour

function backupDatabase(dbPath: string): void {
  try {
    if (!fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0) return;
    const backupDir = path.join(path.dirname(dbPath), "backups");
    fs.mkdirSync(backupDir, { recursive: true });

    // Throttle: skip if the most recent backup is less than 1 hour old
    const existing = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith("memory-") && f.endsWith(".db"))
      .sort()
      .reverse();
    if (existing.length > 0) {
      const lastTs = parseInt(
        existing[0].replace("memory-", "").replace(".db", ""),
        10
      );
      if (!isNaN(lastTs) && Date.now() - lastTs < BACKUP_THROTTLE_MS) return;
    }

    const backupPath = path.join(backupDir, `memory-${Date.now()}.db`);
    fs.copyFileSync(dbPath, backupPath);

    // Keep only the 3 most recent backups
    const backups = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith("memory-") && f.endsWith(".db"))
      .sort()
      .reverse();
    for (const old of backups.slice(3)) {
      fs.unlinkSync(path.join(backupDir, old));
    }
  } catch (error) {
    console.error(
      "[amem] Backup failed:",
      error instanceof Error ? error.message : String(error)
    );
  }
}

describe("backupDatabase", () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amem-backup-test-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("skips when DB file does not exist", () => {
    const tmpDir = makeTempDir();
    const dbPath = path.join(tmpDir, "nonexistent.db");

    backupDatabase(dbPath);

    const backupDir = path.join(tmpDir, "backups");
    expect(fs.existsSync(backupDir)).toBe(false);
  });

  it("skips when DB file is empty (zero bytes)", () => {
    const tmpDir = makeTempDir();
    const dbPath = path.join(tmpDir, "empty.db");
    fs.writeFileSync(dbPath, "");

    backupDatabase(dbPath);

    const backupDir = path.join(tmpDir, "backups");
    expect(fs.existsSync(backupDir)).toBe(false);
  });

  it("creates a backup of an existing DB", () => {
    const tmpDir = makeTempDir();
    const dbPath = path.join(tmpDir, "test.db");
    fs.writeFileSync(dbPath, "some data");

    backupDatabase(dbPath);

    const backupDir = path.join(tmpDir, "backups");
    expect(fs.existsSync(backupDir)).toBe(true);

    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith("memory-") && f.endsWith(".db"));
    expect(files).toHaveLength(1);
  });

  it("keeps only 3 most recent backups when more are created", () => {
    const tmpDir = makeTempDir();
    const dbPath = path.join(tmpDir, "test.db");
    fs.writeFileSync(dbPath, "data");
    const backupDir = path.join(tmpDir, "backups");
    fs.mkdirSync(backupDir, { recursive: true });

    // Pre-seed 5 old backup files with timestamps older than the throttle window
    const baseTs = Date.now() - BACKUP_THROTTLE_MS * 10;
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(
        path.join(backupDir, `memory-${baseTs + i * 1000}.db`),
        "old"
      );
    }

    // One more call should add a new backup and then trim to 3 total
    backupDatabase(dbPath);

    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith("memory-") && f.endsWith(".db"));
    expect(files).toHaveLength(3);
  });

  it("backup file contains the same data as the original", () => {
    const tmpDir = makeTempDir();
    const dbPath = path.join(tmpDir, "test.db");
    const content = "important database content 12345";
    fs.writeFileSync(dbPath, content);

    backupDatabase(dbPath);

    const backupDir = path.join(tmpDir, "backups");
    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith("memory-") && f.endsWith(".db"));
    expect(files).toHaveLength(1);

    const backupContent = fs.readFileSync(
      path.join(backupDir, files[0]),
      "utf-8"
    );
    expect(backupContent).toBe(content);

    // Also verify file sizes match
    const originalSize = fs.statSync(dbPath).size;
    const backupSize = fs.statSync(path.join(backupDir, files[0])).size;
    expect(backupSize).toBe(originalSize);
  });

  it("works with deeply nested directory paths", () => {
    const tmpDir = makeTempDir();
    const deepDir = path.join(tmpDir, "a", "b", "c", "d");
    fs.mkdirSync(deepDir, { recursive: true });
    const dbPath = path.join(deepDir, "nested.db");
    fs.writeFileSync(dbPath, "nested data");

    backupDatabase(dbPath);

    const backupDir = path.join(deepDir, "backups");
    expect(fs.existsSync(backupDir)).toBe(true);

    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith("memory-") && f.endsWith(".db"));
    expect(files).toHaveLength(1);

    const backupContent = fs.readFileSync(
      path.join(backupDir, files[0]),
      "utf-8"
    );
    expect(backupContent).toBe("nested data");
  });

  it("skips backup when last backup is less than 1 hour old", () => {
    const tmpDir = makeTempDir();
    const dbPath = path.join(tmpDir, "test.db");
    fs.writeFileSync(dbPath, "data");
    const backupDir = path.join(tmpDir, "backups");
    fs.mkdirSync(backupDir, { recursive: true });

    // Pre-seed a backup file with a timestamp from 30 minutes ago (within throttle window)
    const recentTs = Date.now() - 30 * 60 * 1000;
    fs.writeFileSync(
      path.join(backupDir, `memory-${recentTs}.db`),
      "recent backup"
    );

    backupDatabase(dbPath);

    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith("memory-") && f.endsWith(".db"));
    // Still only the 1 pre-seeded file — no new backup was created
    expect(files).toHaveLength(1);
    expect(files[0]).toBe(`memory-${recentTs}.db`);
  });

  it("creates a new backup when last backup is more than 1 hour old", () => {
    const tmpDir = makeTempDir();
    const dbPath = path.join(tmpDir, "test.db");
    fs.writeFileSync(dbPath, "data");
    const backupDir = path.join(tmpDir, "backups");
    fs.mkdirSync(backupDir, { recursive: true });

    // Pre-seed a backup file with a timestamp from 2 hours ago (outside throttle window)
    const oldTs = Date.now() - 2 * 60 * 60 * 1000;
    fs.writeFileSync(
      path.join(backupDir, `memory-${oldTs}.db`),
      "old backup"
    );

    backupDatabase(dbPath);

    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith("memory-") && f.endsWith(".db"));
    // 2 files: the old pre-seeded one and the new backup
    expect(files).toHaveLength(2);
  });
});

