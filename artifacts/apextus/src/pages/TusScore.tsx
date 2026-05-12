import { useState, useMemo } from "react";
import { useApp } from "@/contexts/AppContext";
import { TREE } from "@/lib/data";

/* ----------------------------------------------------------------
   TUS question distribution (Klinik Bilimler = 100 sorular)
   Kaynak: Ortalama son 5 yıl TUS dağılımı
---------------------------------------------------------------- */
const DAHILIYE_DIST: Record<string, number> = {
  "Kardiyoloji": 9,
  "Göğüs Hastalıkları": 7,
  "Hematoloji": 6,
  "Nefroloji": 6,
  "Endokrinoloji": 8,
  "Gastroenteroloji": 6,
  "Hepatoloji": 5,
  "Romatoloji": 5,
  "Enfeksiyon Hastalıkları": 7,
  "Onkoloji": 4,
  "Geriatri": 3,
};
const DAHILIYE_TOTAL = Object.values(DAHILIYE_DIST).reduce((a, b) => a + b, 0); // 66

// Other Klinik sections (34 soru)
const OTHER_KLINIK = [
  { label: "Cerrahi", q: 12 },
  { label: "Kadın Doğum", q: 8 },
  { label: "Pediatri", q: 8 },
  { label: "Nöroloji", q: 3 },
  { label: "Psikiyatri / Diğer", q: 3 },
];

// Temel Bilimler (100 soru)
const TEMEL_SECTIONS = [
  { label: "Anatomi", q: 14 },
  { label: "Histoloji & Embriyoloji", q: 10 },
  { label: "Fizyoloji", q: 14 },
  { label: "Biyokimya", q: 14 },
  { label: "Mikrobiyoloji", q: 14 },
  { label: "Farmakoloji", q: 14 },
  { label: "Patoloji", q: 20 },
];

function netScore(correct: number, wrong: number) {
  return correct - wrong / 4;
}

function scoreColor(pct: number) {
  if (pct >= 75) return "var(--green)";
  if (pct >= 60) return "var(--teal)";
  if (pct >= 45) return "var(--gold)";
  return "var(--ac)";
}

function interpretation(totalNet: number, maxNet: number) {
  const pct = (totalNet / maxNet) * 100;
  if (pct >= 75) return { text: "Mükemmel — Bütün uzmanlık dalları açık", color: "var(--green)", icon: "🏆" };
  if (pct >= 65) return { text: "Çok İyi — Popüler dallar için rekabetçi", color: "var(--teal)", icon: "🎯" };
  if (pct >= 55) return { text: "İyi — Orta popülerterdeki dallara girebilir", color: "var(--blue)", icon: "👍" };
  if (pct >= 45) return { text: "Orta — Daha fazla çalışma önerilir", color: "var(--gold)", icon: "📚" };
  return { text: "Gelişime İhtiyaç Var — Yoğun tekrar şart", color: "var(--ac)", icon: "💪" };
}

export default function TusScore() {
  const { state } = useApp();

  // Dahiliye overrides (0–100 %)
  const [dahiliyeOverride, setDahiliyeOverride] = useState<Record<string, number>>({});
  // Other klinik (0–100 %)
  const [otherKlinik, setOtherKlinik] = useState<Record<string, number>>(
    Object.fromEntries(OTHER_KLINIK.map((s) => [s.label, 60]))
  );
  // Temel bilimler (0–100 %)
  const [temel, setTemel] = useState<Record<string, number>>(
    Object.fromEntries(TEMEL_SECTIONS.map((s) => [s.label, 60]))
  );

  /* ---- derive dahiliye pct from byCat stats ---- */
  const dahiliyeStats = useMemo(() => {
    const result: Record<string, { pct: number; hasData: boolean }> = {};
    for (const cat of Object.keys(DAHILIYE_DIST)) {
      const bc = state.byCat?.[cat];
      if (bc && bc.a > 0) {
        result[cat] = { pct: Math.round((bc.c / bc.a) * 100), hasData: true };
      } else {
        result[cat] = { pct: dahiliyeOverride[cat] ?? 60, hasData: false };
      }
    }
    return result;
  }, [state.byCat, dahiliyeOverride]);

  function getEffectivePct(cat: string) {
    const stat = dahiliyeStats[cat];
    if (stat.hasData && dahiliyeOverride[cat] === undefined) return stat.pct;
    return dahiliyeOverride[cat] ?? stat.pct;
  }

  /* ---- calculate nets ---- */
  const dahiliyeNet = useMemo(() => {
    let net = 0;
    for (const [cat, q] of Object.entries(DAHILIYE_DIST)) {
      const pct = getEffectivePct(cat) / 100;
      const correct = q * pct;
      const wrong = q * (1 - pct);
      net += netScore(correct, wrong);
    }
    return Math.round(net * 10) / 10;
  }, [dahiliyeOverride, dahiliyeStats]);

  const otherKlinikNet = useMemo(() => {
    let net = 0;
    for (const s of OTHER_KLINIK) {
      const pct = (otherKlinik[s.label] ?? 60) / 100;
      net += netScore(s.q * pct, s.q * (1 - pct));
    }
    return Math.round(net * 10) / 10;
  }, [otherKlinik]);

  const klinikNet = dahiliyeNet + otherKlinikNet;

  const temelNet = useMemo(() => {
    let net = 0;
    for (const s of TEMEL_SECTIONS) {
      const pct = (temel[s.label] ?? 60) / 100;
      net += netScore(s.q * pct, s.q * (1 - pct));
    }
    return Math.round(net * 10) / 10;
  }, [temel]);

  const totalNet = Math.round((klinikNet + temelNet) * 10) / 10;
  const maxNet = 200;
  const totalPct = Math.max(0, Math.round((totalNet / maxNet) * 100));
  const interp = interpretation(Math.max(0, totalNet), maxNet);

  const col = scoreColor(totalPct);

  /* ---- Slider component ---- */
  function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: ".75rem", color: "var(--t2)", minWidth: 130, flexShrink: 0 }}>{label}</span>
        <input
          type="range" min={0} max={100} step={5} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: "var(--teal)", cursor: "pointer" }}
        />
        <span style={{ fontSize: ".78rem", fontWeight: 800, color: scoreColor(value), minWidth: 36, textAlign: "right" }}>%{value}</span>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ fontFamily: "Playfair Display, serif", fontSize: "1.6rem", fontWeight: 900, color: "var(--cream)", marginBottom: 6 }}>
        TUS Puan Simülatörü
      </div>
      <div style={{ color: "var(--t2)", fontSize: ".82rem", marginBottom: 28, lineHeight: 1.6 }}>
        Platform verilerinden otomatik doldurulan kategoriler ve manuel ayarlama ile tahmini TUS net puanınızı hesaplayın.
        Temel Bilimler ve diğer klinik bölümleri kaydırıcıyla tahmin edin.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* Score card */}
        <div className="card" style={{ padding: 24, textAlign: "center", gridRow: "span 2", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>
            Tahmini TUS Net
          </div>
          <div style={{ fontSize: "3.8rem", fontWeight: 900, fontFamily: "Playfair Display, serif", color: col, lineHeight: 1 }}>
            {Math.max(0, totalNet)}
          </div>
          <div style={{ fontSize: ".75rem", color: "var(--t3)", marginTop: 4 }}>/ {maxNet} maksimum</div>
          <div style={{ marginTop: 16 }}>
            <div className="progress-bar" style={{ height: 10, borderRadius: 6 }}>
              <div className="progress-fill" style={{ width: `${totalPct}%`, background: col, transition: "width .5s" }} />
            </div>
            <div style={{ fontSize: ".72rem", color: "var(--t3)", marginTop: 6 }}>%{totalPct} doğruluk eşdeğeri</div>
          </div>
          <div style={{ marginTop: 16, padding: "10px 14px", background: "rgba(255,255,255,.05)", borderRadius: 10 }}>
            <div style={{ fontSize: "1.3rem", marginBottom: 4 }}>{interp.icon}</div>
            <div style={{ fontSize: ".78rem", fontWeight: 700, color: interp.color, lineHeight: 1.4 }}>{interp.text}</div>
          </div>
        </div>

        {/* Sub scores */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", marginBottom: 12, letterSpacing: ".06em" }}>Bölüm Puanları</div>
          {[
            { label: "Dahiliye (66 soru)", net: dahiliyeNet, max: 66, color: "var(--teal)" },
            { label: "Diğer Klinik (34 soru)", net: otherKlinikNet, max: 34, color: "var(--blue)" },
            { label: "Klinik Toplam (100 soru)", net: klinikNet, max: 100, color: "var(--purple)" },
            { label: "Temel Bilimler (100 soru)", net: temelNet, max: 100, color: "var(--gold)" },
          ].map((row) => (
            <div key={row.label} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".75rem", marginBottom: 5 }}>
                <span style={{ color: "var(--t2)" }}>{row.label}</span>
                <span style={{ fontWeight: 800, color: row.color }}>{Math.max(0, row.net)} net</span>
              </div>
              <div className="progress-bar" style={{ height: 5, borderRadius: 3 }}>
                <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, (row.net / row.max) * 100))}%`, background: row.color }} />
              </div>
            </div>
          ))}
        </div>

        {/* Info card */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", marginBottom: 10, letterSpacing: ".06em" }}>Formül</div>
          <div style={{ fontSize: ".76rem", color: "var(--t2)", lineHeight: 1.7 }}>
            <div style={{ fontFamily: "JetBrains Mono, monospace", background: "var(--ink3)", padding: "6px 10px", borderRadius: 7, marginBottom: 8, fontSize: ".7rem", color: "var(--teal)" }}>
              Net = Doğru − (Yanlış ÷ 4)
            </div>
            Maksimum net: <strong style={{ color: "var(--cream)" }}>200</strong><br />
            Toplam soru: <strong style={{ color: "var(--cream)" }}>200</strong> (Temel 100 + Klinik 100)<br />
            Dahiliye payı: <strong style={{ color: "var(--cream)" }}>{DAHILIYE_TOTAL}/100</strong> Klinik<br />
            <span style={{ fontSize: ".68rem", color: "var(--t3)", marginTop: 6, display: "block" }}>
              * Standart puan dönüşümü sınav populasyonuna göre değişir. Bu hesap kaba tahmindir.
            </span>
          </div>
        </div>
      </div>

      {/* Dahiliye detail table */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: ".85rem", fontWeight: 700, color: "var(--cream)" }}>
            Dahiliye Kategori Detayı
          </div>
          <span style={{ fontSize: ".68rem", color: "var(--t3)", fontFamily: "Syne, sans-serif" }}>
            🟢 = Platform verisinden · Kaydırıcı = Manuel
          </span>
        </div>
        <table className="plan-table" style={{ marginBottom: 0 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Kategori</th>
              <th>TUS Sorusu</th>
              <th>Başarı %</th>
              <th>Net Katkı</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(DAHILIYE_DIST).map(([cat, q]) => {
              const stat = dahiliyeStats[cat];
              const effectivePct = getEffectivePct(cat);
              const correct = q * effectivePct / 100;
              const wrong = q * (1 - effectivePct / 100);
              const net = Math.round(netScore(correct, wrong) * 10) / 10;
              const col2 = scoreColor(effectivePct);
              const icon = TREE.find((b) => b.cat === cat)?.icon || "";

              return (
                <tr key={cat}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{icon}</span>
                      <span style={{ fontWeight: 600 }}>{cat}</span>
                      {stat.hasData && dahiliyeOverride[cat] === undefined && (
                        <span style={{ fontSize: ".6rem", color: "var(--green)", fontWeight: 800 }}>🟢</span>
                      )}
                    </div>
                  </td>
                  <td style={{ textAlign: "center" }}>{q}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="range" min={0} max={100} step={5}
                        value={effectivePct}
                        onChange={(e) => setDahiliyeOverride((prev) => ({ ...prev, [cat]: Number(e.target.value) }))}
                        style={{ flex: 1, accentColor: "var(--teal)", cursor: "pointer" }}
                      />
                      <span style={{ fontSize: ".75rem", fontWeight: 800, color: col2, minWidth: 32, textAlign: "right" }}>%{effectivePct}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: "center", fontWeight: 800, color: net > 0 ? col2 : "var(--ac)" }}>{net > 0 ? `+${net}` : net}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ textAlign: "right", fontWeight: 700, color: "var(--cream)" }}>Dahiliye Net Toplam</td>
              <td style={{ textAlign: "center", fontWeight: 900, color: "var(--teal)", fontSize: ".9rem" }}>{dahiliyeNet}</td>
            </tr>
          </tfoot>
        </table>
        {Object.keys(dahiliyeOverride).length > 0 && (
          <button
            className="btn btn-ghost sm"
            style={{ marginTop: 10, fontSize: ".72rem" }}
            onClick={() => setDahiliyeOverride({})}
          >
            ↺ Platform Verilerine Dön
          </button>
        )}
      </div>

      {/* Other Klinik */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: ".85rem", fontWeight: 700, color: "var(--cream)", marginBottom: 16 }}>
          Diğer Klinik Bölümler (34 soru)
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {OTHER_KLINIK.map((s) => (
            <Slider
              key={s.label}
              label={`${s.label} (${s.q}s)`}
              value={otherKlinik[s.label] ?? 60}
              onChange={(v) => setOtherKlinik((prev) => ({ ...prev, [s.label]: v }))}
            />
          ))}
        </div>
      </div>

      {/* Temel Bilimler */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: ".85rem", fontWeight: 700, color: "var(--cream)", marginBottom: 16 }}>
          Temel Bilimler (100 soru)
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {TEMEL_SECTIONS.map((s) => (
            <Slider
              key={s.label}
              label={`${s.label} (${s.q}s)`}
              value={temel[s.label] ?? 60}
              onChange={(v) => setTemel((prev) => ({ ...prev, [s.label]: v }))}
            />
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div style={{ fontSize: ".7rem", color: "var(--t3)", textAlign: "center", lineHeight: 1.6, padding: "0 12px" }}>
        Bu simülatör eğitim amaçlıdır. Gerçek TUS sonuçları; sınavın güçlük düzeyi, sınav puanlama yöntemi ve
        katılımcı dağılımına göre değişir. Son 5 yıl TUS Klinik soru dağılımı kullanılmıştır.
      </div>
    </div>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: ".75rem", color: "var(--t2)", minWidth: 160, flexShrink: 0 }}>{label}</span>
      <input
        type="range" min={0} max={100} step={5} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: "var(--teal)", cursor: "pointer" }}
      />
      <span style={{ fontSize: ".78rem", fontWeight: 800, color: scoreColor(value), minWidth: 36, textAlign: "right" }}>%{value}</span>
    </div>
  );
}
