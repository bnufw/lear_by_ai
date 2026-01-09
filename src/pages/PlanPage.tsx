import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useSession } from "../app/session";
import { generateChapter, generatePlan } from "../llm";

export default function PlanPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const repo = searchParams.get("repo");
  const sessionId = searchParams.get("session");

  const {
    session,
    status,
    loadError,
    repoContext,
    repoContextError,
    repoContextStatus,
    startNewSessionFromRepo,
    loadSessionById,
    ensureRepoContext,
    setPlan,
    upsertChapter,
  } = useSession();

  const [runStatus, setRunStatus] = useState<"idle" | "running" | "error">("idle");
  const [runMessage, setRunMessage] = useState<string>("");
  const [runError, setRunError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activeSessionId = session?.id ?? null;
  const resolvedRepoUrl = useMemo(() => repo?.trim() || null, [repo]);

  useEffect(() => {
    if (!sessionId) return;
    if (activeSessionId === sessionId) return;
    void loadSessionById(sessionId);
  }, [activeSessionId, loadSessionById, sessionId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (runStatus === "running") return;

      const controller = new AbortController();
      abortRef.current = controller;

      const effectiveSession =
        resolvedRepoUrl && (!session || session.repo.url !== resolvedRepoUrl)
          ? await startNewSessionFromRepo(resolvedRepoUrl, { signal: controller.signal })
          : session;

      if (cancelled) return;
      if (!effectiveSession) return;

      const hasPlan = Boolean(effectiveSession.plan?.length);
      if (hasPlan) return;

      setRunStatus("running");
      setRunError(null);
      setRunMessage("获取仓库上下文…");

      const ctx = await ensureRepoContext({ signal: controller.signal });
      if (cancelled) return;
      if (!ctx) {
        setRunStatus("error");
        setRunError(repoContextError ?? "获取仓库上下文失败");
        return;
      }

      setRunMessage("生成学习计划（chapters）…");
      const plan = await generatePlan(ctx, { signal: controller.signal });
      if (cancelled) return;
      await setPlan(plan);

      const first = plan[0];
      if (!first) {
        setRunStatus("error");
        setRunError("计划为空");
        return;
      }

      setRunMessage("生成 Chapter 1…");
      const chapter = await generateChapter(ctx, first, { signal: controller.signal });
      if (cancelled) return;
      await upsertChapter(chapter);

      setRunMessage("完成，跳转到 Chapter 1…");
      navigate(`/chapter/${encodeURIComponent(chapter.id)}?session=${encodeURIComponent(effectiveSession.id)}`, { replace: true });
    })().catch((error: any) => {
      if (cancelled) return;
      setRunStatus("error");
      setRunError(error?.message === "CANCELLED" ? "已取消" : (error?.message ?? "生成失败"));
    });

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [
    ensureRepoContext,
    navigate,
    repoContextError,
    resolvedRepoUrl,
    runStatus,
    session,
    setPlan,
    startNewSessionFromRepo,
    upsertChapter,
  ]);

  function cancelRun() {
    abortRef.current?.abort();
    setRunStatus("error");
    setRunError("已取消");
  }

  return (
    <section className="stack">
      <h1 className="h1">Learning plan</h1>
      <p className="muted">生成 multi-chapter 计划，并自动准备 Chapter 1。</p>

      <div className="card stack">
        <div>
          <div className="label">Repo</div>
          <div className="mono">{session?.repo.url ?? resolvedRepoUrl ?? "(none yet)"}</div>
        </div>

        {status === "loading" ? <p className="muted">Loading…</p> : !session ? null : null}
        {!loadError ? null : <p className="error">{loadError}</p>}
        {!repoContextError ? null : <p className="error">{repoContextError}</p>}

        {runStatus === "running" ? (
          <div className="row row-between">
            <p className="muted">{runMessage}</p>
            <button className="button button-small" type="button" onClick={cancelRun}>
              Cancel
            </button>
          </div>
        ) : runStatus === "error" ? (
          <p className="error">{runError ?? "生成失败"}</p>
        ) : null}

        {!session?.plan?.length ? null : (
          <div className="stack">
            <div className="label">Chapters</div>
            <ol className="list">
              {session.plan.map((c) => (
                <li key={c.id}>
                  <div className="row row-between">
                    <span>
                      <span className="mono">{c.id}</span> — {c.title}
                    </span>
                    <Link
                      className="button button-small"
                      to={`/chapter/${encodeURIComponent(c.id)}?session=${encodeURIComponent(session.id)}`}
                    >
                      Open
                    </Link>
                  </div>
                  <div className="muted small">{c.summary}</div>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="row">
          {!session ? (
            <Link className="button" to="/">
              Back
            </Link>
          ) : (
            <Link className="button" to={`/chapter/${encodeURIComponent(session.currentChapterId ?? "chapter-1")}?session=${encodeURIComponent(session.id)}`}>
              Open current chapter
            </Link>
          )}
          {!session?.repo.url ? null : (
            <Link className="button" to={`/?repo=${encodeURIComponent(session.repo.url)}`}>
              Change repo
            </Link>
          )}
        </div>
      </div>

      {!repoContext ? null : (
        <div className="card stack">
          <div className="label">Repo context</div>
          <p className="muted small">
            选中 {repoContext.files.length} 个文件，总计 {repoContext.stats.totalBytes} bytes；被跳过 {repoContext.stats.skippedFiles} 个。
          </p>
          {!repoContext.warnings.length ? null : <p className="muted small">Warnings: {repoContext.warnings.join(" | ")}</p>}
        </div>
      )}

      {repoContextStatus === "error" ? <p className="error">获取仓库上下文失败：{repoContextError}</p> : null}
    </section>
  );
}
