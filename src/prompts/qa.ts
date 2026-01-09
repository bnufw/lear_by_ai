import type { Chapter, Message } from "../domain/models";
import type { RepoContext } from "../github/types";
import { baseSystemPrompt, formatRepoContextForPrompt } from "./common";
import { qaAnswer } from "./jsonSchemas";

export const QA_PROMPT_VERSION = 1 as const;

export function buildQaPrompt(params: {
  repoContext: RepoContext;
  chapter: Chapter;
  history: Message[];
  question: string;
}): { system: string; prompt: string; responseMimeType: string; responseJsonSchema: unknown } {
  const system = baseSystemPrompt({ task: "Answer a user question grounded in the provided repo context.", promptVersion: QA_PROMPT_VERSION });
  const context = formatRepoContextForPrompt(params.repoContext, { maxTotalChars: 25_000 });

  const prompt = [
    "Answer the user's question using ONLY the repo context + chapter content below.",
    "If the answer is not present, say what is missing and suggest how to find it in the repo.",
    "Return JSON with fields: answer (string), citations (array of file paths you used, optional).",
    "",
    "Chapter JSON:",
    JSON.stringify(params.chapter),
    "",
    "Conversation history (most recent last):",
    JSON.stringify(params.history.slice(-8)),
    "",
    "User question:",
    params.question,
    "",
    context,
  ].join("\n");

  return { system, prompt, responseMimeType: "application/json", responseJsonSchema: qaAnswer };
}

