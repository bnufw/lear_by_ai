import { Link, useLocation } from "react-router-dom";
import { useSession } from "../app/session";

function NavLink({ to, label }: { to: string; label: string }) {
  const location = useLocation();
  const isActive = location.pathname === to || location.pathname.startsWith(`${to}/`);
  return (
    <Link className={isActive ? "nav-link active" : "nav-link"} to={to}>
      {label}
    </Link>
  );
}

export default function NavBar() {
  const { session, clearCurrentSession, saving, saveError } = useSession();
  const planHref = session ? `/plan?session=${encodeURIComponent(session.id)}` : "/plan";

  return (
    <header className="nav">
      <div className="container nav-inner">
        <div className="brand">
          <Link className="brand-link" to="/">
            Learn by AI
          </Link>
        </div>
        <nav className="nav-links" aria-label="Primary">
          <NavLink to="/" label="Repo" />
          <NavLink to={planHref} label="Plan" />
        </nav>

        <div className="nav-actions">
          {!session ? null : (
            <button className="button button-small" type="button" onClick={() => void clearCurrentSession()}>
              清除会话
            </button>
          )}
          {!saving ? null : <span className="badge">Saving…</span>}
          {!saveError ? null : <span className="badge danger">保存失败</span>}
        </div>
      </div>
    </header>
  );
}
