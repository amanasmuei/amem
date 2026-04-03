import { describe, it, expect } from "vitest";
import { extractMemories } from "../src/extractor.js";

describe("Conversation Extractor", () => {
  it("detects corrections from user messages", () => {
    const results = extractMemories([
      { role: "user", content: "No, don't use var, always use const or let in this project" },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("correction");
    expect(results[0].confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("detects decisions from architectural discussions", () => {
    const results = extractMemories([
      { role: "user", content: "We decided to use PostgreSQL instead of MongoDB for the user service" },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("decision");
  });

  it("detects preferences from user statements", () => {
    const results = extractMemories([
      { role: "user", content: "I prefer using TypeScript over JavaScript for all new files" },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("preference");
  });

  it("ignores generic conversation that has no extractable content", () => {
    const results = extractMemories([
      { role: "user", content: "Hello, how are you?" },
      { role: "assistant", content: "I'm doing well! How can I help?" },
    ]);
    expect(results).toHaveLength(0);
  });

  it("extracts multiple memories from a longer conversation", () => {
    const results = extractMemories([
      { role: "user", content: "Don't mock the database in tests, use real SQLite" },
      { role: "assistant", content: "Got it, I'll use real SQLite for testing." },
      { role: "user", content: "Also, we decided to keep all API routes in src/routes/" },
    ]);
    expect(results.length).toBeGreaterThanOrEqual(2);
    const types = results.map(r => r.type);
    expect(types).toContain("correction");
    expect(types).toContain("decision");
  });

  it("handles empty conversation", () => {
    const results = extractMemories([]);
    expect(results).toHaveLength(0);
  });

  it("only processes user messages, ignores assistant", () => {
    const results = extractMemories([
      { role: "assistant", content: "I always use const instead of var" },
    ]);
    expect(results).toHaveLength(0);
  });

  it("tags extracted memories correctly", () => {
    const results = extractMemories([
      { role: "user", content: "We decided to use Drizzle ORM" },
    ]);
    expect(results[0].tags).toEqual(["auto-extracted"]);
    expect(results[0].source).toBe("conversation-extractor");
  });
});
