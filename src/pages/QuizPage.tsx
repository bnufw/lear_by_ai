import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSession } from "../app/session";
import type { Chapter, QuizAttempt, QuizResponse } from "../domain/models";
import { gradeQuizAttempt, generateQuizQuestions } from "../llm";
import { allQuestionsAnswered, buildResponsesFromAnswers, createQuizAttempt, getLatestQuizAttempt } from "../quiz";

export default function QuizPage() {
  const {
    session,
    loadSessionById,
    ensureRepoContext,
    repoContextError,
    repoContextStatus,
    upsertQuizAttempt,
  } = useSession();
  const [searchParams] = useSearchParams();
  const chapterId = searchParams.get("chapter");
  const sessionId = searchParams.get("session");

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "grading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [answersById, setAnswersById] = useState<Record<string, string>>({});
  const abortRef = useRef<AbortController | null>(null);

  const chapter: Chapter | null = useMemo(() => {
    if (!chapterId) return null;
    return session?.chapters?.find((c) => c.id === chapterId) ?? null;
  }, [chapterId, session?.chapters]);

  useEffect(() => {
    if (!sessionId) return;
    if (session?.id === sessionId) return;
    void loadSessionById(sessionId);
  }, [loadSessionById, session?.id, sessionId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!session || !chapterId) return;
      if (status === "loading" || status === "grading") return;

      const existing = getLatestQuizAttempt(session.quizAttempts, chapterId);
      if (existing) {
        setAttempt(existing);
        const init: Record<string, string> = {};
        for (const r of existing.responses) init[r.questionId] = r.answer;
        setAnswersById(init);
        setStatus("ready");
        return;
      }

      if (!chapter) {
        setStatus("error");
        setError("找不到该章节内容，请先回到章节页生成章节内容。");
        return;
      }

      setStatus("loading");
      setError(null);
      const controller = new AbortController();
      abortRef.current = controller;
      const ctx = await ensureRepoContext({ signal: controller.signal });
      if (cancelled) return;
      if (!ctx) {
        setStatus("error");
        setError(repoContextError ?? "获取仓库上下文失败");
        return;
      }

      const questions = await generateQuizQuestions(ctx, chapter, { signal: controller.signal });
      if (cancelled) return;
      const created = createQuizAttempt({ chapterId, questions });
      await upsertQuizAttempt(created);
      setAttempt(created);
      setAnswersById({});
      setStatus("ready");
    })().catch((e: any) => {
      if (cancelled) return;
      setStatus("error");
      setError(e?.message === "CANCELLED" ? "已取消" : (e?.message ?? "初始化 quiz 失败"));
    });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [chapter, chapterId, ensureRepoContext, repoContextError, session, status, upsertQuizAttempt]);

  function setAnswer(questionId: string, value: string) {
    setAnswersById((prev) => ({ ...prev, [questionId]: value }));
  }

  async function saveDraft() {
    if (!attempt) return;
    const responses = buildResponsesFromAnswers({
      questions: attempt.questions,
      answersByQuestionId: answersById,
      existing: attempt.responses,
    });
    const next: QuizAttempt = { ...attempt, responses, updatedAt: new Date().toISOString() };
    await upsertQuizAttempt(next);
    setAttempt(next);
  }

  async function submitForGrading() {
    if (!attempt || !chapter) return;
    const ready = allQuestionsAnswered(attempt.questions, answersById);
    if (!ready) {
      setError("请先回答所有问题再提交评分。");
      return;
    }

    setStatus("grading");
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const ctx = await ensureRepoContext({ signal: controller.signal });
    if (!ctx) {
      setStatus("error");
      setError(repoContextError ?? "获取仓库上下文失败");
      return;
    }

    const responses = buildResponsesFromAnswers({ questions: attempt.questions, answersByQuestionId: answersById, existing: attempt.responses });
    const attemptForGrade: QuizAttempt = { ...attempt, responses };

    const graded = await gradeQuizAttempt({
      repoContext: ctx,
      chapter,
      attempt: attemptForGrade,
      options: { maxAttempts: 2, signal: controller.signal },
    });
    if (controller.signal.aborted || (!graded.ok && graded.error === "CANCELLED")) {
      setStatus("ready");
      setError("已取消");
      return;
    }

    const finalResponses: QuizResponse[] = graded.ok
      ? graded.data.responses
      : graded.fallback.responses;

    const next: QuizAttempt = {
      ...attemptForGrade,
      status: "completed",
      responses: finalResponses,
      score: graded.ok ? graded.data.score : graded.fallback.score,
      feedback: graded.ok ? graded.data.feedback : graded.fallback.feedback,
      updatedAt: new Date().toISOString(),
    };

    await upsertQuizAttempt(next);
    setAttempt(next);
    setStatus("ready");

    if (!graded.ok) setError(`评分失败，已降级：${graded.error}`);
  }

  function cancelOngoing() {
    abortRef.current?.abort();
    setStatus("error");
    setError("已取消");
  }

  return (
    <section className="stack">
      <h1 className="h1">Quiz</h1>
      <p className="muted">3–5 道开放题：作答后进行评分与反馈，并保存到本地会话。</p>

      <div className="card stack">
        <div className="row row-between">
          <div className="row">
            <div className="label">Session</div>
            <div className="mono">{session?.id ?? "(none)"}</div>
          </div>
          {!attempt ? null : (
            <span className={attempt.status === "completed" ? "badge ok" : "badge"}>
              {attempt.status === "completed" ? "completed" : "in progress"}
            </span>
          )}
        </div>

        <div className="row">
          <div className="label">Chapter</div>
          <div className="mono">{chapterId ?? "(none)"}</div>
        </div>

        {status === "loading" ? (
          <div className="row row-between">
            <p className="muted">Generating questions…</p>
            <button className="button button-small" type="button" onClick={cancelOngoing}>
              Cancel
            </button>
          </div>
        ) : null}
        {status === "grading" ? (
          <div className="row row-between">
            <p className="muted">Grading…</p>
            <button className="button button-small" type="button" onClick={cancelOngoing}>
              Cancel
            </button>
          </div>
        ) : null}
        {!error ? null : <p className="error">{error}</p>}
        {repoContextStatus === "error" ? <p className="error">{repoContextError}</p> : null}

        {!attempt ? null : (
          <div className="stack">
            <div className="label">Questions</div>
            <ol className="list">
              {attempt.questions.map((q) => {
                const answer = answersById[q.id] ?? attempt.responses.find((r) => r.questionId === q.id)?.answer ?? "";
                const gradedResponse = attempt.responses.find((r) => r.questionId === q.id);
                const isCompleted = attempt.status === "completed";
                return (
                  <li key={q.id} className="stack">
                    <div className="row row-between">
                      <div>
                        <div>{q.prompt}</div>
                        {!q.rubric ? null : <div className="muted small">Rubric: {q.rubric}</div>}
                      </div>
                      {!isCompleted || gradedResponse?.score == null ? null : (
                        <span className="badge ok">Score: {gradedResponse.score.toFixed(2)}</span>
                      )}
                    </div>
                    <textarea
                      className="input textarea"
                      value={answer}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                      rows={5}
                      disabled={isCompleted}
                      placeholder="Write your answer…"
                    />
                    {!isCompleted || !gradedResponse?.feedback ? null : (
                      <div className="card">
                        <div className="label">Feedback</div>
                        <div className="muted small">{gradedResponse.feedback}</div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {!attempt ? null : attempt.status !== "completed" ? (
          <div className="row">
            <button className="button" type="button" onClick={() => void saveDraft()} disabled={status !== "ready"}>
              Save draft
            </button>
            <button
              className="button"
              type="button"
              onClick={() => void submitForGrading()}
              disabled={status !== "ready" || !allQuestionsAnswered(attempt.questions, answersById)}
            >
              Submit for grading
            </button>
          </div>
        ) : (
          <div className="stack">
            <div className="row row-between">
              <div>
                <div className="label">Overall</div>
                <div className="mono">Score: {(attempt.score ?? 0).toFixed(2)}</div>
              </div>
            </div>
            {!attempt.feedback ? null : <p className="muted small">{attempt.feedback}</p>}
          </div>
        )}

        <div className="row">
          <Link
            className="button"
            to={
              chapterId
                ? `/chapter/${encodeURIComponent(chapterId)}${session ? `?session=${encodeURIComponent(session.id)}` : ""}`
                : "/"
            }
          >
            Back to chapter
          </Link>
          <Link className="button" to="/">
            Home
          </Link>
        </div>
      </div>
    </section>
  );
}
