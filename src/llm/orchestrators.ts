import { z } from "zod";
import type { Chapter, ChapterPlan, Message, QuizAttempt, QuizQuestion, QuizResponse } from "../domain/models";
import type { RepoContext } from "../github/types";
import { formatLlmError } from "../lib/errors";
import {
  ChapterPlanSchema,
  ChapterSchema,
  QuizQuestionSchema,
  SCHEMA_VERSION,
  safeParseSchema,
} from "../lib/schema/learning";
import { buildChapterPrompt, buildPlanPrompt, buildQaPrompt, buildQuizGradingPrompt, buildQuizPrompt } from "../prompts";
import { parseJsonLoosely } from "./json";
import { createFetchLlmClient } from "./client";
import type { LlmClient, LlmMessage, LlmRequest, LlmResponse } from "./types";

const DEFAULT_MAX_ATTEMPTS = 3;

type OrchestratorOptions = {
  maxAttempts?: number;
  client?: LlmClient;
  signal?: AbortSignal;
};

function isRetriableError(response: LlmResponse): boolean {
  if (response.ok) return false;
  return (
    response.error.code === "TIMEOUT" ||
    response.error.code === "UPSTREAM_RATE_LIMIT" ||
    response.error.code === "UPSTREAM_ERROR" ||
    response.error.code === "INTERNAL_ERROR" ||
    response.error.code === "NETWORK_ERROR" ||
    response.error.code === "INVALID_RESPONSE"
  );
}

function buildRetryMessages(base: { system: string; prompt: string }, history: LlmMessage[], lastOutput: string, error: string): LlmMessage[] {
  if (!history.length) {
    return [
      { role: "system", content: base.system },
      { role: "user", content: base.prompt },
      { role: "assistant", content: lastOutput },
      {
        role: "user",
        content: `Your previous output was invalid. Fix it and output JSON only. Error: ${error}`,
      },
    ];
  }
  return [
    ...history,
    { role: "assistant", content: lastOutput },
    { role: "user", content: `Fix the JSON only. Error: ${error}` },
  ];
}

async function runStructured<TOutput>(params: {
  base: { system: string; prompt: string; responseMimeType: string; responseJsonSchema: unknown };
  schema: z.ZodType<TOutput, any, any>;
  options: OrchestratorOptions;
}): Promise<{ ok: true; data: TOutput } | { ok: false; error: string; lastOutput?: string }> {
  const maxAttempts = params.options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const client = params.options.client ?? createFetchLlmClient();

  let messages: LlmMessage[] = [];
  let lastOutput: string | undefined;
  let lastError = "Unknown error";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const request: LlmRequest =
      messages.length > 0
        ? { messages, responseMimeType: params.base.responseMimeType, responseJsonSchema: params.base.responseJsonSchema }
        : {
            system: params.base.system,
            prompt: params.base.prompt,
            responseMimeType: params.base.responseMimeType,
            responseJsonSchema: params.base.responseJsonSchema,
          };

    const response = await client.generate(request, { signal: params.options.signal });
    if (!response.ok) {
      lastError = formatLlmError(response.error);
      if (response.error.code === "CANCELLED") {
        return { ok: false, error: "CANCELLED" };
      }
      if (attempt < maxAttempts && isRetriableError(response)) continue;
      return { ok: false, error: lastError };
    }

    lastOutput = response.outputText ?? "";
    const parsedJson = parseJsonLoosely(lastOutput);
    if (!parsedJson.ok) {
      lastError = parsedJson.error;
      if (attempt < maxAttempts) {
        messages = buildRetryMessages(params.base, messages, lastOutput, lastError);
        continue;
      }
      return { ok: false, error: lastError, lastOutput };
    }

    const validated = safeParseSchema(params.schema, parsedJson.value);
    if (!validated.ok) {
      lastError = validated.error;
      if (attempt < maxAttempts) {
        messages = buildRetryMessages(params.base, messages, JSON.stringify(parsedJson.value), lastError);
        continue;
      }
      return { ok: false, error: lastError, lastOutput: JSON.stringify(parsedJson.value) };
    }

    return { ok: true, data: validated.data };
  }

  return { ok: false, error: lastError, lastOutput };
}

function fallbackPlan(repo: RepoContext): ChapterPlan[] {
  const baseId = repo.repo.repo.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "repo";
  return [
    {
      schemaVersion: SCHEMA_VERSION,
      id: "chapter-1",
      title: `Getting started with ${repo.repo.repo}`,
      summary: "Understand the repository structure and run it locally.",
      objectives: ["Identify entry points", "Run the project", "Map key directories"],
      readingItems: [],
      tasks: [
        { id: `${baseId}-run`, title: "Run the project locally", status: "todo" },
        { id: `${baseId}-map`, title: "Sketch the folder structure and main entry points", status: "todo" },
      ],
    },
    {
      schemaVersion: SCHEMA_VERSION,
      id: "chapter-2",
      title: "Core architecture",
      summary: "Trace the main request/data flow and key modules.",
      objectives: ["Understand core modules", "Follow one end-to-end flow"],
      readingItems: [],
      tasks: [{ id: `${baseId}-flow`, title: "Trace one end-to-end flow in code", status: "todo" }],
    },
    {
      schemaVersion: SCHEMA_VERSION,
      id: "chapter-3",
      title: "Build something small",
      summary: "Make a small change and validate with tests or manual run.",
      objectives: ["Make a safe edit", "Verify behavior", "Learn debugging workflow"],
      readingItems: [],
      tasks: [{ id: `${baseId}-change`, title: "Implement a tiny feature or fix a bug", status: "todo" }],
    },
  ];
}

function fallbackChapter(plan: ChapterPlan): Chapter {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: plan.id,
    title: plan.title,
    summary: plan.summary,
    content:
      "生成章节失败，已降级为占位内容。\n\n建议：\n1) 先阅读 README 和 docs。\n2) 找到入口文件（main/index）。\n3) 运行项目并记录关键命令与输出。\n",
    objectives: plan.objectives.length ? plan.objectives : ["Complete the chapter tasks"],
    readingItems: plan.readingItems,
    tasks: plan.tasks,
  };
}

function fallbackQuiz(): QuizQuestion[] {
  return [
    { id: "q1", prompt: "Explain the main entry point(s) and how execution flows from there.", rubric: "Mention files/modules and the sequence of calls." },
    { id: "q2", prompt: "Pick one key module and describe its responsibilities and boundaries.", rubric: "Include inputs/outputs and why it exists." },
    { id: "q3", prompt: "Describe how you would debug a failing behavior in this repo step-by-step.", rubric: "Include reproduction, logging, and isolation strategy." },
  ];
}

export async function generatePlan(repoContext: RepoContext, options: OrchestratorOptions = {}): Promise<ChapterPlan[]> {
  const base = buildPlanPrompt({ repoContext });
  const schema = z.array(ChapterPlanSchema).min(1);

  const result = await runStructured({ base, schema, options });
  if (result.ok) return result.data;
  if (result.error === "CANCELLED") throw new Error("CANCELLED");
  return fallbackPlan(repoContext);
}

export async function generateChapter(
  repoContext: RepoContext,
  chapterPlan: ChapterPlan,
  options: OrchestratorOptions = {},
): Promise<Chapter> {
  const base = buildChapterPrompt({ repoContext, chapterPlan });
  const result = await runStructured({ base, schema: ChapterSchema, options });
  if (result.ok) return result.data;
  if (result.error === "CANCELLED") throw new Error("CANCELLED");
  return fallbackChapter(chapterPlan);
}

const QaAnswerSchema = z
  .object({
    answer: z.string().min(1),
    citations: z.array(z.string().min(1)).optional(),
  })
  .strict();

export async function answerQuestion(params: {
  repoContext: RepoContext;
  chapter: Chapter;
  history: Message[];
  question: string;
  options?: OrchestratorOptions;
}): Promise<{ answer: string; citations?: string[] }> {
  const base = buildQaPrompt({
    repoContext: params.repoContext,
    chapter: params.chapter,
    history: params.history,
    question: params.question,
  });

  const result = await runStructured({ base, schema: QaAnswerSchema, options: params.options ?? {} });
  if (result.ok) return result.data;
  if (result.error === "CANCELLED") throw new Error("CANCELLED");
  return { answer: "暂时无法从当前上下文中可靠回答这个问题。建议在仓库中搜索相关符号/文件后再问我。", citations: [] };
}

const QuizQuestionsSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    questions: z.array(QuizQuestionSchema).min(3).max(5),
  })
  .strict();

export async function generateQuizQuestions(
  repoContext: RepoContext,
  chapter: Chapter,
  options: OrchestratorOptions = {},
): Promise<QuizQuestion[]> {
  const base = buildQuizPrompt({ repoContext, chapter });
  const result = await runStructured({ base, schema: QuizQuestionsSchema, options });
  if (result.ok) return result.data.questions;
  if (result.error === "CANCELLED") throw new Error("CANCELLED");
  return fallbackQuiz();
}

const GradedQuizResponseSchema = z
  .object({
    questionId: z.string().min(1),
    answer: z.string().min(1),
    score: z.number().min(0).max(1),
    feedback: z.string().min(1),
  })
  .strict();

const QuizGradingSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    responses: z.array(GradedQuizResponseSchema).min(1),
    score: z.number().min(0).max(1),
    feedback: z.string().min(1),
  })
  .strict();

function fallbackGrade(attempt: QuizAttempt): { responses: Array<QuizResponse & { score: number; feedback: string }>; score: number; feedback: string } {
  const answers = new Map(attempt.responses.map((r) => [r.questionId, r.answer]));
  const responses = attempt.questions.map((q) => {
    const answer = (answers.get(q.id) ?? "").trim();
    const score = answer.length >= 200 ? 0.7 : answer.length >= 80 ? 0.5 : 0.3;
    const feedback =
      answer.length >= 200
        ? "回答较完整。建议补充具体文件/函数名与关键流程细节。"
        : answer.length >= 80
          ? "回答有一定信息量。建议补充关键证据（路径/模块）与推理链。"
          : "回答偏短。建议按“结论→证据（文件/模块）→步骤/示例”的结构展开。";
    return { questionId: q.id, answer: answer || "(empty)", score, feedback };
  });
  const avg = responses.reduce((sum, r) => sum + r.score, 0) / Math.max(1, responses.length);
  return {
    responses,
    score: Math.max(0, Math.min(1, avg)),
    feedback: "评分服务暂不可用，已降级为基于回答长度的粗略评分（不代表真实能力）。可稍后重试评分。",
  };
}

export async function gradeQuizAttempt(params: {
  repoContext: RepoContext;
  chapter: Chapter;
  attempt: QuizAttempt;
  options?: OrchestratorOptions;
}): Promise<{ ok: true; data: z.infer<typeof QuizGradingSchema> } | { ok: false; error: string; fallback: ReturnType<typeof fallbackGrade> }> {
  const base = buildQuizGradingPrompt({ repoContext: params.repoContext, chapter: params.chapter, attempt: params.attempt });
  const result = await runStructured({ base, schema: QuizGradingSchema, options: params.options ?? {} });
  if (result.ok) {
    const expected = new Set(params.attempt.questions.map((q) => q.id));
    const got = new Set(result.data.responses.map((r) => r.questionId));
    const missing = [...expected].filter((id) => !got.has(id));
    if (missing.length) {
      return { ok: false, error: `Missing graded responses for: ${missing.join(", ")}`, fallback: fallbackGrade(params.attempt) };
    }
    return { ok: true, data: result.data };
  }
  if (result.error === "CANCELLED") {
    return { ok: false, error: "CANCELLED", fallback: fallbackGrade(params.attempt) };
  }
  return { ok: false, error: result.error, fallback: fallbackGrade(params.attempt) };
}
