import { describe, expect, it } from "vitest";
import { createQuizAttempt, getLatestQuizAttempt } from "../attempts";
import { SCHEMA_VERSION } from "../../lib/schema/learning";

describe("quiz attempts", () => {
  it("creates an in-progress attempt", () => {
    const attempt = createQuizAttempt({
      chapterId: "chapter-1",
      questions: [{ id: "q1", prompt: "Q", rubric: "R" }],
    });
    expect(attempt.schemaVersion).toBe(SCHEMA_VERSION);
    expect(attempt.status).toBe("in_progress");
    expect(attempt.questions.length).toBe(1);
  });

  it("picks the latest attempt for a chapter", () => {
    const a1 = {
      schemaVersion: SCHEMA_VERSION,
      id: "a1",
      chapterId: "chapter-1",
      status: "completed" as const,
      questions: [{ id: "q1", prompt: "Q" }],
      responses: [{ questionId: "q1", answer: "A" }],
      score: 1,
      feedback: "ok",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    };
    const a2 = { ...a1, id: "a2", updatedAt: "2020-01-02T00:00:00.000Z" };
    const latest = getLatestQuizAttempt([a1, a2], "chapter-1");
    expect(latest?.id).toBe("a2");
  });
});

