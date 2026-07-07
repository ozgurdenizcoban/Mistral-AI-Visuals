import { useApp } from "@/contexts/AppContext";
import { TREE } from "@/lib/data";
import { getScoreSimulation, getTopicInsights } from "@/lib/studyInsights";

export default function Dashboard() {
  const { state, setCurrentPage, setQuizTarget, setNoteTarget, username } = useApp();

  const pct = state.total > 0 ? Math.round((state.correct / state.total) * 100) : 0;
  const studiedCount = Object.values(state.sr || {}).filter((v) => (v.studyCount || 0) > 0).length;
  const totalTopics = TREE.reduce((acc, b) => acc + b.topics.length, 0);
  const dueToday = Object.entries(state.sr || {}).filter(([, v]) => {
    if (!v.nextDate) return false;
    return v.nextDate <= new Date().toISOString().slice(0, 10);
  }).length;
  const insights = getTopicInsights(state);
  const weakFocus = insights.slice(0, 5);
  const sim = getScoreSimulation(state, 90, 4, 65);

  const allTopics: { name: string; cat: string; icon: string; sc: number }[] = [];
  TREE.forEach((b) => b.topics.forEach((t) => {
    const sc = (state.sr?.[t]?.studyCount || 0);
    allTopics.push({ name: t, cat: b.cat, icon: b.icon, sc });
  }));
  const strong = allTopics.filter((t) => t.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 5);
  const weak = allTopics.filter((t) => t.sc === 0).slice(0, 5);
  const recentSessions = (state.sessions || []).slice(-5).reverse();

  function startQuiz(cat: string, topic = "") {
    setQuizTarget({ cat, topic });
    setCurrentPage("quiz");
  }

  function openNote(cat: string, topic: string) {
    const branch = TREE.find((b) => b.cat === cat);
    if (!branch) return;
    setNoteTarget({ cat, icon: branch.icon, topic });
    setCurrentPage("notes");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Hero */}
      <div className="hero">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "Playfair Display, serif", fontSize: "1.55rem", fontWeight: 900, color: "var(--cream)", lineHeight: 1.2 }}>
              Hoş geldin, {username || "Hekim Adayı"} 👋
            </div>
            <div style={{ fontSize: ".82rem", color: "var(--t2)", marginTop: 6 }}>
              TUS'a hazırlığında her gün bir adım öne çık.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {state.streak > 0 && (
              <div className="streak">
                🔥 {state.streak} Günlük Seri
              </div>
            )}
            {dueToday > 0 && (
              <button
                className="btn btn-teal sm"
                onClick={() => setCurrentPage("review")}
              >
                ⏰ {dueToday} tekrar bekliyor
              </button>
            )}
          </div>
        </div>
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
          <div className="kpi-value">{pct}%</div>
          <div className="kpi-label">Doğruluk</div>
        </div>
        <div className="kpi c3">
          <div className="kpi-icon">🔥</div>
          <div className="kpi-value">{state.streak}</div>
          <div className="kpi-label">Gün Serisi</div>
        </div>
        <div className="kpi c4">
          <div className="kpi-icon">📚</div>
          <div className="kpi-value">{studiedCount}</div>
          <div className="kpi-label">Çalışılan Not</div>
        </div>
      </div>

      {/* Quick quiz buttons */}
      <div className="card">
        <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>
          Hızlı Quiz Başlat
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {TREE.map((b) => (
            <button
              key={b.cat}
              onClick={() => startQuiz(b.cat)}
              style={{
                padding: "6px 13px", background: "var(--ink3)", border: "1px solid var(--line)",
                borderRadius: 20, cursor: "pointer", fontFamily: "Syne, sans-serif",
                fontSize: ".74rem", fontWeight: 600, color: "var(--t2)", transition: "all .13s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--ac)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--line)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--t2)";
              }}
            >
              {b.icon} {b.cat}
            </button>
          ))}
          <button
            onClick={() => startQuiz("Karışık")}
            style={{
              padding: "6px 13px", background: "var(--rd)", border: "1px solid rgba(232,83,74,.25)",
              borderRadius: 20, cursor: "pointer", fontFamily: "Syne, sans-serif",
              fontSize: ".74rem", fontWeight: 700, color: "var(--ac)", transition: "all .13s",
            }}
          >
            🎲 Karışık
          </button>
        </div>
      </div>

      {/* Targeted weak analysis */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--ac)", textTransform: "uppercase", letterSpacing: ".08em" }}>
              Hedefli Zayıf Konu Analizi
            </div>
            <div style={{ color: "var(--t2)", fontSize: ".78rem", marginTop: 5 }}>
              Hata, tekrar ve kategori başarısına göre bugünkü en yüksek getirili çalışma alanları.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="tag tag-teal">{sim.coveragePct}% konu kapsamı</span>
            <span className="tag tag-gold">{sim.currentBand[0]}-{sim.currentBand[1]} tahmini band</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.15fr .85fr", gap: 14 }} className="g2">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {weakFocus.map((w, i) => (
              <div key={w.topic} className="weak-action-row">
                <div className="weak-rank">{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <strong style={{ color: "var(--cream)", fontSize: ".84rem" }}>{w.topic}</strong>
                    <span className="tag tag-gray">{w.cat}</span>
                    {w.mistakes > 0 && <span className="tag tag-red">{w.mistakes} hata</span>}
                  </div>
                  <div style={{ color: "var(--t2)", fontSize: ".73rem", marginTop: 4, lineHeight: 1.55 }}>
                    {w.reason}; öneri: {w.action}.
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-ghost sm" onClick={() => openNote(w.cat, w.topic)}>Not</button>
                  <button className="btn btn-teal sm" onClick={() => startQuiz(w.cat, w.topic)}>Quiz</button>
                </div>
              </div>
            ))}
          </div>

          <div className="score-forecast">
            <div style={{ fontSize: ".68rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".08em" }}>
              90 Günlük Simülasyon
            </div>
            <div className="forecast-line">
              <span>Şu an</span>
              <strong>{sim.currentBand[0]}-{sim.currentBand[1]}</strong>
            </div>
            <div className="forecast-line">
              <span>Planlı çalışma</span>
              <strong style={{ color: "var(--green)" }}>{sim.expectedBand[0]}-{sim.expectedBand[1]}</strong>
            </div>
            <div className="forecast-line">
              <span>Günlük hedef</span>
              <strong>{sim.dailyQuestionTarget} soru</strong>
            </div>
            <div style={{ color: "var(--t2)", fontSize: ".73rem", lineHeight: 1.6, marginTop: 10 }}>
              {sim.message}
            </div>
            <button className="btn btn-primary sm" style={{ marginTop: 12 }} onClick={() => setCurrentPage("review")}>
              Profesyonel plan oluştur
            </button>
          </div>
        </div>
      </div>

      {/* Strong / Weak topics */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="g2">
        {/* Strong */}
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--green)", textTransform: "uppercase", letterSpacing: ".08em" }}>
              💪 Güçlü Konular
            </div>
          </div>
          {strong.length === 0 ? (
            <div style={{ color: "var(--t2)", fontSize: ".78rem" }}>Henüz çalışma verisi yok.</div>
          ) : (
            strong.map((t) => (
              <div
                key={t.name}
                className="topic-bar strong"
                style={{ cursor: "pointer" }}
                onClick={() => {
                  const branch = TREE.find((b) => b.cat === t.cat);
                  if (branch) {
                    setNoteTarget({ cat: t.cat, icon: branch.icon, topic: t.name });
                    setCurrentPage("notes");
                  }
                }}
              >
                <span style={{ fontSize: "1rem" }}>{t.icon}</span>
                <div className="topic-bar-info">
                  <div className="topic-bar-name">{t.name}</div>
                  <div className="topic-bar-sub">{t.sc} tekrar · {t.cat}</div>
                </div>
                <div className="topic-bar-count">{t.sc}×</div>
              </div>
            ))
          )}
        </div>

        {/* Weak */}
        <div className="card">
          <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--ac)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>
            ⚠ Çalışılmayan Konular
          </div>
          {weak.length === 0 ? (
            <div style={{ color: "var(--t2)", fontSize: ".78rem" }}>Tüm konular çalışılmış! 🎉</div>
          ) : (
            weak.map((t) => (
              <div
                key={t.name}
                className="topic-bar zero"
                style={{ cursor: "pointer" }}
                onClick={() => {
                  const branch = TREE.find((b) => b.cat === t.cat);
                  if (branch) {
                    setNoteTarget({ cat: t.cat, icon: branch.icon, topic: t.name });
                    setCurrentPage("notes");
                  }
                }}
              >
                <span style={{ fontSize: "1rem" }}>{t.icon}</span>
                <div className="topic-bar-info">
                  <div className="topic-bar-name">{t.name}</div>
                  <div className="topic-bar-sub">Hiç çalışılmadı</div>
                </div>
                <div className="topic-bar-count">0×</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Category performance */}
      {Object.keys(state.byCat || {}).length > 0 && (
        <div className="card">
          <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 14 }}>
            Kategori Performansı
          </div>
          {Object.entries(state.byCat).map(([cat, cd]) => {
            const p = cd.a > 0 ? Math.round((cd.c / cd.a) * 100) : 0;
            return (
              <div key={cat} className="cpi">
                <div className="cpih">
                  <span style={{ fontWeight: 700, fontSize: ".82rem", color: "var(--text)" }}>{cat}</span>
                  <span style={{ color: "var(--t2)", fontSize: ".72rem" }}>{cd.a} soru · {p}%</span>
                </div>
                <div className="pb">
                  <div className="pbf" style={{ width: `${p}%`, background: p > 70 ? "var(--green)" : p > 40 ? "var(--teal)" : "var(--ac)" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent sessions */}
      {recentSessions.length > 0 && (
        <div className="card">
          <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>
            Son Oturumlar
          </div>
          {recentSessions.map((s, i) => (
            <div key={i} className="si">
              <div>
                <div style={{ fontWeight: 700, fontSize: ".83rem", color: "var(--text)" }}>{s.cat}</div>
                <div className="ssd">{s.date}</div>
              </div>
              <div className="ssv" style={{ color: s.p >= 70 ? "var(--green)" : s.p >= 40 ? "var(--teal)" : "var(--ac)" }}>
                {s.c}/{s.t}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pro CTA */}

      <style>{`
        @media (max-width: 768px) {
          .g4 { grid-template-columns: 1fr 1fr !important; }
          .g2 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
