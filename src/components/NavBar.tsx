import { Link, useLocation } from "react-router-dom";

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
          <NavLink to="/plan" label="Plan" />
        </nav>
      </div>
    </header>
  );
}

