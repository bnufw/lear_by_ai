import { useParams, useSearchParams } from "react-router-dom";

export default function ChapterPage() {
  const { chapterId } = useParams();
  const [searchParams] = useSearchParams();
  const repo = searchParams.get("repo");

  return (
    <section className="stack">
      <h1 className="h1">Chapter {chapterId}</h1>
      <p className="muted">
        Chapter content, Q&amp;A, and quizzes will be implemented in later issues. This is a placeholder
        view to validate navigation.
      </p>

      <div className="card stack">
        <div>
          <div className="label">Repo</div>
          <div className="mono">{repo ?? "(none yet)"}</div>
        </div>
        <div className="stack">
          <div className="label">Objectives (placeholder)</div>
          <ul className="list">
            <li>Understand the repo structure and entry points.</li>
            <li>Set up the environment and run the project locally.</li>
            <li>Identify 2–3 core concepts to focus on next.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

