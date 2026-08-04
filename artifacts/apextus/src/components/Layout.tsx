import { useState } from "react";
import { Menu, Search, Sparkles } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import Sidebar from "./Sidebar";
import AuthOverlay from "./AuthOverlay";
import Dashboard from "@/pages/Dashboard";
import Quiz from "@/pages/Quiz";
import Notes from "@/pages/Notes";
import Stats from "@/pages/Stats";
import Review from "@/pages/Review";
import Account from "@/pages/Account";
import MockExam from "@/pages/MockExam";
import TusScore from "@/pages/TusScore";
import FullTUS from "@/pages/FullTUS";
import PotentialQuestions from "@/pages/PotentialQuestions";

export default function Layout() {
  const { user, loading, currentPage, username, setCurrentPage } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return <div className="loading-screen"><div className="loading-orb">A</div><div className="loading-title">ApexTUS</div></div>;
  }
  if (!user) return <AuthOverlay />;
  const pages: Record<string, React.ReactNode> = {
    dashboard: <Dashboard />, quiz: <Quiz />, potential: <PotentialQuestions />, mockexam: <MockExam />,
    tusscore: <TusScore />, fulltus: <FullTUS />, notes: <Notes />,
    stats: <Stats />, review: <Review />, account: <Account />,
  };

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="sidebar-backdrop" aria-label="Menüyü kapat" onClick={() => setSidebarOpen(false)} />}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="app-workspace">
        <header className="app-topbar">
          <button className="topbar-menu" aria-label="Menüyü aç" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button>
          <button className="topbar-search" onClick={() => setCurrentPage("notes")}>
            <Search size={17} /><span>Konu, ders veya not ara</span>
          </button>
          <button className="ai-coach-chip" onClick={() => setCurrentPage("review")}><Sparkles size={15} /> AI TUS Koçu</button>
          <button className="topbar-profile" onClick={() => setCurrentPage("account")}>
            <span>{(username?.[0] || "H").toUpperCase()}</span>
            <div><strong>{username || "Hekim adayı"}</strong><small>TUS öğrencisi</small></div>
          </button>
        </header>
        <main className="app-main">{pages[currentPage] ?? <Dashboard />}</main>
      </div>
    </div>
  );
}
