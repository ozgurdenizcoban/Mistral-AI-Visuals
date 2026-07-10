import { useState } from "react";
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

export default function Layout() {
  const { user, loading, currentPage } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div className="loading-screen" style={{ height: "100vh" }}>
        <div className="loading-orb">A</div>
        <div className="loading-title">ApexTUS</div>
        <div style={{ color: "var(--t2)", fontSize: ".82rem", marginTop: 6 }}>
          Yükleniyor<span className="loading-dots" />
        </div>
      </div>
    );
  }

  if (!user) return <AuthOverlay />;

  const pages: Record<string, React.ReactNode> = {
    dashboard: <Dashboard />,
    quiz: <Quiz />,
    mockexam: <MockExam />,
    tusscore: <TusScore />,
    fulltus: <FullTUS />,
    notes: <Notes />,
    stats: <Stats />,
    review: <Review />,
    account: <Account />,
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {sidebarOpen && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,.55)",
            zIndex: 100, display: window.innerWidth < 900 ? "block" : "none",
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div
        style={{
          flex: 1, display: "flex", flexDirection: "column",
          minWidth: 0, paddingLeft: 248,
        }}
        className="main-content-area"
      >
        {/* Mobile topbar */}
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "11px 16px", background: "rgba(7,17,31,.92)", borderBottom: "1px solid var(--line)",
            position: "sticky", top: 0, zIndex: 90,
          }}
          className="mobile-topbar"
        >
          <button
            className="btn btn-ghost sm"
            onClick={() => setSidebarOpen((v) => !v)}
            style={{ padding: "6px 10px" }}
          >
            ☰
          </button>
          <span style={{ fontFamily: "Playfair Display, serif", fontWeight: 900, color: "var(--cream)" }}>
            ApexTUS
          </span>
          <div style={{ width: 38 }} />
        </div>

        <main style={{ flex: 1, padding: "24px 24px 40px", maxWidth: 1280, width: "100%", margin: "0 auto" }}>
          {pages[currentPage] ?? <Dashboard />}
        </main>
      </div>

      <style>{`
        @media (min-width: 900px) {
          .mobile-topbar { display: none !important; }
          .main-content-area { padding-left: 248px !important; }
        }
        @media (max-width: 899px) {
          .main-content-area { padding-left: 0 !important; }
        }
      `}</style>
    </div>
  );
}
