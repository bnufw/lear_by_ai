import { Navigate, Route, Routes } from "react-router-dom";
import NavBar from "./components/NavBar";
import ChapterPage from "./pages/ChapterPage";
import PlanPage from "./pages/PlanPage";
import RepoInputPage from "./pages/RepoInputPage";

export default function App() {
  return (
    <div className="app-shell">
      <NavBar />
      <main className="container">
        <Routes>
          <Route path="/" element={<RepoInputPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/chapter/:chapterId" element={<ChapterPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

