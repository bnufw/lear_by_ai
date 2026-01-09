import { z, type ZodError, type ZodIssue } from "zod";

export const SCHEMA_VERSION = 1 as const;
export const SchemaVersionSchema = z.literal(SCHEMA_VERSION);

const NonEmptyString = z.string().min(1);

export const IsoDateTimeSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "Invalid datetime",
});

export const RepoSourceSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    kind: z.literal("github"),
    url: z.string().url(),
    owner: NonEmptyString,
    repo: NonEmptyString,
    defaultBranch: NonEmptyString.optional(),
    commitSha: NonEmptyString.optional(),
    description: NonEmptyString.optional(),
    selectedPaths: z.array(NonEmptyString).optional(),
    docsUrls: z.array(z.string().url()).optional(),
    fetchedAt: IsoDateTimeSchema,
  })
  .strict();

export const TaskStatusSchema = z.enum(["todo", "in_progress", "done"]);

export const TaskSchema = z
  .object({
    id: NonEmptyString,
    title: NonEmptyString,
    description: NonEmptyString.optional(),
    status: TaskStatusSchema.default("todo"),
  })
  .strict();

export const ReadingItemSchema = z
  .object({
    id: NonEmptyString,
    title: NonEmptyString,
    url: z.string().url().optional(),
    path: NonEmptyString.optional(),
    description: NonEmptyString.optional(),
  })
  .strict()
  .refine((item) => Boolean(item.url || item.path), {
    message: "Reading item requires url or path",
  });

export const ChapterPlanSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    id: NonEmptyString,
    title: NonEmptyString,
    summary: NonEmptyString,
    objectives: z.array(NonEmptyString).min(1),
    estimatedMinutes: z.number().int().positive().optional(),
    readingItems: z.array(ReadingItemSchema),
    tasks: z.array(TaskSchema),
  })
  .strict();

export const ChapterSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    id: NonEmptyString,
    title: NonEmptyString,
    summary: NonEmptyString,
    content: NonEmptyString,
    objectives: z.array(NonEmptyString).min(1),
    readingItems: z.array(ReadingItemSchema),
    tasks: z.array(TaskSchema),
  })
  .strict();

export const MessageRoleSchema = z.enum(["system", "user", "assistant"]);

export const MessageSchema = z
  .object({
    id: NonEmptyString,
    role: MessageRoleSchema,
    content: NonEmptyString,
    createdAt: IsoDateTimeSchema,
  })
  .strict();

export const QuizQuestionSchema = z
  .object({
    id: NonEmptyString,
    prompt: NonEmptyString,
    rubric: NonEmptyString.optional(),
  })
  .strict();

export const QuizResponseSchema = z
  .object({
    questionId: NonEmptyString,
    answer: NonEmptyString,
    score: z.number().min(0).max(1).optional(),
    feedback: NonEmptyString.optional(),
  })
  .strict();

export const QuizAttemptSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    id: NonEmptyString,
    chapterId: NonEmptyString,
    status: z.enum(["in_progress", "completed"]),
    questions: z.array(QuizQuestionSchema).min(1),
    responses: z.array(QuizResponseSchema),
    score: z.number().min(0).max(1).optional(),
    feedback: NonEmptyString.optional(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema.optional(),
  })
  .strict();

export const SessionSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    id: NonEmptyString,
    repo: RepoSourceSchema,
    plan: z.array(ChapterPlanSchema).optional(),
    chapters: z.array(ChapterSchema).optional(),
    currentChapterId: NonEmptyString.optional(),
    completedChapterIds: z.array(NonEmptyString).optional(),
    messages: z.array(MessageSchema).optional(),
    quizAttempts: z.array(QuizAttemptSchema).optional(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

export type SchemaParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; issues: ZodIssue[] };

export function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export function safeParseSchema<T>(schema: z.ZodType<T>, input: unknown): SchemaParseResult<T> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return { ok: false, error: formatZodError(result.error), issues: result.error.issues };
}

