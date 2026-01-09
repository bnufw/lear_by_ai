export const schemaVersion = { type: "integer", enum: [1] } as const;

export const nonEmptyString = { type: "string", minLength: 1 } as const;

export const readingItem = {
  type: "object",
  additionalProperties: false,
  required: ["id", "title"],
  properties: {
    id: nonEmptyString,
    title: nonEmptyString,
    url: { type: "string" },
    path: nonEmptyString,
    description: nonEmptyString,
  },
} as const;

export const task = {
  type: "object",
  additionalProperties: false,
  required: ["id", "title"],
  properties: {
    id: nonEmptyString,
    title: nonEmptyString,
    description: nonEmptyString,
    status: { type: "string", enum: ["todo", "in_progress", "done"] },
  },
} as const;

export const chapterPlan = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "id", "title", "summary", "objectives", "readingItems", "tasks"],
  properties: {
    schemaVersion,
    id: nonEmptyString,
    title: nonEmptyString,
    summary: nonEmptyString,
    objectives: { type: "array", minItems: 1, items: nonEmptyString },
    estimatedMinutes: { type: "integer", minimum: 1 },
    readingItems: { type: "array", items: readingItem },
    tasks: { type: "array", items: task },
  },
} as const;

export const chapterPlanArray = {
  type: "array",
  minItems: 1,
  items: chapterPlan,
} as const;

export const chapter = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "id", "title", "summary", "content", "objectives", "readingItems", "tasks"],
  properties: {
    schemaVersion,
    id: nonEmptyString,
    title: nonEmptyString,
    summary: nonEmptyString,
    content: nonEmptyString,
    objectives: { type: "array", minItems: 1, items: nonEmptyString },
    readingItems: { type: "array", items: readingItem },
    tasks: { type: "array", items: task },
  },
} as const;

export const quizQuestions = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "questions"],
  properties: {
    schemaVersion,
    questions: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "prompt"],
        properties: {
          id: nonEmptyString,
          prompt: nonEmptyString,
          rubric: nonEmptyString,
        },
      },
    },
  },
} as const;

export const quizGrading = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "responses", "score", "feedback"],
  properties: {
    schemaVersion,
    responses: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["questionId", "answer", "score", "feedback"],
        properties: {
          questionId: nonEmptyString,
          answer: nonEmptyString,
          score: { type: "number", minimum: 0, maximum: 1 },
          feedback: nonEmptyString,
        },
      },
    },
    score: { type: "number", minimum: 0, maximum: 1 },
    feedback: nonEmptyString,
  },
} as const;

export const qaAnswer = {
  type: "object",
  additionalProperties: false,
  required: ["answer"],
  properties: {
    answer: nonEmptyString,
    citations: { type: "array", items: nonEmptyString },
  },
} as const;
