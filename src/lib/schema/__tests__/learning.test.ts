import { describe, expect, it } from "vitest";
import {
  ChapterPlanSchema,
  MessageSchema,
  RepoSourceSchema,
  SCHEMA_VERSION,
  safeParseSchema,
} from "../learning";

const validRepo = {
  schemaVersion: SCHEMA_VERSION,
  kind: "github",
  url: "https://github.com/vercel/next.js",
  owner: "vercel",
  repo: "next.js",
  fetchedAt: new Date().toISOString(),
};

const validPlan = {
  schemaVersion: SCHEMA_VERSION,
  id: "chapter-1",
  title: "Intro",
  summary: "Overview of the repository.",
  objectives: ["Learn the layout"],
  readingItems: [],
  tasks: [],
};

describe("RepoSourceSchema", () => {
  it("accepts a valid repo source", () => {
    expect(RepoSourceSchema.safeParse(validRepo).success).toBe(true);
  });
});

describe("MessageSchema", () => {
  it("rejects invalid roles", () => {
    const result = MessageSchema.safeParse({
      id: "msg-1",
      role: "bot",
      content: "hi",
      createdAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});

describe("safeParseSchema", () => {
  it("returns actionable errors", () => {
    const result = safeParseSchema(ChapterPlanSchema, {
      ...validPlan,
      id: "",
      objectives: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error).toContain("id");
      expect(result.error).toContain("objectives");
    }
  });
});

