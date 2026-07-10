import { signOut } from "firebase/auth";
import { BarChart3, BookOpen, CalendarCheck, ClipboardCheck, FileQuestion, Home, LineChart, LogOut, Settings, Target } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useApp } from "@/contexts/AppContext";
import { TREE } from "@/lib/data";

const NAV_GROUPS = [
  {
    title: "Çalışma",
    items: [
      { id: "dashboard", icon: Home, label: "Ana ekran" },
      { id: "notes", icon: BookOpen, label: "Konu notları" },
      { id: "quiz", icon: FileQuestion, label: "TUS quiz" },
      { id: "review", icon: CalendarCheck, label: "Tekrar planı" },
    ],
  },
  {
    title: "Sınav",
    items: [
      { id: "fulltus", icon: ClipboardCheck, label: "Gerçek TUS" },
      { id: "mockexam", icon: Target, label: "Mini deneme" },
      { id: "tusscore", icon: LineChart, label: "Puan simülatörü" },
      { id: "stats", icon: BarChart3, label: "İstatistikler" },
    ],
  },
  {
    title: "Hesap",
    items: [{ id: "account", icon: Settings, label: "Ayarlar" }],
  },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { currentPage, setCurrentPage, user, username, state } = useApp();

  function goTo(page: string) {
    setCurrentPage(page);
    onClose();
  }

  const pct = state.total > 0 ? Math.round((state.correct / state.total) * 100) : 0;
  const studiedCount = Object.values(state.sr || {}).filter((v) => (v.studyCount || 0) > 0).length;
  const totalCount = TREE.reduce((acc, b) => acc + b.topics.length, 0);
  const pctStudy = totalCount ? Math.round((studiedCount / totalCount) * 100) : 0;

  return (
    <aside className="app-sidebar sidebar-el" style={{ transform: isOpen ? "translateX(0)" : undefined }}>
      <button className="brand-block" onClick={() => goTo("dashboard")}>
        <div className="brand-mark">A</div>
        <div>
          <strong>ApexTUS</strong>
          <span>Akıllı TUS kampüsü</span>
        </div>
      </button>

      {user && (
        <div className="sidebar-user">
          <div className="avatar">{(username?.[0] ?? "U").toUpperCase()}</div>
          <div>
            <strong>{username || "Hekim adayı"}</strong>
            <span>{state.streak > 0 ? `${state.streak} günlük seri` : "Çalışmaya hazır"}</span>
          </div>
        </div>
      )}

      <nav className="sidebar-nav">
        {NAV_GROUPS.map((group) => (
          <div className="nav-group" key={group.title}>
            <div className="nav-title">{group.title}</div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = currentPage === item.id;
              return (
                <button key={item.id} className={`nav-item${active ? " active" : ""}`} onClick={() => goTo(item.id)}>
                  <Icon size={17} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-summary">
        <div className="summary-line"><span>Doğruluk</span><strong>{pct}%</strong></div>
        <div className="summary-line"><span>Kapsam</span><strong>{studiedCount}/{totalCount}</strong></div>
        <div className="mini-bar"><i style={{ width: `${pctStudy}%` }} /></div>
      </div>

      <button className="signout-btn" onClick={() => signOut(auth)}>
        <LogOut size={16} /> Çıkış yap
      </button>

      <style>{`
        @media (min-width: 900px) {
          .sidebar-el { transform: none !important; }
        }
        @media (max-width: 899px) {
          .sidebar-el { transform: translateX(-100%); }
          .sidebar-el[style*="translateX(0)"] { transform: translateX(0) !important; }
        }
      `}</style>
    </aside>
  );
}
