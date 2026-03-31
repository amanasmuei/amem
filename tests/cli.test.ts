import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createDatabase, type AmemDatabase } from "../src/database.js";
import { MemoryType } from "../src/memory.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const execFileAsync = promisify(execFile);
const CLI_PATH = path.resolve("dist/cli.js");

function makeTempDb() {
  const dbPath = path.join(
    os.tmpdir(),
    `amem-cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  const db = createDatabase(dbPath);
  return { db, dbPath };
}

async function runCli(args: string[], dbPath: string) {
  try {
    const { stdout, stderr } = await execFileAsync(
      "node",
      [CLI_PATH, ...args],
      {
        env: { ...process.env, AMEM_DB: dbPath },
        timeout: 10_000,
      },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout || "",
      stderr: error.stderr || "",
      exitCode: error.code || 1,
    };
  }
}

/** Insert a few memories into the DB for tests that need data. */
function seedDatabase(db: AmemDatabase) {
  const ids: string[] = [];
  ids.push(
    db.insertMemory({
      content: "Always use pnpm instead of npm",
      type: MemoryType.CORRECTION,
      tags: ["tooling", "pnpm"],
      confidence: 1.0,
      source: "test",
      embedding: null,
      scope: "global",
    }),
  );
  ids.push(
    db.insertMemory({
      content: "We chose PostgreSQL for the main datastore",
      type: MemoryType.DECISION,
      tags: ["database", "architecture"],
      confidence: 0.9,
      source: "test",
      embedding: null,
      scope: "global",
    }),
  );
  ids.push(
    db.insertMemory({
      content: "User prefers dark mode in all editors",
      type: MemoryType.PREFERENCE,
      tags: ["editor", "ui"],
      confidence: 0.8,
      source: "test",
      embedding: null,
      scope: "global",
    }),
  );
  ids.push(
    db.insertMemory({
      content: "TypeScript is the primary language",
      type: MemoryType.FACT,
      tags: ["language"],
      confidence: 0.95,
      source: "test",
      embedding: null,
      scope: "global",
    }),
  );
  ids.push(
    db.insertMemory({
      content: "Never commit .env files",
      type: MemoryType.CORRECTION,
      tags: ["security", "git"],
      confidence: 1.0,
      source: "test",
      embedding: null,
      scope: "global",
    }),
  );
  return ids;
}

describe("CLI (amem-cli)", () => {
  let dbPath: string;
  let db: AmemDatabase;
  let memoryIds: string[];

  beforeEach(() => {
    ({ db, dbPath } = makeTempDb());
    memoryIds = seedDatabase(db);
    db.close();
  });

  afterEach(() => {
    try {
      fs.unlinkSync(dbPath);
    } catch {}
  });

  // ── help ──────────────────────────────────────────────────────
  describe("help", () => {
    it("prints help with 'help' command", async () => {
      const { stdout, exitCode } = await runCli(["help"], dbPath);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("amem");
      expect(stdout).toContain("MEMORY");
      expect(stdout).toContain("recall");
      expect(stdout).toContain("stats");
      expect(stdout).toContain("export");
    });

    it("prints help with --help flag", async () => {
      const { stdout, exitCode } = await runCli(["--help"], dbPath);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("MEMORY");
    });

    it("prints help with -h flag", async () => {
      const { stdout, exitCode } = await runCli(["-h"], dbPath);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("MEMORY");
    });

    it("prints help when no command is given", async () => {
      const { stdout, exitCode } = await runCli([], dbPath);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("USAGE");
    });
  });

  // ── stats ─────────────────────────────────────────────────────
  describe("stats", () => {
    it("shows statistics for a populated database", async () => {
      const { stdout, exitCode } = await runCli(["stats"], dbPath);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Total memories: 5");
      expect(stdout).toContain("correction");
      expect(stdout).toContain("decision");
      expect(stdout).toContain("Confidence:");
    });

    it("shows stats for an empty database", async () => {
      const emptyDbPath = path.join(
        os.tmpdir(),
        `amem-cli-empty-${Date.now()}.db`,
      );
      const emptyDb = createDatabase(emptyDbPath);
      emptyDb.close();
      try {
        const { stdout, exitCode } = await runCli(["stats"], emptyDbPath);
        expect(exitCode).toBe(0);
        expect(stdout).toContain("Total memories: 0");
        expect(stdout).toContain("No memories stored yet");
      } finally {
        try {
          fs.unlinkSync(emptyDbPath);
        } catch {}
      }
    });
  });

  // ── list ──────────────────────────────────────────────────────
  describe("list", () => {
    it("lists all memories", async () => {
      const { stdout, exitCode } = await runCli(["list"], dbPath);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Always use pnpm instead of npm");
      expect(stdout).toContain("PostgreSQL");
      expect(stdout).toContain("5 memories.");
    });

    it("lists memories filtered by --type correction", async () => {
      const { stdout, exitCode } = await runCli(
        ["list", "--type", "correction"],
        dbPath,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("pnpm");
      expect(stdout).toContain("Never commit .env files");
      expect(stdout).toContain("2 memories.");
      // Should NOT contain memories of other types
      expect(stdout).not.toContain("PostgreSQL");
      expect(stdout).not.toContain("dark mode");
    });

    it("rejects an invalid --type", async () => {
      const { stderr, exitCode } = await runCli(
        ["list", "--type", "bogus"],
        dbPath,
      );
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("Invalid type");
    });

    it("works with the 'ls' alias", async () => {
      const { stdout, exitCode } = await runCli(["ls"], dbPath);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("5 memories.");
    });
  });

  // ── forget ────────────────────────────────────────────────────
  describe("forget", () => {
    it("deletes a memory by short ID", async () => {
      const shortId = memoryIds[0].slice(0, 8);
      const { stdout, exitCode } = await runCli(
        ["forget", shortId],
        dbPath,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Deleted");
      expect(stdout).toContain("pnpm");

      // Verify it was actually removed
      const { stdout: listOut } = await runCli(["list"], dbPath);
      expect(listOut).not.toContain("Always use pnpm instead of npm");
      expect(listOut).toContain("4 memories.");
    });

    it("works with the 'delete' alias", async () => {
      const shortId = memoryIds[1].slice(0, 8);
      const { stdout, exitCode } = await runCli(
        ["delete", shortId],
        dbPath,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Deleted");
    });

    it("errors on a non-existent ID", async () => {
      const { stderr, exitCode } = await runCli(
        ["forget", "00000000"],
        dbPath,
      );
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("No memory found");
    });

    it("errors when no ID is provided", async () => {
      const { stderr, exitCode } = await runCli(["forget"], dbPath);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("Usage");
    });
  });

  // ── export ────────────────────────────────────────────────────
  describe("export", () => {
    it("outputs markdown to stdout", async () => {
      const { stdout, exitCode } = await runCli(["export"], dbPath);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("# Amem Memory Export");
      expect(stdout).toContain("Total: 5 memories");
      expect(stdout).toContain("## Corrections");
      expect(stdout).toContain("Always use pnpm instead of npm");
    });

    it("writes markdown to a file with --file", async () => {
      const outFile = path.join(
        os.tmpdir(),
        `amem-export-${Date.now()}.md`,
      );
      try {
        const { stdout, exitCode } = await runCli(
          ["export", "--file", outFile],
          dbPath,
        );
        expect(exitCode).toBe(0);
        expect(stdout).toContain(`Exported 5 memories to ${outFile}`);

        const content = fs.readFileSync(outFile, "utf-8");
        expect(content).toContain("# Amem Memory Export");
        expect(content).toContain("PostgreSQL");
      } finally {
        try {
          fs.unlinkSync(outFile);
        } catch {}
      }
    });

    it("handles empty database export", async () => {
      const emptyDbPath = path.join(
        os.tmpdir(),
        `amem-cli-empty-export-${Date.now()}.db`,
      );
      const emptyDb = createDatabase(emptyDbPath);
      emptyDb.close();
      try {
        const { stdout, exitCode } = await runCli(["export"], emptyDbPath);
        expect(exitCode).toBe(0);
        expect(stdout).toContain("No memories to export");
      } finally {
        try {
          fs.unlinkSync(emptyDbPath);
        } catch {}
      }
    });
  });

  // ── recall ────────────────────────────────────────────────────
  describe("recall", () => {
    it("errors when no query is provided", async () => {
      const { stderr, exitCode } = await runCli(["recall"], dbPath);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("Usage");
    });

    it("searches and returns results or 'No memories found'", async () => {
      // Without embeddings, recall may return no results, but it should
      // not crash and should print the search line.
      const { stdout, exitCode } = await runCli(
        ["recall", "pnpm", "tooling"],
        dbPath,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Searching for: "pnpm tooling"');
    });
  });

  // ── unknown command ───────────────────────────────────────────
  describe("unknown command", () => {
    it("exits with an error and prints help", async () => {
      const { stderr, exitCode } = await runCli(
        ["foobar"],
        dbPath,
      );
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("Unknown command: foobar");
    });
  });

  // ── missing database ──────────────────────────────────────────
  describe("missing database", () => {
    it("errors when the database file does not exist", async () => {
      const fakePath = path.join(os.tmpdir(), "amem-nonexistent.db");
      const { stderr, exitCode } = await runCli(["stats"], fakePath);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("No memory database found");
    });
  });
});
