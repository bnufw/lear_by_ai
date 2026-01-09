import type { ChapterPlan } from "../domain/models";
import type { RepoContext } from "../github/types";
import { SCHEMA_VERSION } from "../lib/schema/learning";
import { baseSystemPrompt, formatRepoContextForPrompt } from "./common";
import { chapter } from "./jsonSchemas";

export const CHAPTER_PROMPT_VERSION = 1 as const;

export function buildChapterPrompt(params: { repoContext: RepoContext; chapterPlan: ChapterPlan }): {
  system: string;
  prompt: string;
  responseMimeType: string;
  responseJsonSchema: unknown;
} {
  const system = baseSystemPrompt({ task: "Generate a single chapter content from a ChapterPlan.", promptVersion: CHAPTER_PROMPT_VERSION });
  const context = formatRepoContextForPrompt(params.repoContext);

  const prompt = [
    "Return a single Chapter JSON object that matches the schema.",
    `Chapter.schemaVersion MUST be ${SCHEMA_VERSION}.`,
    "The chapter should be practical and specific to the repo.",
    "content should be a well-structured plain text (no markdown fences).",
    "",
    "ChapterPlan JSON:",
    JSON.stringify(params.chapterPlan),
    "",
    context,
  ].join("\n");

  return { system, prompt, responseMimeType: "application/json", responseJsonSchema: chapter };
}

