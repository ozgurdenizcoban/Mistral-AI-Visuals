import { useApp } from "@/contexts/AppContext";
import { TREE } from "@/lib/data";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

export default function Stats() {
  const { state } = useApp();

  const pct = state.total > 0 ? Math.round((state.correct / state.total) * 100) : 0;
  const cats = Object.keys(state.byCat || {});
  const catData = cats.map((c) => {
    const cd = state.byCat[c];
    const p = cd.a > 0 ? Math.round((cd.c / cd.a) * 100) : 0;
    return { name: c, pct: p, total: cd.a, correct: cd.c };
  });

  const sessions = (state.sessions || []).slice(-12);
  const sessData = sessions.map((s, i) => ({ name: `#${i + 1}`, pct: s.p, cat: s.cat }));

  const allTopics: { name: string; cat: string; icon: string; sc: number }[] = [];
  TREE.forEach((b) => b.topics.forEach((t) => {
    allTopics.push({ name: t, cat: b.cat, icon: b.icon, sc: state.sr?.[t]?.studyCount || 0 });
  }));
  const studiedTopics = allTopics.filter((t) => t.sc > 0).sort((a, b) => b.sc - a.sc);
  const totalTopics = allTopics.length;
  const studiedCount = studiedTopics.length;
  const zeroCount = totalTopics - studiedCount;

  const topicProgress = TREE.map((b) => {
    const done = b.topics.filter((t) => (state.sr?.[t]?.studyCount || 0) > 0).length;
    return { cat: b.cat, icon: b.icon, done, total: b.topics.length, pct: Math.round((done / b.topics.length) * 100) };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div style={{ fontFamily: "Playfair Display, serif", fontSize: "1.6rem", fontWeight: 900, color: "var(--cream)" }}>
          İstatistikler
        </div>
        <div style={{ color: "var(--t2)", fontSize: ".82rem", marginTop: 4 }}>Tüm çalışma verilerinizin özeti</div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }} className="g4">
        <div className="kpi c1">
          <div className="kpi-icon">📋</div>
          <div className="kpi-value">{state.total}</div>
          <div className="kpi-label">Toplam Soru</div>
        </div>
        <div className="kpi c2">
          <div className="kpi-icon">✓</div>
          <div className="kpi-value">{state.correct || 0}</div>
          <div className="kpi-label">Doğru</div>
        </div>
        <div className="kpi c3">
          <div className="kpi-icon">✗</div>
          <div className="kpi-value">{(state.total || 0) - (state.correct || 0)}</div>
          <div className="kpi-label">Yanlış</div>
        </div>
        <div className="kpi c4">
          <div className="kpi-icon">🎯</div>
          <div className="kpi-value">{pct}%</div>
          <div className="kpi-label">Başarı</div>
        </div>
      </div>

      {/* Charts */}
      {catData.length > 0 && (
        <div className="card">
          <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 14 }}>
            Kategori Başarı Oranları
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={catData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" />
              <XAxis dataKey="name" tick={{ fill: "#8a95a8", fontSize: 9 }} angle={-25} textAnchor="end" height={50} />
              <YAxis tick={{ fill: "#8a95a8", fontSize: 10 }} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ background: "var(--ink2)", border: "1px solid var(--line)", borderRadius: 8, fontFamily: "Syne, sans-serif" }}
                formatter={(v: number) => [`${v}%`, "Başarı"]}
              />
              <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                {catData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.pct >= 70 ? "rgba(52,211,153,.7)" : entry.pct >= 40 ? "rgba(45,212,191,.7)" : "rgba(232,83,74,.7)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {sessData.length > 0 && (
        <div className="card">
          <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 14 }}>
            Oturum Trendi
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={sessData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" />
              <XAxis dataKey="name" tick={{ fill: "#8a95a8", fontSize: 10 }} />
              <YAxis tick={{ fill: "#8a95a8", fontSize: 10 }} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ background: "var(--ink2)", border: "1px solid var(--line)", borderRadius: 8, fontFamily: "Syne, sans-serif" }}
                formatter={(v: number) => [`${v}%`, "Başarı"]}
              />
              <Line
                type="monotone" dataKey="pct" stroke="var(--ac)" strokeWidth={2}
                dot={{ fill: "var(--ac)", r: 4 }} activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Topic coverage */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".08em" }}>
            Konu Kapsamı
          </div>
          <div style={{ fontSize: ".78rem", color: "var(--teal)", fontWeight: 700 }}>
            {studiedCount}/{totalTopics} ({Math.round((studiedCount / totalTopics) * 100)}%)
          </div>
        </div>

        {topicProgress.map((b) => (
          <div key={b.cat} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: ".8rem", color: "var(--text)", fontWeight: 600 }}>
                {b.icon} {b.cat}
              </span>
              <span style={{ fontSize: ".72rem", color: "var(--t2)" }}>{b.done}/{b.total}</span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${b.pct}%`,
                  background: b.pct >= 70 ? "var(--green)" : b.pct >= 30 ? "var(--teal)" : "var(--ac)",
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Mistake analysis */}
      {Object.keys(state.mistakes || {}).length > 0 && (
        <div className="card">
          <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 14 }}>
            ⚠ Hata Analizi — Zayıf Konular
          </div>
          {Object.entries(state.mistakes || {})
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([topic, count]) => (
              <div key={topic} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--line)" }}>
                <span style={{ fontSize: ".82rem", color: "var(--text)" }}>{topic}</span>
                <span style={{ background: "var(--rd)", color: "var(--ac)", padding: "2px 9px", borderRadius: 12, fontSize: ".72rem", fontWeight: 700 }}>
                  {count} hata
                </span>
              </div>
            ))}
        </div>
      )}

      {/* All sessions */}
      <div className="card">
        <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>
          Tüm Oturumlar
        </div>
        {(state.sessions || []).length === 0 ? (
          <div style={{ color: "var(--t2)", fontSize: ".8rem", textAlign: "center", padding: "16px 0" }}>Henüz oturum yok.</div>
        ) : (
          [...(state.sessions || [])].reverse().map((s, i) => (
            <div key={i} className="si">
              <div>
                <div style={{ fontWeight: 700, fontSize: ".83rem", color: "var(--text)" }}>{s.cat}</div>
                <div className="ssd">{s.date}</div>
              </div>
              <div className="ssv" style={{ color: s.p >= 70 ? "var(--green)" : s.p >= 40 ? "var(--teal)" : "var(--ac)" }}>
                {s.c}/{s.t} — {s.p}%
              </div>
            </div>
          ))
        )}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .g4 { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </div>
  );
}
