import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useApp } from "@/contexts/AppContext";
import { TREE } from "@/lib/data";

const NAV_ITEMS = [
  { id: "dashboard", icon: "⊞", label: "Ana Sayfa" },
  { id: "quiz", icon: "📋", label: "AI Quiz" },
  { id: "notes", icon: "📚", label: "Konu Notları" },
  { id: "review", icon: "⏰", label: "Tekrar Planı" },
  { id: "stats", icon: "📊", label: "İstatistikler" },
  { id: "pricing", icon: "💎", label: "Planlar" },
  { id: "account", icon: "⚙", label: "Hesap" },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { currentPage, setCurrentPage, user, username, isPro, state } = useApp();

  function goTo(page: string) {
    setCurrentPage(page);
    onClose();
  }

  const pct = state.total > 0 ? Math.round((state.correct / state.total) * 100) : 0;

  return (
    <div
      style={{
        width: 220, background: "var(--ink2)", borderRight: "1px solid var(--line)",
        height: "100vh", position: "fixed", left: 0, top: 0, zIndex: 110,
        display: "flex", flexDirection: "column", overflowY: "auto",
        transition: "transform .22s cubic-bezier(.4,0,.2,1)",
        transform: isOpen ? "translateX(0)" : undefined,
      }}
      className="sidebar-el"
    >
      {/* Logo */}
      <div
        style={{
          padding: "24px 18px 16px", borderBottom: "1px solid var(--line)",
          cursor: "pointer",
        }}
        onClick={() => goTo("dashboard")}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg,var(--ac),var(--ac2))",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1rem", fontWeight: 900, color: "#fff",
            }}
          >
            ⚕
          </div>
          <div>
            <div style={{ fontFamily: "Playfair Display, serif", fontWeight: 900, fontSize: ".96rem", color: "var(--cream)" }}>
              Apex
            </div>
            <div style={{ fontSize: ".58rem", color: "var(--t2)", fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase" }}>
              TUS Zirvesi
            </div>
          </div>
        </div>
      </div>

      {/* User info */}
      {user && (
        <div
          style={{
            padding: "13px 16px", borderBottom: "1px solid var(--line)",
            display: "flex", alignItems: "center", gap: 10,
          }}
        >
          <div
            style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "linear-gradient(135deg,var(--teal),var(--blue))",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: ".8rem", fontWeight: 800, color: "var(--ink)", flexShrink: 0,
            }}
          >
            {(username?.[0] ?? "U").toUpperCase()}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: ".78rem", fontWeight: 700, color: "var(--text)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {username || "Kullanıcı"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {isPro() ? (
                <span className="tag tag-gold" style={{ fontSize: ".55rem" }}>PRO</span>
              ) : (
                <span className="tag tag-gray" style={{ fontSize: ".55rem" }}>Ücretsiz</span>
              )}
              {state.streak > 0 && (
                <span style={{ fontSize: ".6rem", color: "var(--gold)", fontWeight: 800 }}>
                  🔥 {state.streak}g
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Nav items */}
      <nav style={{ padding: "10px 8px", flex: 1 }}>
        {NAV_ITEMS.map((item) => {
          const active = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => goTo(item.id)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px", borderRadius: 9, border: "none", cursor: "pointer",
                background: active ? "rgba(232,83,74,.12)" : "transparent",
                color: active ? "var(--ac)" : "var(--t2)",
                fontFamily: "Syne, sans-serif", fontSize: ".82rem", fontWeight: active ? 700 : 500,
                transition: "all .13s", marginBottom: 2,
              }}
              onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,.04)"; }}
              onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <span style={{ fontSize: ".92rem", width: 20, textAlign: "center", flexShrink: 0 }}>
                {item.icon}
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Quick stats */}
      <div
        style={{
          padding: "13px 14px", borderTop: "1px solid var(--line)",
          display: "flex", flexDirection: "column", gap: 7,
        }}
      >
        <div style={{ fontSize: ".65rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".07em" }}>
          Hızlı Özet
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".76rem" }}>
          <span style={{ color: "var(--t2)" }}>Toplam Soru</span>
          <span style={{ color: "var(--cream)", fontWeight: 700 }}>{state.total}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".76rem" }}>
          <span style={{ color: "var(--t2)" }}>Başarı</span>
          <span style={{ color: pct >= 70 ? "var(--green)" : pct >= 40 ? "var(--teal)" : "var(--ac)", fontWeight: 700 }}>
            {pct}%
          </span>
        </div>
        {(() => {
          const studiedCount = Object.values(state.sr || {}).filter(
            (v) => (v.studyCount || 0) > 0
          ).length;
          const totalCount = TREE.reduce((acc, b) => acc + b.topics.length, 0);
          const pctStudy = Math.round((studiedCount / totalCount) * 100);
          return (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".76rem" }}>
                <span style={{ color: "var(--t2)" }}>Konu Kapsamı</span>
                <span style={{ color: "var(--teal)", fontWeight: 700 }}>{studiedCount}/{totalCount}</span>
              </div>
              <div className="progress-bar" style={{ marginTop: 3 }}>
                <div className="progress-fill" style={{ width: `${pctStudy}%`, background: "var(--teal)" }} />
              </div>
            </>
          );
        })()}
      </div>

      {/* Signout */}
      <div style={{ padding: "0 8px 16px" }}>
        <button
          className="btn btn-ghost sm"
          style={{ width: "100%", justifyContent: "center", fontSize: ".76rem" }}
          onClick={() => signOut(auth)}
        >
          ↩ Çıkış Yap
        </button>
      </div>

      <style>{`
        @media (min-width: 900px) {
          .sidebar-el { transform: none !important; }
        }
        @media (max-width: 899px) {
          .sidebar-el { transform: translateX(-100%); }
          .sidebar-el[style*="translateX(0)"] { transform: translateX(0) !important; }
        }
      `}</style>
    </div>
  );
}
