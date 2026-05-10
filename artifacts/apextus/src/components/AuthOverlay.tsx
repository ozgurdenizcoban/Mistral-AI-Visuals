import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { fbSaveProfile } from "@/lib/firestore";
import { toast } from "sonner";

export default function AuthOverlay() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPass, setRegPass] = useState("");
  const [regPass2, setRegPass2] = useState("");
  const [resetEmail, setResetEmail] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPass);
    } catch (ex: unknown) {
      const msg = (ex as { message?: string }).message || "";
      if (msg.includes("user-not-found") || msg.includes("wrong-password") || msg.includes("invalid-credential")) {
        setErr("E-posta veya şifre hatalı.");
      } else if (msg.includes("too-many-requests")) {
        setErr("Çok fazla deneme. Lütfen bekleyin.");
      } else {
        setErr("Giriş başarısız: " + msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!regName.trim()) { setErr("İsim zorunludur."); return; }
    if (regPass !== regPass2) { setErr("Şifreler eşleşmiyor."); return; }
    if (regPass.length < 6) { setErr("Şifre en az 6 karakter olmalıdır."); return; }
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, regEmail.trim(), regPass);
      const uname = regName.trim().toLowerCase().replace(/\s+/g, ".");
      await fbSaveProfile(cred.user.uid, {
        name: regName.trim(),
        username: uname,
        email: regEmail.trim(),
        createdAt: new Date().toISOString(),
      });
    } catch (ex: unknown) {
      const msg = (ex as { message?: string }).message || "";
      if (msg.includes("email-already-in-use")) {
        setErr("Bu e-posta zaten kullanılıyor.");
      } else if (msg.includes("invalid-email")) {
        setErr("Geçersiz e-posta adresi.");
      } else {
        setErr("Kayıt başarısız: " + msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetEmail.trim()) { setErr("E-posta giriniz."); return; }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail.trim());
      setResetSent(true);
      toast.success("Şifre sıfırlama e-postası gönderildi.");
    } catch (_) {
      setErr("Şifre sıfırlama başarısız.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-overlay">
      <div style={{ maxWidth: 440, width: "100%" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              width: 62, height: 62, borderRadius: 16,
              background: "linear-gradient(135deg,var(--ac),var(--ac2))",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.8rem", margin: "0 auto 12px",
              boxShadow: "0 0 40px rgba(232,83,74,.3)",
            }}
          >
            ⚕
          </div>
          <div style={{ fontFamily: "Playfair Display, serif", fontSize: "1.9rem", fontWeight: 900, color: "var(--cream)" }}>
            Apex
          </div>
          <div style={{ fontSize: ".72rem", color: "var(--t2)", fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", marginTop: 3 }}>
            TUS Zirvesi
          </div>
          <div style={{ fontSize: ".78rem", color: "var(--t2)", marginTop: 8, lineHeight: 1.6 }}>
            Türkiye'nin klinik TUS hazırlık platformu
          </div>
        </div>

        <div className="auth-box">
          {showReset ? (
            <>
              <div style={{ fontFamily: "Playfair Display, serif", fontSize: "1.1rem", fontWeight: 700, color: "var(--cream)", marginBottom: 16 }}>
                Şifre Sıfırlama
              </div>
              {resetSent ? (
                <div style={{ color: "var(--green)", fontSize: ".85rem", marginBottom: 16 }}>
                  ✓ Şifre sıfırlama bağlantısı e-postanıza gönderildi.
                </div>
              ) : (
                <form onSubmit={handleReset}>
                  <input className="auth-input" type="email" placeholder="E-posta" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} required />
                  {err && <div style={{ color: "var(--ac)", fontSize: ".78rem", marginBottom: 8 }}>{err}</div>}
                  <button className="btn btn-primary full" type="submit" disabled={loading} style={{ marginTop: 4 }}>
                    {loading ? <><span className="spin" />Gönderiliyor...</> : "Şifre Sıfırla"}
                  </button>
                </form>
              )}
              <button className="btn btn-ghost sm" onClick={() => { setShowReset(false); setResetSent(false); setErr(""); }} style={{ marginTop: 12, width: "100%", justifyContent: "center" }}>
                ← Geri Dön
              </button>
            </>
          ) : (
            <>
              <div className="auth-tabs">
                <div className={`auth-tab${tab === "login" ? " active" : ""}`} onClick={() => { setTab("login"); setErr(""); }}>
                  Giriş Yap
                </div>
                <div className={`auth-tab${tab === "register" ? " active" : ""}`} onClick={() => { setTab("register"); setErr(""); }}>
                  Üye Ol
                </div>
              </div>

              {tab === "login" ? (
                <form onSubmit={handleLogin}>
                  <input className="auth-input" type="email" placeholder="E-posta" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} autoComplete="email" required />
                  <input className="auth-input" type="password" placeholder="Şifre" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} autoComplete="current-password" required />
                  {err && <div style={{ color: "var(--ac)", fontSize: ".78rem", marginBottom: 8 }}>{err}</div>}
                  <button className="btn btn-primary full lg" type="submit" disabled={loading} style={{ marginTop: 4 }}>
                    {loading ? <><span className="spin" />Giriş Yapılıyor...</> : "Giriş Yap"}
                  </button>
                  <button type="button" onClick={() => { setShowReset(true); setErr(""); }}
                    style={{ background: "none", border: "none", color: "var(--t2)", fontSize: ".76rem", cursor: "pointer", marginTop: 12, width: "100%" }}>
                    Şifremi unuttum
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegister}>
                  <input className="auth-input" type="text" placeholder="Ad Soyad" value={regName} onChange={(e) => setRegName(e.target.value)} required />
                  <input className="auth-input" type="email" placeholder="E-posta" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} autoComplete="email" required />
                  <input className="auth-input" type="password" placeholder="Şifre (min. 6 karakter)" value={regPass} onChange={(e) => setRegPass(e.target.value)} autoComplete="new-password" required />
                  <input className="auth-input" type="password" placeholder="Şifre Tekrar" value={regPass2} onChange={(e) => setRegPass2(e.target.value)} autoComplete="new-password" required />
                  {err && <div style={{ color: "var(--ac)", fontSize: ".78rem", marginBottom: 8 }}>{err}</div>}
                  <button className="btn btn-primary full lg" type="submit" disabled={loading} style={{ marginTop: 4 }}>
                    {loading ? <><span className="spin" />Kayıt Yapılıyor...</> : "Üye Ol"}
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: ".72rem", color: "var(--t3)" }}>
          Destek:{" "}
          <a href="https://wa.me/905336413803" target="_blank" rel="noreferrer" style={{ color: "var(--teal)" }}>
            WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
