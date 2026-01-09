import { Navigate, Route, Routes } from "react-router-dom";
import { SessionProvider } from "./app/session";
import NavBar from "./components/NavBar";
import ChapterPage from "./pages/ChapterPage";
import PlanPage from "./pages/PlanPage";
import QuizPage from "./pages/QuizPage";
import RepoInputPage from "./pages/RepoInputPage";

export default function App() {
  return (
    <SessionProvider>
      <div className="app-shell">
        <NavBar />
        <main className="container">
          <Routes>
            <Route path="/" element={<RepoInputPage />} />
            <Route path="/plan" element={<PlanPage />} />
            <Route path="/chapter/:chapterId" element={<ChapterPage />} />
            <Route path="/quiz" element={<QuizPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </SessionProvider>
  );
}
