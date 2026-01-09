import type { RepoContext } from "../github/types";
import { SCHEMA_VERSION } from "../lib/schema/learning";
import { baseSystemPrompt, formatRepoContextForPrompt } from "./common";
import { chapterPlanArray } from "./jsonSchemas";

export const PLAN_PROMPT_VERSION = 1 as const;

export function buildPlanPrompt(params: { repoContext: RepoContext }): {
  system: string;
  prompt: string;
  responseMimeType: string;
  responseJsonSchema: unknown;
} {
  const system = baseSystemPrompt({ task: "Generate a learning plan (chapters) for a public GitHub repo.", promptVersion: PLAN_PROMPT_VERSION });

  const context = formatRepoContextForPrompt(params.repoContext);

  const prompt = [
    "Return a JSON array of ChapterPlan objects.",
    `Each ChapterPlan.schemaVersion MUST be ${SCHEMA_VERSION}.`,
    "The first chapter should focus on repo orientation + how to run it locally.",
    "Prefer official docs URLs when you include readingItems.url (only if you are confident).",
    "",
    context,
  ].join("\n");

  return { system, prompt, responseMimeType: "application/json", responseJsonSchema: chapterPlanArray };
}

