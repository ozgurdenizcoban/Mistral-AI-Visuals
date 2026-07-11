import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { calcTusScores, netScore, searchTusPrograms, TUS_PLACEMENT_SOURCE, TUS_SCORE_SOURCE, TUS_SECTIONS } from "@/lib/tusData";

function pctColor(pct: number) {
  if (pct >= 75) return "var(--green)";
  if (pct >= 60) return "var(--teal)";
  if (pct >= 45) return "var(--gold)";
  return "var(--ac)";
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function statusColor(status: string) {
  if (status === "guclu") return "var(--green)";
  if (status === "sinirda") return "var(--teal)";
  if (status === "yakin" || status === "bos") return "var(--gold)";
  return "var(--t3)";
}

function statusLabel(status: string) {
  if (status === "guclu") return "Yerlesir gibi";
  if (status === "sinirda") return "Sinirda";
  if (status === "yakin") return "Yakin";
  if (status === "bos") return "Bos kalmis";
  return "Uzak";
}

export default function TusScore() {
  const { state } = useApp();
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [programQuery, setProgramQuery] = useState("");

  const sectionRows = useMemo(() => {
    return TUS_SECTIONS.map((section) => {
      const perf = state.byCat?.[section.label];
      const rawPct = overrides[section.label] ?? (perf?.a ? Math.round((perf.c / perf.a) * 100) : 60);
      const pct = clamp(rawPct, 0, 100);
      const correct = section.q * pct / 100;
      const wrong = section.q * (1 - pct / 100);
      const rawNet = Math.round(netScore(correct, wrong) * 10) / 10;
      const net = clamp(rawNet, -section.q / 4, section.q);
      return { ...section, pct, net, hasData: !!perf?.a };
    });
  }, [state.byCat, overrides]);

  const temelNet = clamp(Math.round(sectionRows.filter((r) => r.group === "Temel").reduce((sum, r) => sum + r.net, 0) * 10) / 10, -25, 100);
  const klinikNet = clamp(Math.round(sectionRows.filter((r) => r.group === "Klinik").reduce((sum, r) => sum + r.net, 0) * 10) / 10, -25, 100);
  const totalNet = clamp(Math.round((temelNet + klinikNet) * 10) / 10, -50, 200);
  const scoreEstimate = calcTusScores(temelNet, klinikNet);
  const programMatches = searchTusPrograms(programQuery, scoreEstimate, programQuery.trim() ? 16 : 12);
  const possible = programMatches.filter((m) => m.status === "guclu" || m.status === "sinirda" || m.status === "bos");

  return (
    <div className="score-page">
      <div className="score-hero">
        <div>
          <div className="eyebrow">TUS puan ve yerlesme simulatoru</div>
          <h1>{scoreEstimate.kPuan.toFixed(1)}</h1>
          <p>OSYM modeline gore tahmini K ve T puani hesaplanir. Kesin puan, sinav donemi ortalama, standart sapma ve en buyuk agirlikli puan aciklanmadan birebir hesaplanamaz.</p>
          <a href={TUS_SCORE_SOURCE.url} target="_blank" rel="noreferrer">Puan formulu: {TUS_SCORE_SOURCE.label}</a>
        </div>
        <div className="score-metrics">
          <div><span>K puani</span><strong>{scoreEstimate.kPuan}</strong><em>Klinik agirlikli</em></div>
          <div><span>T puani</span><strong>{scoreEstimate.tPuan}</strong><em>Temel agirlikli</em></div>
          <div><span>Toplam net</span><strong>{totalNet}</strong><em>Temel {temelNet} · Klinik {klinikNet}</em></div>
        </div>
      </div>

      <section className="placement-panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">Nereye yerlesebilirim?</div>
            <h2>Kurum ve bolum ara</h2>
          </div>
          <span className="tag tag-teal">{possible.length} uygun/yakin secenek</span>
        </div>
        <div className="placement-search">
          <input
            value={programQuery}
            onChange={(e) => setProgramQuery(e.target.value)}
            placeholder="Orn: OMU plastik, Ankara goz, Hacettepe radyoloji"
          />
          <span>{programQuery.trim() ? "Arama sonucu" : "Puanina gore en yuksek yakin kurumlar"}</span>
        </div>
        <div className="placement-grid">
          {programMatches.map((item) => (
            <div className={`placement-card program-card ${item.status}`} key={item.code}>
              <div>
                <strong>{item.institution}</strong>
                <span>{item.specialty}</span>
                <small>{item.message}</small>
              </div>
              <div>
                <b>{item.minScore === null ? "Bos" : item.minScore.toFixed(2)}</b>
                <em style={{ color: statusColor(item.status) }}>{statusLabel(item.status)}</em>
                <small>{item.scoreType} puani · {item.placed}/{item.quota}</small>
              </div>
            </div>
          ))}
        </div>
        {programQuery.trim() && programMatches.length === 0 && (
          <div className="near-note">Sonuc bulunamadi. Daha kisa aramayi dene: plastik, ankara goz, ondokuz mayis.</div>
        )}
      </section>

      <section className="score-table-card">
        <div className="panel-head">
          <div>
            <div className="eyebrow">Ders bazli net katki</div>
            <h2>Tum TUS dersleri</h2>
          </div>
          {Object.keys(overrides).length > 0 && <button className="btn btn-ghost sm" onClick={() => setOverrides({})}>Verilere don</button>}
        </div>
        <table className="plan-table score-table">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Ders</th>
              <th>Bolum</th>
              <th>Soru</th>
              <th>Basari</th>
              <th>Net katki</th>
            </tr>
          </thead>
          <tbody>
            {sectionRows.map((row) => (
              <tr key={row.label}>
                <td>
                  <strong>{row.label}</strong>
                  {row.hasData && overrides[row.label] === undefined && <span className="data-dot">veri</span>}
                </td>
                <td style={{ textAlign: "center" }}><span className={row.group === "Temel" ? "tag tag-gold" : "tag tag-teal"}>{row.group}</span></td>
                <td style={{ textAlign: "center" }}>{row.q}</td>
                <td>
                  <div className="score-slider">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={row.pct}
                      onChange={(e) => setOverrides((prev) => ({ ...prev, [row.label]: Number(e.target.value) }))}
                    />
                    <span style={{ color: pctColor(row.pct) }}>%{row.pct}</span>
                  </div>
                </td>
                <td style={{ textAlign: "center", fontWeight: 900, color: row.net >= 0 ? pctColor(row.pct) : "var(--ac)" }}>
                  {row.net > 0 ? `+${row.net}` : row.net}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} style={{ textAlign: "right" }}>Toplam tahmini net</td>
              <td style={{ textAlign: "center", color: "var(--teal)", fontWeight: 900 }}>{totalNet}</td>
            </tr>
          </tfoot>
        </table>
        <div className="near-note">
          <strong>Not:</strong> K puani klinik programlarda, T puani temel bilim programlarinda kullanilir. Kurum arama sonuclari 2025-TUS 2 yerlestirme taban puanlariyla karsilastirilir.
          {" "}<a href={TUS_PLACEMENT_SOURCE.url} target="_blank" rel="noreferrer">{TUS_PLACEMENT_SOURCE.label}</a>
        </div>
      </section>
    </div>
  );
}
