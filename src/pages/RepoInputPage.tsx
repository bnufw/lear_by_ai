import { FormEvent, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

function normalizeRepoUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.hostname !== "github.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return `https://github.com/${parts[0]}/${parts[1]}`;
  } catch {
    return null;
  }
}

export default function RepoInputPage() {
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
        </div>
      </form>
    </section>
  );
}

