import type { QuizAttempt, QuizQuestion, QuizResponse } from "../domain/models";
import { SCHEMA_VERSION } from "../lib/schema/learning";

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getLatestQuizAttempt(attempts: QuizAttempt[] | undefined, chapterId: string): QuizAttempt | null {
  const list = (attempts ?? []).filter((a) => a.chapterId === chapterId);
  if (!list.length) return null;
  return [...list].sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))[0] ?? null;
}

export function createQuizAttempt(params: { chapterId: string; questions: QuizQuestion[] }): QuizAttempt {
  const createdAt = nowIso();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: makeId("quiz"),
    chapterId: params.chapterId,
    status: "in_progress",
    questions: params.questions,
    responses: [],
    createdAt,
    updatedAt: createdAt,
  };
}

export function buildResponsesFromAnswers(params: {
  questions: QuizQuestion[];
  answersByQuestionId: Record<string, string>;
  existing?: QuizResponse[];
}): QuizResponse[] {
  const out: QuizResponse[] = [];
  const existing = new Map((params.existing ?? []).map((r) => [r.questionId, r]));

  for (const q of params.questions) {
    const raw = params.answersByQuestionId[q.id] ?? existing.get(q.id)?.answer ?? "";
    const answer = raw.trim();
    if (!answer) continue;
    out.push({ questionId: q.id, answer });
  }
  return out;
}

export function allQuestionsAnswered(questions: QuizQuestion[], answersByQuestionId: Record<string, string>): boolean {
  return questions.every((q) => Boolean((answersByQuestionId[q.id] ?? "").trim()));
}

