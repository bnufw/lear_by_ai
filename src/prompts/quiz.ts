import type { Chapter } from "../domain/models";
import type { RepoContext } from "../github/types";
import { baseSystemPrompt, formatRepoContextForPrompt } from "./common";
import { quizQuestions } from "./jsonSchemas";

export const QUIZ_PROMPT_VERSION = 1 as const;

export function buildQuizPrompt(params: { repoContext: RepoContext; chapter: Chapter }): {
  system: string;
  prompt: string;
  responseMimeType: string;
  responseJsonSchema: unknown;
} {
  const system = baseSystemPrompt({ task: "Generate deep open-ended quiz questions for the chapter.", promptVersion: QUIZ_PROMPT_VERSION });
  const context = formatRepoContextForPrompt(params.repoContext, { maxTotalChars: 30_000 });

  const prompt = [
    "Create 3 to 5 deep open-ended questions.",
    "Each question should test understanding and ability to reason about this repo.",
    "Return JSON in the required schema.",
    "",
    "Chapter JSON:",
    JSON.stringify(params.chapter),
    "",
    context,
  ].join("\n");

  return { system, prompt, responseMimeType: "application/json", responseJsonSchema: quizQuestions };
}

