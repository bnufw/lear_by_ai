import type { Chapter, QuizAttempt } from "../domain/models";
import type { RepoContext } from "../github/types";
import { SCHEMA_VERSION } from "../lib/schema/learning";
import { baseSystemPrompt, formatRepoContextForPrompt } from "./common";
import { quizGrading } from "./jsonSchemas";

export const QUIZ_GRADING_PROMPT_VERSION = 1 as const;

export function buildQuizGradingPrompt(params: { repoContext: RepoContext; chapter: Chapter; attempt: QuizAttempt }): {
  system: string;
  prompt: string;
  responseMimeType: string;
  responseJsonSchema: unknown;
} {
  const system = baseSystemPrompt({ task: "Grade a user's quiz answers with a rubric and provide feedback.", promptVersion: QUIZ_GRADING_PROMPT_VERSION });
  const context = formatRepoContextForPrompt(params.repoContext, { maxTotalChars: 25_000 });

  const prompt = [
    "You are grading a deep open-ended quiz attempt.",
    "Requirements:",
    "- Use the question.rubric if present; otherwise infer an appropriate rubric from the prompt.",
    "- Score each answer in [0, 1] and provide specific feedback.",
    "- Compute overall score as the average of per-question scores.",
    "- Provide overall feedback that highlights strengths and next improvements.",
    "",
    "Output JSON ONLY in the required schema.",
    `schemaVersion MUST be ${SCHEMA_VERSION}.`,
    "",
    "Chapter JSON:",
    JSON.stringify(params.chapter),
    "",
    "QuizAttempt JSON (questions + user's answers in responses):",
    JSON.stringify(params.attempt),
    "",
    context,
  ].join("\n");

  return { system, prompt, responseMimeType: "application/json", responseJsonSchema: quizGrading };
}

