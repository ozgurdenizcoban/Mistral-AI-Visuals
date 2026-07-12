import { signOut } from "firebase/auth";
import { Activity, BarChart3, BookOpen, Brain, CalendarDays, ChevronRight, ClipboardCheck, Home, LogOut, Settings, Target } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useApp } from "@/contexts/AppContext";

const NAV = [
  { id: "dashboard", icon: Home, label: "Ana sayfa" },
  { id: "notes", icon: BookOpen, label: "Konu anlatımları" },
  { id: "quiz", icon: Brain, label: "Soru çöz" },
  { id: "review", icon: CalendarDays, label: "Kişisel tekrar" },
  { id: "fulltus", icon: ClipboardCheck, label: "TUS denemesi" },
  { id: "mockexam", icon: Target, label: "Mini denemeler" },
  { id: "stats", icon: BarChart3, label: "İlerlemem" },
];

export default function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { currentPage, setCurrentPage, state } = useApp();
  const go = (id: string) => { setCurrentPage(id); onClose(); };
  const pct = state.total ? Math.round((state.correct / state.total) * 100) : 0;

  return (
    <aside className={`app-sidebar ${isOpen ? "open" : ""}`}>
      <button className="brand-block" onClick={() => go("dashboard")}>
        <span className="brand-mark" aria-hidden="true"><Activity size={22} strokeWidth={2.4} /></span>
        <span className="brand-wordmark"><strong><span>Apex</span><b>TUS</b></strong><small>TUS Hazırlık Platformu</small></span>
      </button>
      <nav className="sidebar-nav">
        <div className="nav-title">ÖĞRENME</div>
        {NAV.slice(0, 4).map(({ id, icon: Icon, label }) => (
          <button key={id} className={`nav-item ${currentPage === id ? "active" : ""}`} onClick={() => go(id)}><Icon size={19} /><span>{label}</span>{currentPage === id && <ChevronRight size={15} />}</button>
        ))}
        <div className="nav-title nav-title-spaced">SINAV & ANALİZ</div>
        {NAV.slice(4).map(({ id, icon: Icon, label }) => (
          <button key={id} className={`nav-item ${currentPage === id ? "active" : ""}`} onClick={() => go(id)}><Icon size={19} /><span>{label}</span>{currentPage === id && <ChevronRight size={15} />}</button>
        ))}
      </nav>
      <div className="sidebar-progress">
        <div><span>Haftalık hedef</span><strong>{Math.min(state.total, 500)} / 500 soru</strong></div>
        <div className="mini-bar"><i style={{ width: `${Math.min(100, state.total / 5)}%` }} /></div>
        <small>Genel doğruluk: %{pct}</small>
      </div>
      <div className="sidebar-footer">
        <button onClick={() => go("account")}><Settings size={17} /> Ayarlar</button>
        <button onClick={() => signOut(auth)}><LogOut size={17} /> Çıkış yap</button>
      </div>
    </aside>
  );
}
