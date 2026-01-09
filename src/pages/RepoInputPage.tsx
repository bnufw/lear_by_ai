import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useSession } from "../app/session";
import { parseGitHubRepoUrl } from "../github/ingest";

function normalizeRepoUrl(input: string): string | null {
  const parsed = parseGitHubRepoUrl(input);
  if (!parsed.ok) return null;
  return parsed.value.url;
}

export default function RepoInputPage() {
  const { session, recentSessions, recentSessionsStatus } = useSession();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialRepo = searchParams.get("repo") ?? "";

  const [repoUrl, setRepoUrl] = useState(initialRepo);
  const normalized = useMemo(() => normalizeRepoUrl(repoUrl), [repoUrl]);
  const canContinue = Boolean(normalized);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!normalized) return;
    navigate(`/plan?repo=${encodeURIComponent(normalized)}`);
  }

  return (
    <section className="stack">
      <h1 className="h1">Start with a public GitHub repo</h1>
      <p className="muted">
        Paste a repo URL (public only). The next steps will generate a multi-chapter learning plan and
        guide you through it.
      </p>

      <form className="card stack" onSubmit={onSubmit}>
        <label className="label" htmlFor="repo-url">
          GitHub repo URL
        </label>
        <input
          id="repo-url"
          className="input"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="https://github.com/vercel/next.js"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
        />
        {!repoUrl.trim() ? null : !normalized ? (
          <p className="error">Enter a valid public GitHub repo URL (like https://github.com/user/repo).</p>
        ) : (
          <p className="ok">Detected: {normalized}</p>
        )}

        <div className="row">
          <button className="button" type="submit" disabled={!canContinue}>
            Generate plan
          </button>
          {!session ? null : (
            <Link className="button" to={`/plan?session=${encodeURIComponent(session.id)}`}>
              Resume
            </Link>
          )}
        </div>
      </form>

      <div className="card stack">
        <div className="row row-between">
          <div>
            <div className="label">Recent sessions</div>
            <p className="muted small">本地 IndexedDB 保存（无账号 / 无云同步）。</p>
          </div>
        </div>

        {recentSessionsStatus === "loading" ? (
          <p className="muted">Loading…</p>
        ) : !recentSessions.length ? (
          <p className="muted">还没有历史会话。</p>
        ) : (
          <ul className="list">
            {recentSessions.map((s) => (
              <li key={s.id}>
                <Link to={`/plan?session=${encodeURIComponent(s.id)}`}>{s.repo.url}</Link>{" "}
                <span className="muted small">({new Date(s.updatedAt).toLocaleString()})</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
