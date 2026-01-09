import { describe, expect, it, vi } from "vitest";
import type { ChapterPlan } from "../../domain/models";
import type { RepoContext } from "../../github/types";
import { SCHEMA_VERSION } from "../../lib/schema/learning";
import type { LlmClient, LlmResponse } from "../types";
import { answerQuestion, generateChapter, generatePlan, generateQuizQuestions } from "../orchestrators";

function makeRepoContext(): RepoContext {
  return {
    repo: {
      owner: "vercel",
      repo: "next.js",
      url: "https://github.com/vercel/next.js",
      defaultBranch: "main",
      fetchedAt: new Date().toISOString(),
      description: "Test repo",
    },
    files: [
      {
        path: "README.md",
        size: 10,
        content: "Hello",
        sourceUrl: "https://example.com/readme",
        category: "readme",
      },
    ],
    selectedPaths: ["README.md"],
    stats: { totalTreeFiles: 1, selectedFiles: 1, totalBytes: 10, skippedFiles: 0 },
    warnings: [],
  };
}

function makeMockClient(responses: LlmResponse[]): LlmClient {
  return {
    generate: vi.fn(async () => {
      const next = responses.shift();
      if (!next) throw new Error("No more mock responses");
      return next;
    }),
  };
}

describe("llm orchestrators", () => {
  it("retries plan generation on invalid JSON then succeeds", async () => {
    const repo = makeRepoContext();
    const validPlan: ChapterPlan[] = [
      {
        schemaVersion: SCHEMA_VERSION,
        id: "chapter-1",
        title: "Intro",
        summary: "Summary",
        objectives: ["Obj"],
        readingItems: [],
        tasks: [],
      },
    ];

    const client = makeMockClient([
      { ok: true, requestId: "r1", model: "m", outputText: "not json" },
      { ok: true, requestId: "r2", model: "m", outputText: JSON.stringify(validPlan) },
    ]);

    const plan = await generatePlan(repo, { client, maxAttempts: 2 });
    expect(plan[0]?.id).toBe("chapter-1");
    expect((client.generate as any).mock.calls.length).toBe(2);
  });

  it("falls back for chapter generation after repeated failures", async () => {
    const repo = makeRepoContext();
    const plan: ChapterPlan = {
      schemaVersion: SCHEMA_VERSION,
      id: "chapter-1",
      title: "Intro",
      summary: "Summary",
      objectives: ["Obj"],
      readingItems: [],
      tasks: [],
    };

    const client = makeMockClient([
      { ok: true, requestId: "r1", model: "m", outputText: "```json\n{}\n```" },
      { ok: true, requestId: "r2", model: "m", outputText: "{}" },
    ]);

    const chapter = await generateChapter(repo, plan, { client, maxAttempts: 2 });
    expect(chapter.schemaVersion).toBe(SCHEMA_VERSION);
    expect(chapter.id).toBe("chapter-1");
    expect(chapter.content).toContain("降级");
  });

  it("returns a safe fallback answer for Q&A failures", async () => {
    const repo = makeRepoContext();
    const chapter = {
      schemaVersion: SCHEMA_VERSION,
      id: "chapter-1",
      title: "Intro",
      summary: "Summary",
      content: "Content",
      objectives: ["Obj"],
      readingItems: [],
      tasks: [],
    };

    const client = makeMockClient([{ ok: false, error: { code: "UPSTREAM_ERROR", message: "nope" } }]);
    const res = await answerQuestion({
      repoContext: repo,
      chapter,
      history: [],
      question: "What is this?",
      options: { client, maxAttempts: 1 },
    });
    expect(res.answer.length).toBeGreaterThan(0);
  });

  it("falls back quiz questions on schema failures", async () => {
    const repo = makeRepoContext();
    const chapter = {
      schemaVersion: SCHEMA_VERSION,
      id: "chapter-1",
      title: "Intro",
      summary: "Summary",
      content: "Content",
      objectives: ["Obj"],
      readingItems: [],
      tasks: [],
    };

    const client = makeMockClient([{ ok: true, requestId: "r1", model: "m", outputText: "{}" }]);
    const questions = await generateQuizQuestions(repo, chapter, { client, maxAttempts: 1 });
    expect(questions.length).toBe(3);
  });
});

