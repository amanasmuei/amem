import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const execFileAsync = promisify(execFile);
const CLI_PATH = path.resolve("dist/cli.js");

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `amem-init-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function runCli(args: string[], env?: Record<string, string>) {
  try {
    const { stdout, stderr } = await execFileAsync("node", [CLI_PATH, ...args], {
      env: { ...process.env, ...env },
      timeout: 10000,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error: unknown) {
    const e = error as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout || "", stderr: e.stderr || "", exitCode: e.code || 1 };
  }
}

// ═══════════════════════════════════════════════════════════
// INIT COMMAND
// ═══════════════════════════════════════════════════════════

describe("amem init", () => {
  let tempHome: string;

  beforeEach(() => {
    tempHome = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it("reports 'not installed' when no AI tool dirs exist", async () => {
    const { stdout } = await runCli(["init"], { HOME: tempHome });
    expect(stdout).toContain("not installed");
  });

  it("configures Claude Code when .claude/ dir exists", async () => {
    const claudeDir = path.join(tempHome, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });

    const { stdout } = await runCli(["init"], { HOME: tempHome });
    expect(stdout).toContain("Claude Code");
    expect(stdout).toContain("configured");

    const configPath = path.join(claudeDir, "settings.json");
    expect(fs.existsSync(configPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(config.mcpServers.amem).toBeTruthy();
    expect(config.mcpServers.amem.command).toBe("npx");
    expect(config.mcpServers.amem.args).toContain("@aman_asmuei/amem");
  });

  it("preserves existing config when adding amem", async () => {
    const claudeDir = path.join(tempHome, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, "settings.json"),
      JSON.stringify({ mcpServers: { other: { command: "other-tool" } }, theme: "dark" }, null, 2),
    );

    await runCli(["init"], { HOME: tempHome });

    const config = JSON.parse(fs.readFileSync(path.join(claudeDir, "settings.json"), "utf-8"));
    expect(config.mcpServers.amem).toBeTruthy();
    expect(config.mcpServers.other.command).toBe("other-tool");
    expect(config.theme).toBe("dark");
  });

  it("skips if amem is already configured", async () => {
    const claudeDir = path.join(tempHome, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, "settings.json"),
      JSON.stringify({ mcpServers: { amem: { command: "npx", args: ["-y", "@aman_asmuei/amem"] } } }),
    );

    const { stdout } = await runCli(["init"], { HOME: tempHome });
    expect(stdout).toContain("already configured");
  });

  it("configures multiple tools at once", async () => {
    fs.mkdirSync(path.join(tempHome, ".claude"), { recursive: true });
    fs.mkdirSync(path.join(tempHome, ".cursor"), { recursive: true });

    const { stdout } = await runCli(["init"], { HOME: tempHome });
    expect(stdout).toContain("Claude Code");
    expect(stdout).toContain("Cursor");
    expect(stdout).toMatch(/Configured 2/);
  });

  it("filters by --tool flag", async () => {
    fs.mkdirSync(path.join(tempHome, ".claude"), { recursive: true });
    fs.mkdirSync(path.join(tempHome, ".cursor"), { recursive: true });

    const { stdout } = await runCli(["init", "--tool", "cursor"], { HOME: tempHome });
    expect(stdout).toContain("Cursor");
    expect(stdout).toContain("configured");
    expect(stdout).toMatch(/Configured 1/);

    // Claude Code should NOT have been configured
    expect(fs.existsSync(path.join(tempHome, ".claude", "settings.json"))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// RULES COMMAND
// ═══════════════════════════════════════════════════════════

describe("amem rules", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes rules to --path", async () => {
    const rulesPath = path.join(tempDir, "MY_RULES.md");
    const { stdout } = await runCli(["rules", "--path", rulesPath]);

    expect(stdout).toContain("Rules written to");
    expect(fs.existsSync(rulesPath)).toBe(true);

    const content = fs.readFileSync(rulesPath, "utf-8");
    expect(content).toContain("memory_inject");
    expect(content).toContain("memory_extract");
    expect(content).toContain("correction");
    expect(content).toContain("Session Start");
  });

  it("rules content has all required sections", async () => {
    const rulesPath = path.join(tempDir, "rules.md");
    await runCli(["rules", "--path", rulesPath]);

    const content = fs.readFileSync(rulesPath, "utf-8");
    expect(content).toContain("Session Start");
    expect(content).toContain("During Conversation");
    expect(content).toContain("Every ~10 Exchanges");
    expect(content).toContain("Before Ending");
    expect(content).toContain("Never store");
    expect(content).toContain("memory_relate");
    expect(content).toContain("reminder_check");
  });

  it("reports 'not installed' for missing tools", async () => {
    const { stdout } = await runCli(["rules"], { HOME: tempDir });
    expect(stdout).toContain("not installed");
  });

  it("generates rules for detected tool", async () => {
    const claudeDir = path.join(tempDir, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });

    const { stdout } = await runCli(["rules"], { HOME: tempDir });
    expect(stdout).toContain("Claude Code");

    expect(fs.existsSync(path.resolve("CLAUDE.md"))).toBe(true);
    // Clean up the generated file
    try { fs.unlinkSync(path.resolve("CLAUDE.md")); } catch {}
  });
});
