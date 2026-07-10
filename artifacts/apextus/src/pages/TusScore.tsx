import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { calcSpKlinik, calcSpTemel, calcTusPuan, getPlacementMatches, netScore, TUS_SCORE_SOURCE, TUS_SECTIONS } from "@/lib/tusData";

function pctColor(pct: number) {
  if (pct >= 75) return "var(--green)";
  if (pct >= 60) return "var(--teal)";
  if (pct >= 45) return "var(--gold)";
  return "var(--ac)";
}

function statusColor(status: string) {
  if (status === "güçlü") return "var(--green)";
  if (status === "sınırda") return "var(--teal)";
  if (status === "yakın") return "var(--gold)";
  return "var(--t3)";
}

export default function TusScore() {
  const { state } = useApp();
  const [overrides, setOverrides] = useState<Record<string, number>>({});

  const sectionRows = useMemo(() => {
    return TUS_SECTIONS.map((section) => {
      const perf = state.byCat?.[section.label];
      const pct = overrides[section.label] ?? (perf?.a ? Math.round((perf.c / perf.a) * 100) : 60);
      const correct = section.q * pct / 100;
      const wrong = section.q * (1 - pct / 100);
      const net = Math.round(netScore(correct, wrong) * 10) / 10;
      return { ...section, pct, net, hasData: !!perf?.a };
    });
  }, [state.byCat, overrides]);

  const temelNet = Math.round(sectionRows.filter((r) => r.group === "Temel").reduce((sum, r) => sum + r.net, 0) * 10) / 10;
  const klinikNet = Math.round(sectionRows.filter((r) => r.group === "Klinik").reduce((sum, r) => sum + r.net, 0) * 10) / 10;
  const totalNet = Math.round((temelNet + klinikNet) * 10) / 10;
  const tusPuan = calcTusPuan(temelNet, klinikNet);
  const spTemel = calcSpTemel(temelNet);
  const spKlinik = calcSpKlinik(klinikNet);
  const matches = getPlacementMatches(tusPuan);
  const possible = matches.filter((m) => m.status === "güçlü" || m.status === "sınırda");
  const near = matches.filter((m) => m.status === "yakın").slice(0, 5);

  return (
    <div className="score-page">
      <div className="score-hero">
        <div>
          <div className="eyebrow">TUS puan ve yerleşme simülatörü</div>
          <h1>{tusPuan.toFixed(1)}</h1>
          <p>Temel ve Klinik Bilimler netlerinden tahmini TUS puanı hesaplanır; ÖSYM yerleştirme taban puanlarına göre hangi branşlara yakın olduğun gösterilir.</p>
          <a href={TUS_SCORE_SOURCE.url} target="_blank" rel="noreferrer">Kaynak: {TUS_SCORE_SOURCE.label}</a>
        </div>
        <div className="score-metrics">
          <div><span>Temel net</span><strong>{temelNet}</strong><em>SP {spTemel}</em></div>
          <div><span>Klinik net</span><strong>{klinikNet}</strong><em>SP {spKlinik}</em></div>
          <div><span>Toplam net</span><strong>{totalNet}</strong><em>200 soru</em></div>
        </div>
      </div>

      <section className="placement-panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">Nereye yerleşebilirim?</div>
            <h2>Branş olasılıkları</h2>
          </div>
          <span className="tag tag-teal">{possible.length} güçlü/sınırda seçenek</span>
        </div>
        <div className="placement-grid">
          {matches.slice(0, 18).map((item) => (
            <div className={`placement-card ${item.status}`} key={item.branch}>
              <div>
                <strong>{item.branch}</strong>
                <span>{item.competitiveness} rekabet</span>
              </div>
              <div>
                <b>{item.min.toFixed(1)}</b>
                <em style={{ color: statusColor(item.status) }}>{item.status}</em>
              </div>
            </div>
          ))}
        </div>
        {near.length > 0 && (
          <div className="near-note">
            <strong>En yakın hedefler:</strong> {near.map((n) => `${n.branch} için +${Math.abs(n.diff).toFixed(1)} puan`).join(" · ")}
          </div>
        )}
      </section>

      <section className="score-table-card">
        <div className="panel-head">
          <div>
            <div className="eyebrow">Ders bazlı net katkı</div>
            <h2>Tüm TUS dersleri</h2>
          </div>
          {Object.keys(overrides).length > 0 && <button className="btn btn-ghost sm" onClick={() => setOverrides({})}>Verilere dön</button>}
        </div>
        <table className="plan-table score-table">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Ders</th>
              <th>Bölüm</th>
              <th>Soru</th>
              <th>Başarı</th>
              <th>Net katkı</th>
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
      </section>
    </div>
  );
}
