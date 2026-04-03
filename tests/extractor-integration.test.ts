import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, type AmemDatabase } from "../src/database.js";
import { extractMemories } from "../src/extractor.js";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

function makeTempDb(): { db: AmemDatabase; dbPath: string } {
  const dbPath = path.join(
    os.tmpdir(),
    `amem-extractor-int-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  return { db: createDatabase(dbPath), dbPath };
}

describe("Extractor Integration", () => {
  let db: AmemDatabase;
  let dbPath: string;
  beforeEach(() => { ({ db, dbPath } = makeTempDb()); });
  afterEach(() => { db.close(); try { fs.unlinkSync(dbPath); } catch {} });

  it("extracted memories can be stored and recalled", () => {
    const conversation = [
      { role: "user" as const, content: "Don't use console.log for debugging, use the logger module" },
      { role: "assistant" as const, content: "Understood, I'll use the logger module." },
      { role: "user" as const, content: "We decided to use Drizzle ORM instead of Prisma" },
    ];

    const extracted = extractMemories(conversation);
    expect(extracted.length).toBeGreaterThanOrEqual(2);

    for (const mem of extracted) {
      db.insertMemory({
        content: mem.content,
        type: mem.type,
        tags: mem.tags,
        confidence: mem.confidence,
        source: mem.source,
        embedding: null,
        scope: "test-project",
      });
    }

    const corrections = db.searchByType("correction");
    expect(corrections.length).toBeGreaterThanOrEqual(1);
    expect(corrections.some(m => m.content.includes("console.log"))).toBe(true);

    const decisions = db.searchByType("decision");
    expect(decisions.length).toBeGreaterThanOrEqual(1);
    expect(decisions.some(m => m.content.includes("Drizzle"))).toBe(true);
  });

  it("deduplicates against existing memories via content hash", () => {
    db.insertMemory({
      content: "Don't use console.log for debugging, use the logger module",
      type: "correction",
      tags: ["auto-extracted"],
      confidence: 0.95,
      source: "conversation-extractor",
      embedding: null,
      scope: "global",
    });

    const extracted = extractMemories([
      { role: "user", content: "Don't use console.log for debugging, use the logger module" },
    ]);

    const existing = db.findByContentHash(extracted[0].content);
    expect(existing).not.toBeNull();
  });
});
