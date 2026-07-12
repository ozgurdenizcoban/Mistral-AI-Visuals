import { ArrowRight, BookOpen, Brain, CalendarCheck, Check, ChevronRight, ClipboardCheck, Clock3, Flame, Play, Sparkles, Target, TrendingUp } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { TREE } from "@/lib/data";
import { getTopicInsights } from "@/lib/studyInsights";

export default function Dashboard() {
  const { state, setCurrentPage, setQuizTarget, setNoteTarget, username } = useApp();
  const accuracy = state.total ? Math.round((state.correct / state.total) * 100) : 0;
  const insights = getTopicInsights(state);
  const focus = insights.slice(0, 3);
  const due = Object.values(state.sr || {}).filter((v) => v.nextDate && v.nextDate <= new Date().toISOString().slice(0, 10)).length;
  const completedToday = Math.min(3, Math.floor((state.total || 0) / 20));

  const openQuiz = (cat?: string, topic?: string) => {
    if (cat) setQuizTarget({ cat, topic: topic || "" });
    setCurrentPage("quiz");
  };
  const openNote = (cat: string, topic: string) => {
    const branch = TREE.find((b) => b.cat === cat);
    if (!branch) return;
    setNoteTarget({ cat, topic, icon: branch.icon });
    setCurrentPage("notes");
  };
  const primary = focus[0];

  return (
    <div className="edu-dashboard">
      <div className="dashboard-heading">
        <div><p className="date-label">BUGÜNÜN ÇALIŞMA PLANI</p><h1>Merhaba {username || "doktor"}</h1><p>Hedefine yaklaşmak için bugün üç odaklı adımın var.</p></div>
        <div className="streak-pill"><Flame size={18} /><span><strong>{state.streak || 0} gün</strong> çalışma serisi</span></div>
      </div>

      <section className="continue-card">
        <div className="continue-icon"><Brain size={28} /></div>
        <div className="continue-copy">
          <span className="section-kicker"><Sparkles size={14} /> SIRADAKİ EN İYİ ADIM</span>
          <h2>{primary?.topic || "İlk kişisel öğrenme oturumunu başlat"}</h2>
          <p>{primary ? `${primary.cat} · ${primary.reason}` : "Kısa bir başlangıç testiyle güçlü ve zayıf konularını belirleyelim."}</p>
          <div className="continue-meta"><span><Clock3 size={15} /> 20 dakika</span><span><Target size={15} /> 15 hedefli soru</span></div>
        </div>
        <button className="continue-button" onClick={() => openQuiz(primary?.cat, primary?.topic)}><Play size={17} fill="currentColor" /> Devam et</button>
      </section>

      <div className="dashboard-columns">
        <section className="edu-section daily-plan">
          <div className="edu-section-head"><div><span>GÜNLÜK HEDEF</span><h2>Bugünün görevleri</h2></div><strong>{completedToday}/3 tamamlandı</strong></div>
          <div className="plan-progress"><i style={{ width: `${completedToday * 33.33}%` }} /></div>
          <div className="task-list">
            <button onClick={() => setCurrentPage("review")}>
              <span className={`task-check ${due === 0 ? "done" : ""}`}>{due === 0 ? <Check size={16} /> : <CalendarCheck size={18} />}</span>
              <span className="task-copy"><strong>Kişisel tekrarlarını tamamla</strong><small>Yalnızca yanlış yaptığın konulardan {due || 1} tekrar</small></span>
              <span className="task-time">10 dk</span><ChevronRight size={18} />
            </button>
            <button onClick={() => openQuiz(primary?.cat, primary?.topic)}>
              <span className="task-check"><Brain size={18} /></span>
              <span className="task-copy"><strong>Hedefli soru oturumu</strong><small>AI analizine göre en yüksek getirili konu</small></span>
              <span className="task-time">20 dk</span><ChevronRight size={18} />
            </button>
            <button onClick={() => setCurrentPage("mockexam")}>
              <span className="task-check"><ClipboardCheck size={18} /></span>
              <span className="task-copy"><strong>Günün mini denemesi</strong><small>Temel ve klinik bilimlerden karma 20 soru</small></span>
              <span className="task-time">25 dk</span><ChevronRight size={18} />
            </button>
          </div>
        </section>

        <aside className="edu-section performance-card">
          <div className="edu-section-head"><div><span>BU HAFTA</span><h2>İlerlemen</h2></div><TrendingUp size={20} /></div>
          <div className="accuracy-ring" style={{ "--score": `${accuracy * 3.6}deg` } as React.CSSProperties}><div><strong>%{accuracy}</strong><span>doğruluk</span></div></div>
          <div className="performance-stats"><div><strong>{state.total}</strong><span>çözülen soru</span></div><div><strong>{state.correct}</strong><span>doğru cevap</span></div></div>
          <button onClick={() => setCurrentPage("stats")}>Ayrıntılı analizi gör <ArrowRight size={16} /></button>
        </aside>
      </div>

      <section className="edu-section focus-section">
        <div className="edu-section-head"><div><span>AI ÖNERİSİ</span><h2>Öncelikli konuların</h2><p>Son cevaplarına göre en çok puan kazandırabilecek alanlar.</p></div><button onClick={() => setCurrentPage("review")}>Tüm planı gör</button></div>
        <div className="focus-cards">
          {(focus.length ? focus : TREE.slice(0, 3).map((b) => ({ cat: b.cat, topic: b.topics[0], reason: "Başlangıç değerlendirmesi bekleniyor", score: 50 }))).map((item, index) => (
            <article key={`${item.cat}-${item.topic}`}>
              <div className="focus-card-top"><span className="focus-number">0{index + 1}</span><span className={`priority priority-${index}`}>{index === 0 ? "Yüksek öncelik" : index === 1 ? "Orta öncelik" : "Planlandı"}</span></div>
              <small>{item.cat}</small><h3>{item.topic}</h3><p>{item.reason}</p>
              <div className="focus-card-actions"><button onClick={() => openNote(item.cat, item.topic)}><BookOpen size={15} /> Konuyu çalış</button><button aria-label="Soru çöz" onClick={() => openQuiz(item.cat, item.topic)}><ChevronRight size={18} /></button></div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
