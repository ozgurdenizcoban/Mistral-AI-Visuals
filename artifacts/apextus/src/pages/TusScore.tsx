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

const OTHER_KLINIK = [
  { label: "Cerrahi", q: 12 },
  { label: "Kadın Doğum", q: 8 },
  { label: "Pediatri", q: 8 },
  { label: "Nöroloji", q: 3 },
  { label: "Psikiyatri / Diğer", q: 3 },
];

const TEMEL_SECTIONS = [
  { label: "Anatomi", q: 14 },
  { label: "Histoloji & Embriyoloji", q: 10 },
  { label: "Fizyoloji", q: 14 },
  { label: "Biyokimya", q: 14 },
  { label: "Mikrobiyoloji", q: 14 },
  { label: "Farmakoloji", q: 14 },
  { label: "Patoloji", q: 20 },
];

/* ----------------------------------------------------------------
   TUS Standart Puan formülü (ÖSYM benzeri yaklaşım)
   SP = 50 + 10 × (net − ortalama) / standart_sapma
   Temel Bilimler ortalama net ≈ 42, sd ≈ 16
   Klinik Bilimler ortalama net ≈ 43, sd ≈ 16
   TUS Puanı = 0.4 × SP_Temel + 0.6 × SP_Klinik
---------------------------------------------------------------- */
const TB_MEAN = 42;
const TB_SD   = 16;
const KB_MEAN = 43;
const KB_SD   = 16;

function netScore(correct: number, wrong: number) {
  return correct - wrong / 4;
}

function calcTusPuan(temelNet: number, klinikNet: number): number {
  const spTemel  = 50 + 10 * (temelNet  - TB_MEAN) / TB_SD;
  const spKlinik = 50 + 10 * (klinikNet - KB_MEAN) / KB_SD;
  const puan = 0.4 * spTemel + 0.6 * spKlinik;
  return Math.max(0, Math.min(100, Math.round(puan * 10) / 10));
}

function calcSpTemel(net: number)  { return Math.max(0, Math.min(100, Math.round((50 + 10 * (net - TB_MEAN) / TB_SD) * 10) / 10)); }
function calcSpKlinik(net: number) { return Math.max(0, Math.min(100, Math.round((50 + 10 * (net - KB_MEAN) / KB_SD) * 10) / 10)); }

function puanColor(p: number) {
  if (p >= 62) return "var(--green)";
  if (p >= 55) return "var(--teal)";
  if (p >= 48) return "var(--gold)";
  return "var(--ac)";
}

function pctColor(pct: number) {
  if (pct >= 75) return "var(--green)";
  if (pct >= 60) return "var(--teal)";
  if (pct >= 45) return "var(--gold)";
  return "var(--ac)";
}

function interpretation(puan: number) {
  if (puan >= 65) return { text: "Mükemmel — Dahiliye, Kardiyoloji dahil tüm dallar açık", color: "var(--green)", icon: "🏆" };
  if (puan >= 60) return { text: "Çok İyi — Popüler uzmanlık dalları için rekabetçi", color: "var(--teal)", icon: "🎯" };
  if (puan >= 55) return { text: "İyi — Orta popülerteki dallar için yeterli", color: "var(--blue)", icon: "👍" };
  if (puan >= 48) return { text: "Orta — Daha az tercih edilen dallara girebilir", color: "var(--gold)", icon: "📚" };
  return { text: "Gelişime İhtiyaç Var — Yoğun tekrar şart", color: "var(--ac)", icon: "💪" };
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: ".75rem", color: "var(--t2)", minWidth: 165, flexShrink: 0 }}>{label}</span>
      <input
        type="range" min={0} max={100} step={5} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: "var(--teal)", cursor: "pointer" }}
      />
      <span style={{ fontSize: ".78rem", fontWeight: 800, color: pctColor(value), minWidth: 36, textAlign: "right" }}>%{value}</span>
    </div>
  );
}

export default function TusScore() {
  const { state } = useApp();

  const [dahiliyeOverride, setDahiliyeOverride] = useState<Record<string, number>>({});
  const [otherKlinik, setOtherKlinik] = useState<Record<string, number>>(
    Object.fromEntries(OTHER_KLINIK.map((s) => [s.label, 60]))
  );
  const [temel, setTemel] = useState<Record<string, number>>(
    Object.fromEntries(TEMEL_SECTIONS.map((s) => [s.label, 60]))
  );

  /* ---- dahiliye pct from byCat ---- */
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

  /* ---- nets ---- */
  const dahiliyeNet = useMemo(() => {
    let net = 0;
    for (const [cat, q] of Object.entries(DAHILIYE_DIST)) {
      const pct = getEffectivePct(cat) / 100;
      net += netScore(q * pct, q * (1 - pct));
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

  const klinikNet = Math.round((dahiliyeNet + otherKlinikNet) * 10) / 10;

  const temelNet = useMemo(() => {
    let net = 0;
    for (const s of TEMEL_SECTIONS) {
      const pct = (temel[s.label] ?? 60) / 100;
      net += netScore(s.q * pct, s.q * (1 - pct));
    }
    return Math.round(net * 10) / 10;
  }, [temel]);

  const totalNet  = Math.round((klinikNet + temelNet) * 10) / 10;
  const tusPuan   = calcTusPuan(temelNet, klinikNet);
  const spTemel   = calcSpTemel(temelNet);
  const spKlinik  = calcSpKlinik(klinikNet);
  const interp    = interpretation(tusPuan);
  const mainColor = puanColor(tusPuan);

  /* ---- progress bar fill (map 40–80 range to 0–100%) ---- */
  const barPct = Math.max(0, Math.min(100, Math.round(((tusPuan - 40) / 40) * 100)));

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ fontFamily: "Playfair Display, serif", fontSize: "1.6rem", fontWeight: 900, color: "var(--cream)", marginBottom: 6 }}>
        TUS Puan Simülatörü
      </div>
      <div style={{ color: "var(--t2)", fontSize: ".82rem", marginBottom: 28, lineHeight: 1.6 }}>
        Platform verilerinizden otomatik doldurulan dahiliye kategorileri ile Temel Bilimler ve diğer klinik bölümleri
        kaydırıcıyla ayarlayın — ÖSYM benzeri standart puan formülüyle tahmini TUS puanınızı görün.
      </div>

      {/* ── Main score + sub-scores grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>

        {/* Main score card */}
        <div className="card" style={{ padding: 24, textAlign: "center", gridRow: "span 2", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: ".65rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>
            Tahmini TUS Puanı
          </div>
          <div style={{ fontSize: "4.5rem", fontWeight: 900, fontFamily: "Playfair Display, serif", color: mainColor, lineHeight: 1 }}>
            {tusPuan.toFixed(1)}
          </div>
          <div style={{ fontSize: ".72rem", color: "var(--t3)", marginTop: 6, letterSpacing: ".04em" }}>/ 100 puan üzerinden</div>

          {/* Progress bar — 40 to 80 range */}
          <div style={{ marginTop: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".6rem", color: "var(--t3)", marginBottom: 5 }}>
              <span>40</span><span>50</span><span>60</span><span>70</span><span>80</span>
            </div>
            <div className="progress-bar" style={{ height: 10, borderRadius: 6 }}>
              <div className="progress-fill" style={{ width: `${barPct}%`, background: mainColor, transition: "width .6s" }} />
            </div>
          </div>

          {/* Interpretation */}
          <div style={{ marginTop: 16, padding: "12px 14px", background: "rgba(255,255,255,.05)", borderRadius: 10 }}>
            <div style={{ fontSize: "1.4rem", marginBottom: 5 }}>{interp.icon}</div>
            <div style={{ fontSize: ".78rem", fontWeight: 700, color: interp.color, lineHeight: 1.5 }}>{interp.text}</div>
          </div>

          {/* Net breakdown small */}
          <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(255,255,255,.03)", borderRadius: 8 }}>
            <div style={{ fontSize: ".62rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 7 }}>Ham Net Puanlar</div>
            <div style={{ display: "flex", justifyContent: "space-around", gap: 8 }}>
              {[
                { label: "Klinik", val: klinikNet, max: 100 },
                { label: "Temel", val: temelNet, max: 100 },
                { label: "Toplam", val: totalNet, max: 200 },
              ].map((r) => (
                <div key={r.label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: ".85rem", fontWeight: 900, color: "var(--cream)", fontFamily: "Playfair Display, serif" }}>{Math.max(0, r.val)}</div>
                  <div style={{ fontSize: ".58rem", color: "var(--t3)", marginTop: 2 }}>{r.label} /{r.max}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Standart puan breakdown */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: ".7rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", marginBottom: 14, letterSpacing: ".07em" }}>
            Standart Puan Dağılımı
          </div>
          {[
            { label: "Temel Bilimler SP", sp: spTemel,  w: "× 0.4", net: temelNet,  max: 100, color: "var(--gold)" },
            { label: "Klinik Bilimler SP", sp: spKlinik, w: "× 0.6", net: klinikNet, max: 100, color: "var(--purple)" },
          ].map((row) => (
            <div key={row.label} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <div>
                  <span style={{ fontSize: ".76rem", color: "var(--text)", fontWeight: 600 }}>{row.label}</span>
                  <span style={{ fontSize: ".62rem", color: "var(--t3)", marginLeft: 6 }}>{row.w}</span>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                  <span style={{ fontSize: ".65rem", color: "var(--t3)" }}>net {Math.max(0, row.net)}</span>
                  <span style={{ fontSize: ".9rem", fontWeight: 900, color: row.color }}>{row.sp.toFixed(1)}</span>
                </div>
              </div>
              <div className="progress-bar" style={{ height: 6, borderRadius: 4 }}>
                <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, row.sp))}%`, background: row.color, transition: "width .5s" }} />
              </div>
            </div>
          ))}

          {/* Formula result */}
          <div style={{ marginTop: 4, padding: "10px 12px", background: "rgba(255,255,255,.05)", borderRadius: 8, fontFamily: "JetBrains Mono, monospace", fontSize: ".7rem", color: "var(--teal)", lineHeight: 1.8 }}>
            <div>0.4 × {spTemel.toFixed(1)} + 0.6 × {spKlinik.toFixed(1)}</div>
            <div style={{ color: "var(--cream)", fontWeight: 700 }}>= <span style={{ color: mainColor }}>{tusPuan.toFixed(1)} puan</span></div>
          </div>
        </div>

        {/* Competitive bench */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: ".7rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", marginBottom: 12, letterSpacing: ".07em" }}>
            Uzmanlık Dalı Karşılaştırması
          </div>
          {[
            { label: "Radyoloji / Anestezi", min: 65, color: "var(--green)" },
            { label: "Kardiyoloji / Dahiliye", min: 62, color: "var(--teal)" },
            { label: "Genel Cerrahi / Pediatri", min: 58, color: "var(--blue)" },
            { label: "Aile Hekimliği / Halk S.", min: 52, color: "var(--gold)" },
            { label: "Ortalama yerleşme", min: 48, color: "var(--purple)" },
          ].map((row) => {
            const canApply = tusPuan >= row.min;
            return (
              <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: canApply ? row.color : "var(--line2)", flexShrink: 0 }} />
                <span style={{ fontSize: ".73rem", color: canApply ? "var(--text)" : "var(--t3)", flex: 1, fontWeight: canApply ? 600 : 400 }}>{row.label}</span>
                <span style={{ fontSize: ".65rem", color: "var(--t3)", fontFamily: "Syne, sans-serif" }}>{row.min}+</span>
                <span style={{ fontSize: ".65rem", fontWeight: 800, color: canApply ? row.color : "var(--t3)" }}>{canApply ? "✓" : "✗"}</span>
              </div>
            );
          })}
          <div style={{ fontSize: ".6rem", color: "var(--t3)", marginTop: 8, lineHeight: 1.5 }}>
            * Eşik değerleri yaklaşıktır; her TUS döneminde değişir.
          </div>
        </div>
      </div>

      {/* Dahiliye detail table */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: ".85rem", fontWeight: 700, color: "var(--cream)" }}>Dahiliye Kategori Detayı</div>
          <span style={{ fontSize: ".67rem", color: "var(--t3)", fontFamily: "Syne, sans-serif" }}>
            🟢 = Platform verisinden · kaydırıcı ile düzenle
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
              const eff = getEffectivePct(cat);
              const correct = q * eff / 100;
              const wrong = q * (1 - eff / 100);
              const net = Math.round(netScore(correct, wrong) * 10) / 10;
              const col2 = pctColor(eff);
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
                        type="range" min={0} max={100} step={5} value={eff}
                        onChange={(e) => setDahiliyeOverride((prev) => ({ ...prev, [cat]: Number(e.target.value) }))}
                        style={{ flex: 1, accentColor: "var(--teal)", cursor: "pointer" }}
                      />
                      <span style={{ fontSize: ".75rem", fontWeight: 800, color: col2, minWidth: 32, textAlign: "right" }}>%{eff}</span>
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
              <td style={{ textAlign: "center", fontWeight: 900, color: "var(--teal)", fontSize: ".9rem" }}>{Math.max(0, dahiliyeNet)}</td>
            </tr>
          </tfoot>
        </table>
        {Object.keys(dahiliyeOverride).length > 0 && (
          <button className="btn btn-ghost sm" style={{ marginTop: 10, fontSize: ".72rem" }} onClick={() => setDahiliyeOverride({})}>
            ↺ Platform Verilerine Dön
          </button>
        )}
      </div>

      {/* Other Klinik */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: ".85rem", fontWeight: 700, color: "var(--cream)", marginBottom: 16 }}>
          Diğer Klinik Bölümler <span style={{ fontSize: ".72rem", color: "var(--t3)", fontWeight: 400 }}>(34 soru)</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {OTHER_KLINIK.map((s) => (
            <Slider
              key={s.label}
              label={`${s.label} (${s.q} soru)`}
              value={otherKlinik[s.label] ?? 60}
              onChange={(v) => setOtherKlinik((prev) => ({ ...prev, [s.label]: v }))}
            />
          ))}
        </div>
      </div>

      {/* Temel Bilimler */}
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: ".85rem", fontWeight: 700, color: "var(--cream)", marginBottom: 16 }}>
          Temel Bilimler <span style={{ fontSize: ".72rem", color: "var(--t3)", fontWeight: 400 }}>(100 soru)</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {TEMEL_SECTIONS.map((s) => (
            <Slider
              key={s.label}
              label={`${s.label} (${s.q} soru)`}
              value={temel[s.label] ?? 60}
              onChange={(v) => setTemel((prev) => ({ ...prev, [s.label]: v }))}
            />
          ))}
        </div>
      </div>

      <div style={{ fontSize: ".68rem", color: "var(--t3)", textAlign: "center", lineHeight: 1.7, padding: "0 16px 16px" }}>
        Bu simülatör ÖSYM TUS standardizasyon metodolojisini yaklaşık olarak modellemektedir
        (Temel Bil. ortalama net ≈ 42, Klinik Bil. ≈ 43, SD ≈ 16).
        Gerçek TUS puanı sınav güçlüğüne ve katılımcı dağılımına göre değişir.
      </div>
    </div>
  );
}
