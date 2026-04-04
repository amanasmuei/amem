import { describe, it, expect } from "vitest";
import {
  StoreResultSchema,
  RecallResultSchema,
  ContextResultSchema,
  ForgetResultSchema,
  ExtractResultSchema,
  StatsResultSchema,
  ExportResultSchema,
  InjectResultSchema,
} from "@aman_asmuei/amem-core";

describe("Output Schemas", () => {
  it("StoreResultSchema validates a stored result", () => {
    const result = StoreResultSchema.parse({
      action: "stored",
      id: "abc-123",
      type: "correction",
      confidence: 1.0,
      tags: ["typescript"],
      total: 5,
      reinforced: 0,
    });
    expect(result.action).toBe("stored");
    expect(result.id).toBe("abc-123");
  });

  it("StoreResultSchema validates a conflict result", () => {
    const result = StoreResultSchema.parse({
      action: "conflict_resolved",
      existingId: "def-456",
      similarity: 92,
      existingContent: "some memory",
    });
    expect(result.action).toBe("conflict_resolved");
  });

  it("RecallResultSchema validates recall results", () => {
    const result = RecallResultSchema.parse({
      query: "typescript",
      total: 1,
      memories: [{
        id: "abc-123",
        content: "use strict types",
        type: "correction",
        score: 0.892,
        confidence: 1.0,
        tags: ["typescript"],
        age: "2d ago",
      }],
    });
    expect(result.memories).toHaveLength(1);
  });

  it("ContextResultSchema validates context results", () => {
    const result = ContextResultSchema.parse({
      topic: "auth",
      groups: [{
        type: "correction",
        memories: [{ content: "Don't store JWT in env vars", confidence: 1.0 }],
      }],
      memoriesUsed: 1,
    });
    expect(result.groups).toHaveLength(1);
  });

  it("ForgetResultSchema validates delete result", () => {
    const result = ForgetResultSchema.parse({
      action: "deleted",
      id: "abc-123",
      content: "some memory",
      type: "correction",
    });
    expect(result.action).toBe("deleted");
  });

  it("ForgetResultSchema validates preview result", () => {
    const result = ForgetResultSchema.parse({
      action: "preview",
      query: "old stuff",
      total: 2,
      previewed: [{ id: "abc", content: "mem1" }, { id: "def", content: "mem2" }],
    });
    expect(result.action).toBe("preview");
  });

  it("ForgetResultSchema validates bulk_deleted result", () => {
    const result = ForgetResultSchema.parse({
      action: "bulk_deleted",
      query: "old stuff",
      deleted: 3,
    });
    expect(result.action).toBe("bulk_deleted");
  });

  it("ExtractResultSchema validates extract results", () => {
    const result = ExtractResultSchema.parse({
      stored: 2,
      reinforced: 1,
      total: 10,
      details: [
        { action: "stored", content: "use TS", type: "preference", id: "abc" },
        { action: "reinforced", content: "use TS", matchedContent: "prefer TS", similarity: 90 },
      ],
    });
    expect(result.stored).toBe(2);
    expect(result.details).toHaveLength(2);
  });

  it("StatsResultSchema validates stats", () => {
    const result = StatsResultSchema.parse({
      total: 10,
      byType: { correction: 3, decision: 2 },
      confidence: { high: 5, medium: 3, low: 2 },
      embeddingCoverage: { withEmbeddings: 8, total: 10 },
    });
    expect(result.total).toBe(10);
  });

  it("ExportResultSchema validates export results", () => {
    const result = ExportResultSchema.parse({
      exportedAt: "2026-03-20T00:00:00.000Z",
      total: 5,
      markdown: "# Export\n\n- memory 1",
      truncated: false,
    });
    expect(result.truncated).toBe(false);
  });

  it("InjectResultSchema validates inject results", () => {
    const result = InjectResultSchema.parse({
      topic: "auth",
      corrections: ["Don't store JWT in env vars"],
      decisions: ["Use OAuth2 + PKCE"],
      context: "## Corrections\n- Don't store JWT in env vars",
      memoriesUsed: 2,
    });
    expect(result.memoriesUsed).toBe(2);
  });
});
