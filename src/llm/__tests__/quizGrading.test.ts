import { describe, expect, it, vi } from "vitest";
import type { Chapter, QuizAttempt } from "../../domain/models";
import type { RepoContext } from "../../github/types";
import { SCHEMA_VERSION } from "../../lib/schema/learning";
import type { LlmClient, LlmResponse } from "../types";
import { gradeQuizAttempt } from "../orchestrators";

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

describe("gradeQuizAttempt", () => {
  it("returns graded responses and overall score", async () => {
    const repo = makeRepoContext();
    const chapter: Chapter = {
      schemaVersion: SCHEMA_VERSION,
      id: "chapter-1",
      title: "Intro",
      summary: "Summary",
      content: "Content",
      objectives: ["Obj"],
      readingItems: [],
      tasks: [],
    };
    const attempt: QuizAttempt = {
      schemaVersion: SCHEMA_VERSION,
      id: "quiz-1",
      chapterId: "chapter-1",
      status: "in_progress",
      questions: [{ id: "q1", prompt: "What?", rubric: "Rubric" }],
      responses: [{ questionId: "q1", answer: "Answer" }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const client = makeMockClient([
      {
        ok: true,
        requestId: "r1",
        model: "m",
        outputText: JSON.stringify({
          schemaVersion: SCHEMA_VERSION,
          responses: [{ questionId: "q1", answer: "Answer", score: 0.8, feedback: "Good" }],
          score: 0.8,
          feedback: "Overall",
        }),
      },
    ]);

    const result = await gradeQuizAttempt({ repoContext: repo, chapter, attempt, options: { client, maxAttempts: 1 } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.responses[0]?.score).toBe(0.8);
      expect(result.data.score).toBe(0.8);
    }
  });

  it("falls back when graded responses are missing", async () => {
    const repo = makeRepoContext();
    const chapter: Chapter = {
      schemaVersion: SCHEMA_VERSION,
      id: "chapter-1",
      title: "Intro",
      summary: "Summary",
      content: "Content",
      objectives: ["Obj"],
      readingItems: [],
      tasks: [],
    };
    const attempt: QuizAttempt = {
      schemaVersion: SCHEMA_VERSION,
      id: "quiz-1",
      chapterId: "chapter-1",
      status: "in_progress",
      questions: [{ id: "q1", prompt: "What?" }],
      responses: [{ questionId: "q1", answer: "Answer" }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const client = makeMockClient([
      {
        ok: true,
        requestId: "r1",
        model: "m",
        outputText: JSON.stringify({
          schemaVersion: SCHEMA_VERSION,
          responses: [],
          score: 0.5,
          feedback: "Overall",
        }),
      },
    ]);

    const result = await gradeQuizAttempt({ repoContext: repo, chapter, attempt, options: { client, maxAttempts: 1 } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fallback.responses.length).toBe(1);
    }
  });
});

