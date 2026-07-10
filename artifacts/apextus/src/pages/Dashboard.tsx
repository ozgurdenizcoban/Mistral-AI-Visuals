import { BookOpen, Brain, CalendarCheck, ClipboardList, FileText, LineChart, Play, Target, Trophy } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { TREE } from "@/lib/data";
import { getScoreSimulation, getTopicInsights } from "@/lib/studyInsights";

export default function Dashboard() {
  const { state, setCurrentPage, setQuizTarget, setNoteTarget, username } = useApp();

  const pct = state.total > 0 ? Math.round((state.correct / state.total) * 100) : 0;
  const studiedCount = Object.values(state.sr || {}).filter((v) => (v.studyCount || 0) > 0).length;
  const totalTopics = TREE.reduce((acc, b) => acc + b.topics.length, 0);
  const coveragePct = totalTopics ? Math.round((studiedCount / totalTopics) * 100) : 0;
  const dueToday = Object.entries(state.sr || {}).filter(([, v]) => v.nextDate && v.nextDate <= new Date().toISOString().slice(0, 10)).length;
  const insights = getTopicInsights(state);
  const focus = insights.slice(0, 4);
  const sim = getScoreSimulation(state, 90, 4, 65);
  const recentSessions = (state.sessions || []).slice(-4).reverse();

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

  const primaryFocus = focus[0];

  return (
    <div className="command-page">
      <section className="command-hero">
        <div className="command-hero-main">
          <div className="eyebrow">Apex TUS çalışma merkezi</div>
          <h1>{username ? `${username}, bugün net çalışalım.` : "Bugün net çalışalım."}</h1>
          <p>
            Konu notları, TUS tarzı sorular, denemeler ve tekrar planı tek akışta. Sistem hatalarını ve eksik tekrarlarını analiz edip en yüksek getirili çalışmayı öne çıkarır.
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary lg" onClick={() => primaryFocus ? startQuiz(primaryFocus.cat, primaryFocus.topic) : setCurrentPage("quiz")}>
              <Play size={16} /> Odak quiz başlat
            </button>
            <button className="btn btn-teal lg" onClick={() => setCurrentPage("fulltus")}>
              <ClipboardList size={16} /> Gerçek TUS denemesi
            </button>
            <button className="btn btn-ghost lg" onClick={() => setCurrentPage("notes")}>
              <BookOpen size={16} /> Konu notları
            </button>
          </div>
        </div>
        <div className="readiness-panel">
          <div className="readiness-score">{sim.expectedBand[0]}-{sim.expectedBand[1]}</div>
          <div className="readiness-label">90 günlük beklenen puan bandı</div>
          <div className="readiness-bars">
            <div><span>Kapsam</span><strong>{coveragePct}%</strong></div>
            <div className="mini-bar"><i style={{ width: `${coveragePct}%` }} /></div>
            <div><span>Doğruluk</span><strong>{pct}%</strong></div>
            <div className="mini-bar"><i style={{ width: `${pct}%` }} /></div>
          </div>
        </div>
      </section>

      <section className="metric-grid">
        <div className="metric-card"><FileText size={18} /><span>Çözülen soru</span><strong>{state.total}</strong></div>
        <div className="metric-card"><Target size={18} /><span>Doğruluk</span><strong>{pct}%</strong></div>
        <div className="metric-card"><BookOpen size={18} /><span>Konu kapsamı</span><strong>{studiedCount}/{totalTopics}</strong></div>
        <div className="metric-card"><CalendarCheck size={18} /><span>Bugünkü tekrar</span><strong>{dueToday}</strong></div>
      </section>

      <section className="work-grid">
        <div className="panel wide">
          <div className="panel-head">
            <div>
              <div className="eyebrow">Bugünün akıllı planı</div>
              <h2>En yüksek getirili konular</h2>
            </div>
            <button className="btn btn-ghost sm" onClick={() => setCurrentPage("review")}>Planı aç</button>
          </div>
          <div className="focus-list">
            {focus.map((w, i) => (
              <div className="focus-row" key={w.topic}>
                <div className="focus-rank">{i + 1}</div>
                <div className="focus-body">
                  <div>
                    <strong>{w.topic}</strong>
                    <span>{w.cat}</span>
                  </div>
                  <p>{w.reason}. {w.action}.</p>
                </div>
                <div className="focus-actions">
                  <button className="btn btn-ghost sm" onClick={() => openNote(w.cat, w.topic)}>Not</button>
                  <button className="btn btn-teal sm" onClick={() => startQuiz(w.cat, w.topic)}>Quiz</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head compact">
            <div>
              <div className="eyebrow">Hızlı başlangıç</div>
              <h2>Ders seç</h2>
            </div>
          </div>
          <div className="subject-grid">
            {TREE.slice(0, 12).map((b) => (
              <button key={b.cat} onClick={() => startQuiz(b.cat)}>
                <span>{b.icon}</span>
                <strong>{b.cat}</strong>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="work-grid bottom">
        <div className="panel">
          <div className="panel-head compact">
            <div>
              <div className="eyebrow">Deneme modu</div>
              <h2>Sınav pratiği</h2>
            </div>
            <Trophy size={18} />
          </div>
          <div className="exam-actions">
            <button onClick={() => setCurrentPage("fulltus")}><ClipboardList size={17} /> Gerçek TUS denemesi</button>
            <button onClick={() => setCurrentPage("mockexam")}><Brain size={17} /> Hedefli mini deneme</button>
            <button onClick={() => setCurrentPage("tusscore")}><LineChart size={17} /> Puan simülatörü</button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head compact">
            <div>
              <div className="eyebrow">Son oturumlar</div>
              <h2>Performans izi</h2>
            </div>
          </div>
          {recentSessions.length ? (
            <div className="session-list">
              {recentSessions.map((s, i) => (
                <div className="session-row" key={i}>
                  <span>{s.cat}</span>
                  <strong>{s.c}/{s.t}</strong>
                  <em>{s.p}%</em>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">Henüz oturum yok. İlk quizden sonra analiz burada görünür.</div>
          )}
        </div>
      </section>
    </div>
  );
}
