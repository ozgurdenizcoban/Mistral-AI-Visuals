import { useApp } from "@/contexts/AppContext";

const WEEKLY_URL = "https://www.shopier.com/apexai/45011975";
const MONTHLY_URL = "https://www.shopier.com/apexai/45011922";
const WA_URL = "https://wa.me/905336413803";

const FREE_FEATURES = [
  { text: "5 soru / gün quiz hakkı", yes: true },
  { text: "1 konu notu", yes: true },
  { text: "1 AI açıklama", yes: true },
  { text: "İstatistikler", yes: true },
  { text: "Sınırsız quiz", yes: false },
  { text: "Tüm konu notları", yes: false },
  { text: "Sınırsız AI açıklama", yes: false },
  { text: "AI çalışma planı", yes: false },
  { text: "Görüntülü notlar (AI görseller)", yes: false },
];

const PRO_FEATURES = [
  { text: "Sınırsız quiz sorusu", yes: true },
  { text: "Tüm konu notları (110+ konu)", yes: true },
  { text: "Sınırsız AI açıklama", yes: true },
  { text: "AI çalışma planı (haftalık)", yes: true },
  { text: "AI görsel notları (Flux)", yes: true },
  { text: "Spaced repetition sistemi", yes: true },
  { text: "Hata analizi & zayıf konu tespiti", yes: true },
  { text: "Öncelikli destek (WhatsApp)", yes: true },
];

export default function Pricing() {
  const { isPro, state } = useApp();
  const proActive = isPro();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 760 }}>
      <div style={{ textAlign: "center", padding: "16px 0 4px" }}>
        <div style={{ fontFamily: "Playfair Display, serif", fontSize: "2rem", fontWeight: 900, color: "var(--cream)" }}>
          TUS'ta Zirveye Ulaş
        </div>
        <div style={{ color: "var(--t2)", fontSize: ".86rem", marginTop: 8 }}>
          Klinik zeka, kişisel tekrar planı ve sınırsız sorularla TUS'a hazırlan
        </div>
      </div>

      {proActive && (
        <div style={{ background: "var(--grd)", border: "1px solid rgba(52,211,153,.2)", borderRadius: 12, padding: "14px 18px", textAlign: "center" }}>
          <div style={{ color: "var(--green)", fontWeight: 700 }}>✓ Pro plana aktifsiniz</div>
          {state.planExpiry && (
            <div style={{ color: "var(--t2)", fontSize: ".76rem", marginTop: 4 }}>
              Bitiş: {state.planExpiry}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }} className="pricing-grid">
        {/* Free */}
        <div className="plan-card">
          <div style={{ fontSize: ".68rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--t3)", marginBottom: 8 }}>
            Ücretsiz
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 6 }}>
            <span className="plan-price" style={{ fontSize: "2.2rem" }}>₺0</span>
            <span className="plan-per">/ay</span>
          </div>
          <div style={{ fontSize: ".76rem", color: "var(--t2)", marginBottom: 16 }}>Başlamak için mükemmel</div>
          <div style={{ marginBottom: 18 }}>
            {FREE_FEATURES.map((f, i) => (
              <div key={i} className={`plan-feature${f.yes ? " yes" : " no"}`}>
                {f.text}
              </div>
            ))}
          </div>
          <div className="btn btn-ghost full" style={{ cursor: "default", justifyContent: "center" }}>Mevcut Plan</div>
        </div>

        {/* Weekly */}
        <div className="plan-card popular">
          <div className="plan-badge">En Popüler</div>
          <div style={{ fontSize: ".68rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ac)", marginBottom: 8 }}>
            Haftalık Pro
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 6 }}>
            <span className="plan-price">₺249</span>
            <span className="plan-per">/hafta</span>
          </div>
          <div style={{ fontSize: ".76rem", color: "var(--t2)", marginBottom: 16 }}>Yoğun çalışma dönemi için</div>
          <div style={{ marginBottom: 18 }}>
            {PRO_FEATURES.map((f, i) => (
              <div key={i} className={`plan-feature${f.yes ? " yes" : " no"}`}>
                {f.text}
              </div>
            ))}
          </div>
          <a
            href={WEEKLY_URL}
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary full"
            style={{ textDecoration: "none", justifyContent: "center" }}
          >
            Haftalık Al →
          </a>
        </div>

        {/* Monthly */}
        <div className="plan-card">
          <div style={{ fontSize: ".68rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--teal)", marginBottom: 8 }}>
            Aylık Pro
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 6 }}>
            <span className="plan-price" style={{ color: "var(--teal)" }}>₺699</span>
            <span className="plan-per">/ay</span>
          </div>
          <div style={{ fontSize: ".76rem", color: "var(--t2)", marginBottom: 6 }}>En değerli seçenek</div>
          <div style={{ fontSize: ".72rem", color: "var(--green)", fontWeight: 700, marginBottom: 12 }}>
            ≈ ₺175/hafta — %30 Tasarruf!
          </div>
          <div style={{ marginBottom: 18 }}>
            {PRO_FEATURES.map((f, i) => (
              <div key={i} className={`plan-feature${f.yes ? " yes" : " no"}`}>
                {f.text}
              </div>
            ))}
          </div>
          <a
            href={MONTHLY_URL}
            target="_blank"
            rel="noreferrer"
            className="btn btn-teal full"
            style={{ textDecoration: "none", justifyContent: "center" }}
          >
            Aylık Al →
          </a>
        </div>
      </div>

      {/* Payment info */}
      <div style={{ background: "var(--ink2)", border: "1px solid var(--line)", borderRadius: 12, padding: "18px 22px" }}>
        <div style={{ fontWeight: 700, color: "var(--cream)", marginBottom: 8, fontSize: ".9rem" }}>
          💳 Ödeme Sonrası Aktivasyon
        </div>
        <div style={{ color: "var(--t2)", fontSize: ".8rem", lineHeight: 1.8 }}>
          Shopier üzerinden güvenli ödeme yaptıktan sonra{" "}
          <a href={WA_URL} target="_blank" rel="noreferrer" style={{ color: "var(--teal)", fontWeight: 700 }}>
            WhatsApp
          </a>
          {" "}'tan bize ulaşın. Hesabınız 1 saat içinde aktive edilir.
        </div>
        <div style={{ marginTop: 12 }}>
          <a
            href={WA_URL}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              background: "rgba(37,211,102,.1)", border: "1px solid rgba(37,211,102,.25)",
              borderRadius: 9, padding: "8px 15px", textDecoration: "none",
              color: "#25D366", fontSize: ".8rem", fontWeight: 700,
            }}
          >
            📱 WhatsApp ile İletişim
          </a>
        </div>
      </div>

      {/* FAQ */}
      <div className="card">
        <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 14 }}>
          Sık Sorulan Sorular
        </div>
        {[
          { q: "Pro aktif olunca ne kadar sürer?", a: "Ödeme onayı sonrası WhatsApp mesajınızı aldıktan sonra 1 saat içinde aktive edilir." },
          { q: "AI soruları her seferinde farklı mı?", a: "Evet! Mistral AI her quiz'de yeni, benzersiz TUS tarzı klinik vakalar üretir." },
          { q: "Konu notlarına görsel de ekleniyor mu?", a: "Evet! Pro kullanıcılara FLUX AI ile üretilmiş tıbbi eğitim görselleri eklenir." },
          { q: "Verilerim kaybolur mu?", a: "Hayır. Tüm ilerleme, notlar ve quiz verileri Firebase'de güvenle saklanır." },
          { q: "İptal nasıl yapılır?", a: "İstediğiniz zaman WhatsApp üzerinden bize yazarak iptal edebilirsiniz." },
        ].map((f, i) => (
          <div key={i} style={{ padding: "11px 0", borderBottom: "1px solid var(--line)" }}>
            <div style={{ fontWeight: 700, fontSize: ".83rem", color: "var(--text)", marginBottom: 4 }}>{f.q}</div>
            <div style={{ fontSize: ".78rem", color: "var(--t2)", lineHeight: 1.6 }}>{f.a}</div>
          </div>
        ))}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .pricing-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
