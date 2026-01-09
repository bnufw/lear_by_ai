import { z } from "zod";
import {
  ChapterPlanSchema,
  ChapterSchema,
  MessageSchema,
  QuizAttemptSchema,
  QuizQuestionSchema,
  QuizResponseSchema,
  ReadingItemSchema,
  RepoSourceSchema,
  SCHEMA_VERSION,
  SchemaVersionSchema,
  SessionSchema,
  TaskSchema,
  TaskStatusSchema,
  MessageRoleSchema,
} from "../lib/schema/learning";

export type SchemaVersion = z.infer<typeof SchemaVersionSchema>;
export type RepoSource = z.infer<typeof RepoSourceSchema>;
export type ReadingItem = z.infer<typeof ReadingItemSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type ChapterPlan = z.infer<typeof ChapterPlanSchema>;
export type Chapter = z.infer<typeof ChapterSchema>;
export type MessageRole = z.infer<typeof MessageRoleSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export type QuizResponse = z.infer<typeof QuizResponseSchema>;
export type QuizAttempt = z.infer<typeof QuizAttemptSchema>;
export type Session = z.infer<typeof SessionSchema>;

export {
  SCHEMA_VERSION,
  SchemaVersionSchema,
  RepoSourceSchema,
  ReadingItemSchema,
  TaskStatusSchema,
  TaskSchema,
  ChapterPlanSchema,
  ChapterSchema,
  MessageRoleSchema,
  MessageSchema,
  QuizQuestionSchema,
  QuizResponseSchema,
  QuizAttemptSchema,
  SessionSchema,
};

