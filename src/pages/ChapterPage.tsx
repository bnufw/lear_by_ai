import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useSession } from "../app/session";
import type { Chapter, Message } from "../domain/models";
import { answerQuestion, generateChapter } from "../llm";

export default function ChapterPage() {
  const { chapterId } = useParams();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session");

  const {
    session,
    status,
    loadError,
    loadSessionById,
    ensureRepoContext,
    repoContext,
    repoContextError,
    repoContextStatus,
    upsertChapter,
    updateTaskStatus,
    markChapterComplete,
    addMessages,
    saving,
    saveError,
  } = useSession();

  const canonicalChapterId = useMemo(() => {
    if (!chapterId) return null;
    if (/^\d+$/.test(chapterId)) return `chapter-${chapterId}`;
    return chapterId;
  }, [chapterId]);

  const [chapterStatus, setChapterStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [chapterError, setChapterError] = useState<string | null>(null);
  const [activeChapter, setActiveChapter] = useState<Chapter | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  const completed = Boolean(
    canonicalChapterId && session?.completedChapterIds?.includes(canonicalChapterId),
  );

  const messages: Message[] = session?.messages ?? [];

  const hasQuizAttempt = Boolean(
    canonicalChapterId && (session?.quizAttempts ?? []).some((a) => a.chapterId === canonicalChapterId),
  );

  useEffect(() => {
    if (!sessionId) return;
    if (session?.id === sessionId) return;
    void loadSessionById(sessionId);
  }, [loadSessionById, session?.id, sessionId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!canonicalChapterId) return;
      if (!session) return;
      if (chapterStatus === "loading") return;

      const existing = session.chapters?.find((c) => c.id === canonicalChapterId) ?? null;
      if (existing) {
        setActiveChapter(existing);
        setChapterStatus("ready");
        return;
      }

      const planItem = session.plan?.find((c) => c.id === canonicalChapterId) ?? null;
      if (!planItem) {
        setChapterStatus("error");
        setChapterError("未找到该章节的计划（plan）");
        return;
      }

      setChapterStatus("loading");
      setChapterError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      const ctx = await ensureRepoContext({ signal: controller.signal });
      if (cancelled) return;
      if (!ctx) {
        setChapterStatus("error");
        setChapterError(repoContextError ?? "获取仓库上下文失败");
        return;
      }

      const generated = await generateChapter(ctx, planItem, { signal: controller.signal });
      if (cancelled) return;
      await upsertChapter(generated);

      setActiveChapter(generated);
      setChapterStatus("ready");
    })().catch((error: any) => {
      if (cancelled) return;
      setChapterStatus("error");
      setChapterError(error?.message === "CANCELLED" ? "已取消" : (error?.message ?? "生成章节失败"));
    });

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [canonicalChapterId, chapterStatus, ensureRepoContext, repoContextError, session, upsertChapter]);

  const nextId = useMemo(() => {
    if (!session?.plan?.length || !canonicalChapterId) return null;
    const ids = session.plan.map((c) => c.id);
    const idx = ids.indexOf(canonicalChapterId);
    return idx >= 0 ? ids[idx + 1] ?? null : null;
  }, [canonicalChapterId, session?.plan]);

  async function toggleTask(taskId: string, checked: boolean) {
    if (!activeChapter) return;
    const status = checked ? "done" : "todo";
    await updateTaskStatus({ chapterId: activeChapter.id, taskId, status });
  }

  async function onAsk(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    if (!session) return;
    if (!activeChapter) return;

    const controller = new AbortController();
    abortRef.current = controller;
    const ctx = await ensureRepoContext({ signal: controller.signal });
    if (!ctx) return;

    setAsking(true);
    const createdAt = new Date().toISOString();
    const userMsg: Message = { id: `msg-${createdAt}`, role: "user", content: question.trim(), createdAt };
    await addMessages([userMsg]);

    let res: { answer: string; citations?: string[] };
    try {
      res = await answerQuestion({
        repoContext: ctx,
        chapter: activeChapter,
        history: [...messages, userMsg],
        question: question.trim(),
        options: { maxAttempts: 2, signal: controller.signal },
      });
    } catch (error: any) {
      setAsking(false);
      if (error?.message === "CANCELLED") return;
      res = { answer: "回答生成失败（可能是网络或服务问题）。你可以稍后再试。", citations: [] };
    }

    const assistantMsg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      role: "assistant",
      content: res.answer,
      createdAt: new Date().toISOString(),
    };
    await addMessages([assistantMsg]);
    setQuestion("");
    setAsking(false);
  }

  function cancelOngoing() {
    abortRef.current?.abort();
    setAsking(false);
    setChapterStatus((prev) => (prev === "loading" ? "error" : prev));
    setChapterError((prev) => prev ?? "已取消");
  }

  return (
    <section className="stack">
      <h1 className="h1">Chapter {canonicalChapterId ?? chapterId}</h1>
      <p className="muted">章节内容 + 任务清单 + 内联 Q&amp;A（基于仓库上下文）。</p>

      <div className="card stack">
        <div>
          <div className="label">Repo</div>
          <div className="mono">{session?.repo.url ?? "(none yet)"}</div>
        </div>

        {status === "loading" ? <p className="muted">Loading…</p> : null}
        {!loadError ? null : <p className="error">{loadError}</p>}
        {repoContextStatus === "error" ? <p className="error">{repoContextError}</p> : null}
        {chapterStatus === "loading" ? (
          <div className="row row-between">
            <p className="muted">Generating chapter…</p>
            <button className="button button-small" type="button" onClick={cancelOngoing}>
              Cancel
            </button>
          </div>
        ) : null}
        {chapterStatus === "error" ? <p className="error">{chapterError}</p> : null}

        {!activeChapter ? null : (
          <>
            <div className="stack">
              <div className="row row-between">
                <div>
                  <div className="label">Title</div>
                  <div>{activeChapter.title}</div>
                  <div className="muted small">{activeChapter.summary}</div>
                </div>
                {!completed ? null : <span className="badge ok">Completed</span>}
              </div>
            </div>

            <div className="stack">
              <div className="label">Objectives</div>
              <ul className="list">
                {activeChapter.objectives.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </div>

            {!activeChapter.readingItems.length ? null : (
              <div className="stack">
                <div className="label">Reading</div>
                <ul className="list">
                  {activeChapter.readingItems.map((item) => (
                    <li key={item.id}>
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noreferrer">
                          {item.title}
                        </a>
                      ) : (
                        <span>{item.title}</span>
                      )}
                      {!item.path ? null : <span className="muted small"> — {item.path}</span>}
                      {!item.description ? null : <div className="muted small">{item.description}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="stack">
              <div className="label">Tasks</div>
              {!activeChapter.tasks.length ? (
                <p className="muted">（该章节没有任务）</p>
              ) : (
                <ul className="list">
                  {activeChapter.tasks.map((t) => (
                    <li key={t.id}>
                      <label className="row task-row">
                        <input
                          type="checkbox"
                          checked={t.status === "done"}
                          onChange={(e) => void toggleTask(t.id, e.target.checked)}
                        />
                        <span>
                          {t.title} <span className="muted small mono">({t.id})</span>
                        </span>
                      </label>
                      {!t.description ? null : <div className="muted small">{t.description}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="row row-between">
              <div className="row">
                <button
                  className="button"
                  type="button"
                  disabled={completed}
                  onClick={() => void markChapterComplete(activeChapter.id)}
                >
                  Mark complete
                </button>
                {!nextId ? null : (
                  <Link className="button" to={`/chapter/${encodeURIComponent(nextId)}?session=${encodeURIComponent(session?.id ?? "")}`}>
                    Continue
                  </Link>
                )}
                {!completed ? (
                  <button className="button" type="button" disabled>
                    Quiz（先完成本章）
                  </button>
                ) : (
                  <Link
                    className="button"
                    to={`/quiz?chapter=${encodeURIComponent(activeChapter.id)}${session ? `&session=${encodeURIComponent(session.id)}` : ""}`}
                  >
                    {hasQuizAttempt ? "Review quiz" : "Start quiz"}
                  </Link>
                )}
              </div>
              <div className="row">
                {!saving ? null : <span className="badge">Saving…</span>}
                {!saveError ? null : <span className="badge danger">保存失败</span>}
              </div>
            </div>

            <details className="stack">
              <summary className="label">Chapter content</summary>
              <pre className="mono pre">{activeChapter.content}</pre>
            </details>
          </>
        )}
      </div>

      <div className="card stack">
        <div className="row row-between">
          <div>
            <h2 className="h2">Q&amp;A</h2>
            <p className="muted small">问题会通过 `/api/llm` 生成回答，并尽量基于已选仓库文件与当前章节。</p>
          </div>
          {!repoContext ? null : <span className="badge">Context ready</span>}
        </div>

        {!messages.length ? <p className="muted">还没有对话。</p> : null}
        {!messages.length ? null : (
          <ul className="list">
            {messages.slice(-12).map((m) => (
              <li key={m.id}>
                <span className="badge">{m.role}</span> {m.content}
              </li>
            ))}
          </ul>
        )}

        <form className="stack" onSubmit={onAsk}>
          <label className="label" htmlFor="question">
            Ask a question
          </label>
          <textarea
            id="question"
            className="input textarea"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            placeholder="e.g. Where is the main entry point? How do I run tests?"
          />
          <div className="row">
            <button className="button" type="submit" disabled={!question.trim() || asking || !activeChapter}>
              {asking ? "Asking…" : "Ask"}
            </button>
            <Link className="button" to={session ? `/plan?session=${encodeURIComponent(session.id)}` : "/plan"}>
              Back to plan
            </Link>
          </div>
        </form>

        {repoContextStatus === "error" ? <p className="error">上下文获取失败：{repoContextError}</p> : null}
      </div>
    </section>
  );
}
