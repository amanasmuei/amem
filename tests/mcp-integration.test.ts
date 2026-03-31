import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const SERVER_PATH = path.resolve("dist/index.js");

function getText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text: string }>;
  return content?.[0]?.text ?? "";
}

describe("MCP Integration", () => {
  let client: Client;
  let transport: StdioClientTransport;
  let dbPath: string;

  beforeAll(async () => {
    dbPath = path.join(os.tmpdir(), `amem-mcp-int-${Date.now()}.db`);

    transport = new StdioClientTransport({
      command: "node",
      args: [SERVER_PATH],
      env: { ...process.env, AMEM_DB: dbPath },
    });

    client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(transport);
  }, 30_000);

  afterAll(async () => {
    try { await client.close(); } catch {}
    try { fs.unlinkSync(dbPath); } catch {}
    try { fs.unlinkSync(dbPath + "-wal"); } catch {}
    try { fs.unlinkSync(dbPath + "-shm"); } catch {}
  });

  it("connects and lists tools", async () => {
    const { tools } = await client.listTools();
    expect(tools).toBeInstanceOf(Array);
    expect(tools.length).toBeGreaterThanOrEqual(23);

    const names = tools.map((t) => t.name);
    expect(names).toContain("memory_store");
    expect(names).toContain("memory_recall");
    expect(names).toContain("memory_forget");
    expect(names).toContain("memory_stats");
    expect(names).toContain("memory_log_cleanup");
    expect(names).toContain("memory_import");
    expect(names).toContain("reminder_set");
  });

  it("memory_store + memory_recall + memory_forget round-trip", async () => {
    // Store
    const storeResult = await client.callTool({
      name: "memory_store",
      arguments: {
        content: "Always use strict TypeScript — no any types",
        type: "correction",
        tags: ["typescript"],
        confidence: 1.0,
        source: "test",
      },
    });
    const storeText = getText(storeResult);
    expect(storeText).toContain("Stored");
    expect(storeText).toContain("correction");

    // Extract the short ID from the store response text
    const idMatch = storeText.match(/\(([a-f0-9]{8})\)/);
    expect(idMatch).toBeTruthy();
    const shortId = idMatch![1];

    // Recall
    const recallResult = await client.callTool({
      name: "memory_recall",
      arguments: { query: "TypeScript strict", limit: 5 },
    });
    const recallText = getText(recallResult);
    expect(recallText).toContain("strict TypeScript");

    // Forget by short ID
    const forgetResult = await client.callTool({
      name: "memory_forget",
      arguments: { id: shortId },
    });
    const forgetText = getText(forgetResult);
    expect(forgetText).toContain("Deleted");
  });

  it("memory_stats returns correct counts", async () => {
    // Store two memories
    await client.callTool({
      name: "memory_store",
      arguments: { content: "Stats test fact A", type: "fact", tags: [], confidence: 0.8, source: "test" },
    });
    await client.callTool({
      name: "memory_store",
      arguments: { content: "Stats test decision B", type: "decision", tags: [], confidence: 0.9, source: "test" },
    });

    const result = await client.callTool({ name: "memory_stats", arguments: {} });
    const text = getText(result);
    expect(text).toContain("Total memories:");
    expect(text).toMatch(/fact:\s*\d+/);
  });

  it("reminder_set and reminder_list round-trip", async () => {
    const setResult = await client.callTool({
      name: "reminder_set",
      arguments: { content: "Review PR #42", scope: "global" },
    });
    expect(getText(setResult)).toContain("Review PR #42");

    const listResult = await client.callTool({
      name: "reminder_list",
      arguments: { include_completed: false },
    });
    expect(getText(listResult)).toContain("Review PR #42");
  });

  it("memory_search finds by exact text", async () => {
    await client.callTool({
      name: "memory_store",
      arguments: { content: "The auth module lives in src/auth/ directory", type: "topology", tags: ["auth"], confidence: 0.7, source: "test" },
    });

    const result = await client.callTool({
      name: "memory_search",
      arguments: { query: "auth module" },
    });
    expect(getText(result)).toContain("auth");
  });

  it("memory_log + memory_log_recall round-trip", async () => {
    await client.callTool({
      name: "memory_log",
      arguments: { session_id: "test-session-1", role: "user", content: "How do I set up auth?" },
    });

    const result = await client.callTool({
      name: "memory_log_recall",
      arguments: { session_id: "test-session-1" },
    });
    expect(getText(result)).toContain("How do I set up auth?");
  });

  it("memory_context returns grouped context", async () => {
    const result = await client.callTool({
      name: "memory_context",
      arguments: { topic: "authentication", max_tokens: 2000 },
    });
    expect(getText(result).length).toBeGreaterThan(0);
  });
}, 30_000);
