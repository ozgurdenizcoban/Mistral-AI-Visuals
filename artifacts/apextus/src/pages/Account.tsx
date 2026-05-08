import { useState } from "react";
import { signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useApp } from "@/contexts/AppContext";
import { fbSaveUserData } from "@/lib/firestore";
import { toast } from "sonner";
import { ADMIN_EMAILS } from "@/lib/data";

export default function Account() {
  const { user, username, state, saveState, isPro } = useApp();
  const [tab, setTab] = useState<"profile" | "security" | "data" | "admin">("profile");
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [passLoading, setPassLoading] = useState(false);

  // Admin: set plan
  const [adminUid, setAdminUid] = useState("");
  const [adminPlan, setAdminPlan] = useState<"free" | "weekly" | "monthly">("monthly");
  const [adminExpiry, setAdminExpiry] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);

  const isAdmin = ADMIN_EMAILS.includes(user?.email || "");

  async function handlePassChange(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.email || !oldPass || !newPass) return;
    if (newPass.length < 6) { toast.error("Yeni şifre en az 6 karakter olmalı"); return; }
    setPassLoading(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, oldPass);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPass);
      toast.success("Şifre başarıyla güncellendi");
      setOldPass(""); setNewPass("");
    } catch (e) {
      toast.error("Şifre güncellenemedi: " + (e as Error).message);
    } finally {
      setPassLoading(false);
    }
  }

  async function handleSetPlan() {
    if (!adminUid.trim()) { toast.error("UID giriniz"); return; }
    setAdminLoading(true);
    try {
      const { getDoc, setDoc, doc } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase");
      const snap = await getDoc(doc(db, "users", adminUid.trim()));
      const existing = snap.exists() ? snap.data() : {};
      await setDoc(doc(db, "users", adminUid.trim()), {
        ...existing,
        plan: adminPlan,
        planExpiry: adminExpiry,
      });
      toast.success(`Plan güncellendi: ${adminUid} → ${adminPlan}`);
    } catch (e) {
      toast.error("Plan güncellenemedi: " + (e as Error).message);
    } finally {
      setAdminLoading(false);
    }
  }

  function handleClearStats() {
    if (!confirm("Tüm quiz istatistiklerini sıfırlamak istediğinizden emin misiniz?")) return;
    const ns = {
      ...state,
      total: 0, correct: 0, sessions: [], byCat: {},
      mistakes: {}, streak: 0, lastDate: "",
    };
    saveState(ns);
    toast.success("İstatistikler sıfırlandı");
  }

  function handleClearSR() {
    if (!confirm("Tekrar planı verilerini sıfırlamak istediğinizden emin misiniz?")) return;
    const ns = { ...state, sr: {}, noteCount: 0 };
    saveState(ns);
    toast.success("Tekrar planı sıfırlandı");
  }

  const tabs = [
    { id: "profile", label: "Profil" },
    { id: "security", label: "Güvenlik" },
    { id: "data", label: "Veriler" },
    ...(isAdmin ? [{ id: "admin", label: "⚙ Admin" }] : []),
  ];

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ fontFamily: "Playfair Display, serif", fontSize: "1.6rem", fontWeight: 900, color: "var(--cream)", marginBottom: 20 }}>
        Hesap Ayarları
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--line)", paddingBottom: 0 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            style={{
              padding: "8px 16px", borderRadius: "9px 9px 0 0", border: "none", cursor: "pointer",
              background: tab === t.id ? "var(--ink2)" : "transparent",
              color: tab === t.id ? "var(--ac)" : "var(--t2)",
              fontFamily: "Syne, sans-serif", fontSize: ".8rem", fontWeight: 700,
              borderBottom: tab === t.id ? "2px solid var(--ac)" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <div>
          <div className="acc-section">
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: "linear-gradient(135deg,var(--teal),var(--blue))",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1.4rem", fontWeight: 800, color: "var(--ink)",
              }}>
                {(username?.[0] ?? "U").toUpperCase()}
              </div>
              <div>
                <div style={{ fontFamily: "Playfair Display, serif", fontSize: "1.2rem", fontWeight: 700, color: "var(--cream)" }}>
                  {username || "Kullanıcı"}
                </div>
                <div style={{ fontSize: ".75rem", color: "var(--t2)", marginTop: 2 }}>{user?.email}</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <div className="acc-label">E-posta</div>
                <div className="acc-value">{user?.email || "—"}</div>
              </div>
              <div>
                <div className="acc-label">Plan</div>
                <div className="acc-value" style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  {isPro() ? (
                    <span className="tag tag-gold">PRO</span>
                  ) : (
                    <span className="tag tag-gray">Ücretsiz</span>
                  )}
                  {state.planExpiry && <span style={{ fontSize: ".72rem", color: "var(--t2)" }}>→ {state.planExpiry}</span>}
                </div>
              </div>
              <div>
                <div className="acc-label">Toplam Soru</div>
                <div className="acc-value">{state.total || 0}</div>
              </div>
              <div>
                <div className="acc-label">Başarı Oranı</div>
                <div className="acc-value">
                  {state.total > 0 ? `${Math.round((state.correct / state.total) * 100)}%` : "—"}
                </div>
              </div>
              <div>
                <div className="acc-label">Gün Serisi</div>
                <div className="acc-value">{state.streak || 0} 🔥</div>
              </div>
              <div>
                <div className="acc-label">Çalışılan Konu</div>
                <div className="acc-value">
                  {Object.values(state.sr || {}).filter((v) => (v.studyCount || 0) > 0).length}
                </div>
              </div>
            </div>
          </div>

          <button className="btn btn-ghost full" style={{ justifyContent: "center" }} onClick={() => signOut(auth)}>
            ↩ Çıkış Yap
          </button>
        </div>
      )}

      {tab === "security" && (
        <div className="acc-section">
          <div style={{ fontSize: ".9rem", fontWeight: 700, color: "var(--cream)", marginBottom: 16 }}>Şifre Güncelle</div>
          <form onSubmit={handlePassChange}>
            <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", marginBottom: 6, textTransform: "uppercase" }}>Mevcut Şifre</div>
            <input
              className="auth-input" type="password" value={oldPass}
              onChange={(e) => setOldPass(e.target.value)} placeholder="Mevcut şifreniz" required
            />
            <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", marginBottom: 6, textTransform: "uppercase", marginTop: 10 }}>Yeni Şifre</div>
            <input
              className="auth-input" type="password" value={newPass}
              onChange={(e) => setNewPass(e.target.value)} placeholder="Min. 6 karakter" required
            />
            <button className="btn btn-primary" type="submit" disabled={passLoading} style={{ marginTop: 12 }}>
              {passLoading ? <><span className="spin" />Güncelleniyor...</> : "Şifreyi Güncelle"}
            </button>
          </form>
        </div>
      )}

      {tab === "data" && (
        <div>
          <div className="acc-section">
            <div style={{ fontSize: ".9rem", fontWeight: 700, color: "var(--cream)", marginBottom: 8 }}>İstatistikleri Sıfırla</div>
            <div style={{ fontSize: ".78rem", color: "var(--t2)", marginBottom: 14 }}>
              Tüm quiz sonuçları, oturumlar, seri ve kategori verileri sıfırlanır. Geri alınamaz.
            </div>
            <button className="btn danger-btn" onClick={handleClearStats}>
              🗑 İstatistikleri Sıfırla
            </button>
          </div>

          <div className="acc-section">
            <div style={{ fontSize: ".9rem", fontWeight: 700, color: "var(--cream)", marginBottom: 8 }}>Tekrar Planını Sıfırla</div>
            <div style={{ fontSize: ".78rem", color: "var(--t2)", marginBottom: 14 }}>
              Tüm konu okuma sayıları ve tekrar tarihleri sıfırlanır.
            </div>
            <button className="btn danger-btn" onClick={handleClearSR}>
              🗑 Tekrar Planını Sıfırla
            </button>
          </div>
        </div>
      )}

      {tab === "admin" && isAdmin && (
        <div className="acc-section">
          <div style={{ fontSize: ".9rem", fontWeight: 700, color: "var(--cream)", marginBottom: 16 }}>
            ⚙ Admin — Plan Yönetimi
          </div>
          <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", marginBottom: 6, textTransform: "uppercase" }}>Kullanıcı UID</div>
          <input
            className="auth-input" value={adminUid}
            onChange={(e) => setAdminUid(e.target.value)} placeholder="Firebase UID"
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <div>
              <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", marginBottom: 6, textTransform: "uppercase" }}>Plan</div>
              <select
                value={adminPlan}
                onChange={(e) => setAdminPlan(e.target.value as typeof adminPlan)}
                style={{
                  width: "100%", padding: "9px 12px", background: "var(--ink3)",
                  border: "1px solid var(--line2)", borderRadius: 9, color: "var(--text)",
                  fontFamily: "Syne, sans-serif", fontSize: ".84rem",
                }}
              >
                <option value="free">free</option>
                <option value="weekly">weekly</option>
                <option value="monthly">monthly</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", marginBottom: 6, textTransform: "uppercase" }}>Bitiş Tarihi</div>
              <input
                type="date" value={adminExpiry}
                onChange={(e) => setAdminExpiry(e.target.value)}
                style={{
                  width: "100%", padding: "9px 12px", background: "var(--ink3)",
                  border: "1px solid var(--line2)", borderRadius: 9, color: "var(--text)",
                  fontFamily: "Syne, sans-serif", fontSize: ".84rem",
                }}
              />
            </div>
          </div>
          <button
            className="btn btn-primary"
            style={{ marginTop: 14 }}
            onClick={handleSetPlan}
            disabled={adminLoading}
          >
            {adminLoading ? <><span className="spin" />Kaydediliyor...</> : "✓ Planı Kaydet"}
          </button>

          <div style={{ marginTop: 20, padding: "14px", background: "var(--ink3)", borderRadius: 9 }}>
            <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", marginBottom: 8, textTransform: "uppercase" }}>Kendi Hesabın</div>
            <div style={{ fontSize: ".78rem", color: "var(--t2)" }}>UID: <code style={{ color: "var(--teal)", fontSize: ".72rem" }}>{user?.uid}</code></div>
            <div style={{ fontSize: ".78rem", color: "var(--t2)", marginTop: 4 }}>Plan: {state.plan}</div>
          </div>
        </div>
      )}
    </div>
  );
}
