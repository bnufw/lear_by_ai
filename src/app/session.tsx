import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Chapter, ChapterPlan, Message, QuizAttempt, Session, TaskStatus } from "../domain/models";
import { fetchRepoContext } from "../github/ingest";
import type { RepoContext } from "../github/types";
import { formatGitHubError } from "../lib/errors";
import { SCHEMA_VERSION } from "../lib/schema/learning";
import { deleteSession, getLastSessionId, getSession, listSessions, saveSession, setLastSessionId } from "../storage";

type LoadStatus = "idle" | "loading" | "ready" | "error";

type SessionListItem = Pick<Session, "id" | "repo" | "createdAt" | "updatedAt">;

type SessionContextValue = {
  status: LoadStatus;
  session: Session | null;
  loadError: string | null;

  saving: boolean;
  saveError: string | null;

  repoContextStatus: LoadStatus;
  repoContext: RepoContext | null;
  repoContextError: string | null;

  recentSessionsStatus: LoadStatus;
  recentSessions: SessionListItem[];
  refreshRecentSessions: () => Promise<void>;

  loadSessionById: (sessionId: string) => Promise<void>;
  startNewSessionFromRepo: (repoUrl: string, options?: { signal?: AbortSignal }) => Promise<Session | null>;
  ensureRepoContext: (options?: { signal?: AbortSignal }) => Promise<RepoContext | null>;

  setPlan: (plan: ChapterPlan[]) => Promise<void>;
  upsertChapter: (chapter: Chapter) => Promise<void>;
  updateTaskStatus: (params: { chapterId: string; taskId: string; status: TaskStatus }) => Promise<void>;
  markChapterComplete: (chapterId: string) => Promise<void>;
  addMessages: (messages: Message[]) => Promise<void>;
  upsertQuizAttempt: (attempt: QuizAttempt) => Promise<void>;

  clearCurrentSession: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const MAX_MESSAGES = 80;
const MAX_MESSAGE_CHARS = 8_000;
const MAX_QUIZ_TEXT_CHARS = 12_000;

function clampText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[TRUNCATED]`;
}

function getChapterOrder(plan?: ChapterPlan[]): string[] {
  return (plan ?? []).map((c) => c.id);
}

function nextChapterId(plan: ChapterPlan[] | undefined, currentId: string | undefined): string | null {
  if (!plan?.length || !currentId) return null;
  const ids = getChapterOrder(plan);
  const idx = ids.indexOf(currentId);
  if (idx === -1) return null;
  return ids[idx + 1] ?? null;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [repoContextStatus, setRepoContextStatus] = useState<LoadStatus>("idle");
  const [repoContext, setRepoContext] = useState<RepoContext | null>(null);
  const [repoContextError, setRepoContextError] = useState<string | null>(null);

  const [recentSessionsStatus, setRecentSessionsStatus] = useState<LoadStatus>("idle");
  const [recentSessions, setRecentSessions] = useState<SessionListItem[]>([]);

  const persistSession = useCallback(async (next: Session) => {
    setSession(next);
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await saveSession(next);
      if (!saved.ok) {
        setSaveError(saved.error);
        return;
      }
      await setLastSessionId(next.id);
    } finally {
      setSaving(false);
    }
  }, []);

  const refreshRecentSessions = useCallback(async () => {
    setRecentSessionsStatus("loading");
    const result = await listSessions();
    if (!result.ok) {
      setRecentSessionsStatus("error");
      setRecentSessions([]);
      return;
    }
    const items = result.value
      .map((s) => ({ id: s.id, repo: s.repo, createdAt: s.createdAt, updatedAt: s.updatedAt }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 6);
    setRecentSessions(items);
    setRecentSessionsStatus("ready");
  }, []);

  const loadSessionById = useCallback(async (sessionId: string) => {
    setStatus("loading");
    setLoadError(null);
    setRepoContext(null);
    setRepoContextStatus("idle");
    setRepoContextError(null);
    try {
      const loaded = await getSession(sessionId);
      if (!loaded.ok) {
        setStatus("error");
        setLoadError(loaded.error);
        return;
      }
      if (!loaded.value) {
        setStatus("error");
        setLoadError("未找到该会话");
        return;
      }
      setSession(loaded.value);
      setStatus("ready");
      await setLastSessionId(loaded.value.id);
    } catch (error: any) {
      setStatus("error");
      setLoadError(error?.message ?? "加载会话失败");
    }
  }, []);

  const startNewSessionFromRepo = useCallback(
    async (repoUrl: string, options?: { signal?: AbortSignal }): Promise<Session | null> => {
      setRepoContext(null);
      setRepoContextStatus("loading");
      setRepoContextError(null);
      const result = await fetchRepoContext(repoUrl, { signal: options?.signal });
      if (!result.ok) {
        setRepoContextStatus("error");
        setRepoContextError(formatGitHubError(result.error));
        return null;
      }

      setRepoContext(result.value);
      setRepoContextStatus("ready");

      const createdAt = nowIso();
      const next: Session = {
        schemaVersion: SCHEMA_VERSION,
        id: makeId("session"),
        repo: {
          schemaVersion: SCHEMA_VERSION,
          kind: "github",
          url: result.value.repo.url,
          owner: result.value.repo.owner,
          repo: result.value.repo.repo,
          defaultBranch: result.value.repo.defaultBranch,
          description: result.value.repo.description,
          selectedPaths: result.value.selectedPaths,
          fetchedAt: result.value.repo.fetchedAt,
        },
        createdAt,
        updatedAt: createdAt,
      };

      setStatus("ready");
      await persistSession(next);
      await refreshRecentSessions();
      return next;
    },
    [persistSession, refreshRecentSessions],
  );

  const ensureRepoContext = useCallback(async (options?: { signal?: AbortSignal }): Promise<RepoContext | null> => {
    if (!session) return null;
    if (repoContext && repoContext.repo.url === session.repo.url) return repoContext;

    setRepoContextStatus("loading");
    setRepoContextError(null);
    const result = await fetchRepoContext(session.repo.url, { signal: options?.signal });
    if (!result.ok) {
      setRepoContextStatus("error");
      setRepoContextError(formatGitHubError(result.error));
      return null;
    }
    setRepoContext(result.value);
    setRepoContextStatus("ready");
    return result.value;
  }, [repoContext, session]);

  const setPlan = useCallback(
    async (plan: ChapterPlan[]) => {
      if (!session) return;
      const first = plan[0]?.id;
      const next: Session = {
        ...session,
        plan,
        currentChapterId: session.currentChapterId ?? first,
        updatedAt: nowIso(),
      };
      await persistSession(next);
    },
    [persistSession, session],
  );

  const upsertChapter = useCallback(
    async (chapter: Chapter) => {
      if (!session) return;
      const chapters = [...(session.chapters ?? [])];
      const idx = chapters.findIndex((c) => c.id === chapter.id);
      if (idx === -1) chapters.push(chapter);
      else chapters[idx] = chapter;
      const next: Session = { ...session, chapters, updatedAt: nowIso() };
      await persistSession(next);
    },
    [persistSession, session],
  );

  const updateTaskStatus = useCallback(
    async (params: { chapterId: string; taskId: string; status: TaskStatus }) => {
      if (!session) return;
      const chapters = [...(session.chapters ?? [])];
      const idx = chapters.findIndex((c) => c.id === params.chapterId);
      if (idx === -1) return;
      const chapter = chapters[idx];
      const tasks = chapter.tasks.map((t) => (t.id === params.taskId ? { ...t, status: params.status } : t));
      chapters[idx] = { ...chapter, tasks };
      const next: Session = { ...session, chapters, updatedAt: nowIso() };
      await persistSession(next);
    },
    [persistSession, session],
  );

  const markChapterComplete = useCallback(
    async (chapterId: string) => {
      if (!session) return;
      const completed = new Set(session.completedChapterIds ?? []);
      completed.add(chapterId);
      const nextId = nextChapterId(session.plan, chapterId);
      const next: Session = {
        ...session,
        completedChapterIds: Array.from(completed),
        currentChapterId: nextId ?? session.currentChapterId,
        updatedAt: nowIso(),
      };
      await persistSession(next);
    },
    [persistSession, session],
  );

  const addMessages = useCallback(
    async (messages: Message[]) => {
      if (!session) return;
      const normalized = messages.map((m) => ({ ...m, content: clampText(m.content, MAX_MESSAGE_CHARS) }));
      const next: Session = {
        ...session,
        messages: [...(session.messages ?? []), ...normalized].slice(-MAX_MESSAGES),
        updatedAt: nowIso(),
      };
      await persistSession(next);
    },
    [persistSession, session],
  );

  const upsertQuizAttempt = useCallback(
    async (attempt: QuizAttempt) => {
      if (!session) return;
      const clipped: QuizAttempt = {
        ...attempt,
        questions: attempt.questions.map((q) => ({
          ...q,
          prompt: clampText(q.prompt, MAX_QUIZ_TEXT_CHARS),
          rubric: q.rubric ? clampText(q.rubric, MAX_QUIZ_TEXT_CHARS) : undefined,
        })),
        responses: attempt.responses.map((r) => ({
          ...r,
          answer: clampText(r.answer, MAX_QUIZ_TEXT_CHARS),
          feedback: r.feedback ? clampText(r.feedback, MAX_QUIZ_TEXT_CHARS) : undefined,
        })),
        feedback: attempt.feedback ? clampText(attempt.feedback, MAX_QUIZ_TEXT_CHARS) : undefined,
      };
      const attempts = [...(session.quizAttempts ?? [])];
      const idx = attempts.findIndex((a) => a.id === clipped.id);
      if (idx === -1) attempts.push(clipped);
      else attempts[idx] = clipped;
      const next: Session = { ...session, quizAttempts: attempts, updatedAt: nowIso() };
      await persistSession(next);
    },
    [persistSession, session],
  );

  const clearCurrentSession = useCallback(async () => {
    if (!session) return;
    await deleteSession(session.id);
    await setLastSessionId(null);
    setSession(null);
    setRepoContext(null);
    setRepoContextStatus("idle");
    setRepoContextError(null);
    await refreshRecentSessions();
  }, [refreshRecentSessions, session]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus("loading");
      const last = await getLastSessionId();
      if (!last.ok || !last.value) {
        if (!cancelled) setStatus("ready");
        await refreshRecentSessions();
        return;
      }
      const loaded = await getSession(last.value);
      if (cancelled) return;
      if (!loaded.ok) {
        setStatus("error");
        setLoadError(loaded.error);
        await refreshRecentSessions();
        return;
      }
      setSession(loaded.value);
      setStatus("ready");
      await refreshRecentSessions();
    })().catch((error: any) => {
      if (cancelled) return;
      setStatus("error");
      setLoadError(error?.message ?? "初始化失败");
    });
    return () => {
      cancelled = true;
    };
  }, [refreshRecentSessions]);

  const value: SessionContextValue = useMemo(
    () => ({
      status,
      session,
      loadError,
      saving,
      saveError,
      repoContextStatus,
      repoContext,
      repoContextError,
      recentSessionsStatus,
      recentSessions,
      refreshRecentSessions,
      loadSessionById,
      startNewSessionFromRepo,
      ensureRepoContext,
      setPlan,
      upsertChapter,
      updateTaskStatus,
      markChapterComplete,
      addMessages,
      upsertQuizAttempt,
      clearCurrentSession,
    }),
    [
      addMessages,
      clearCurrentSession,
      ensureRepoContext,
      loadError,
      loadSessionById,
      recentSessions,
      recentSessionsStatus,
      refreshRecentSessions,
      repoContext,
      repoContextError,
      repoContextStatus,
      saveError,
      saving,
      session,
      setPlan,
      startNewSessionFromRepo,
      status,
      upsertChapter,
      updateTaskStatus,
      markChapterComplete,
      upsertQuizAttempt,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within <SessionProvider>");
  return ctx;
}
