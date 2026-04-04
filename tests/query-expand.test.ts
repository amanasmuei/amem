import { describe, it, expect } from "vitest";
import { expandQuery } from "@aman_asmuei/amem-core";

describe("expandQuery", () => {
  it("expands 'auth' to include authentication and login", () => {
    const result = expandQuery("auth");
    expect(result).toContain("auth");
    expect(result).toContain("authentication");
    expect(result).toContain("login");
  });

  it("applies stemming (testing -> test)", () => {
    const result = expandQuery("testing");
    expect(result).toContain("testing");
    expect(result).toContain("test");
  });

  it("returns unknown terms as-is", () => {
    const result = expandQuery("foobar");
    expect(result).toEqual(["foobar"]);
  });

  it("expands all words in a multi-word query", () => {
    const result = expandQuery("auth config");
    expect(result).toContain("auth");
    expect(result).toContain("authentication");
    expect(result).toContain("login");
    expect(result).toContain("session");
    expect(result).toContain("config");
    expect(result).toContain("configuration");
    expect(result).toContain("settings");
  });

  it("deduplicates terms", () => {
    const result = expandQuery("test test");
    const unique = new Set(result);
    expect(result.length).toBe(unique.size);
  });

  it("expands db to include database and sql", () => {
    const result = expandQuery("db");
    expect(result).toContain("database");
    expect(result).toContain("sql");
  });

  it("stems suffix -tion (configuration -> configura)", () => {
    const result = expandQuery("configuration");
    expect(result).toContain("configuration");
    // -tion suffix stripped
    expect(result).toContain("configura");
  });

  it("stems suffix -ies to -y (queries -> query)", () => {
    const result = expandQuery("queries");
    expect(result).toContain("queries");
    expect(result).toContain("query");
  });

  it("handles empty input", () => {
    const result = expandQuery("");
    expect(result).toEqual([]);
  });
});
