import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Copy of backupDatabase from src/index.ts (not exported)
function backupDatabase(dbPath: string): void {
  try {
    if (!fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0) return;
    const backupDir = path.join(path.dirname(dbPath), "backups");
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });

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

  it("keeps only 3 most recent backups when more are created", async () => {
    const tmpDir = makeTempDir();
    const dbPath = path.join(tmpDir, "test.db");
    fs.writeFileSync(dbPath, "data");

    // Create 5 backups with slight time gaps to ensure unique timestamps
    for (let i = 0; i < 5; i++) {
      backupDatabase(dbPath);
      // Small delay to ensure distinct Date.now() values
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const backupDir = path.join(tmpDir, "backups");
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
});
