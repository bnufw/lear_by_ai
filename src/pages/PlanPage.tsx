import { Link, useSearchParams } from "react-router-dom";

export default function PlanPage() {
  const [searchParams] = useSearchParams();
  const repo = searchParams.get("repo");

  return (
    <section className="stack">
      <h1 className="h1">Learning plan</h1>
      <p className="muted">
        This page will be backed by Gemini later. For now it verifies routing and basic UX structure.
      </p>

      <div className="card stack">
        <div>
          <div className="label">Repo</div>
          <div className="mono">{repo ?? "(none yet)"}</div>
        </div>

        <div className="stack">
          <div className="label">Chapters (placeholder)</div>
          <ol className="list">
            <li>Chapter 1: Overview + environment</li>
            <li>Chapter 2: Core concepts</li>
            <li>Chapter 3: Build something real</li>
          </ol>
        </div>

        <div className="row">
          <Link className="button" to={`/chapter/1${repo ? `?repo=${encodeURIComponent(repo)}` : ""}`}>
            Open Chapter 1
          </Link>
        </div>
      </div>
    </section>
  );
}

