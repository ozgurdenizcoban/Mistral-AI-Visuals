import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { TREE, SR_INTERVALS } from "@/lib/data";
import { mistralText } from "@/lib/mistral";
import { getFocusedReviewPlan, getScoreSimulation } from "@/lib/studyInsights";
import { addDays, toDay } from "@/lib/utils";
import { toast } from "sonner";

export default function Review() {
  const { state, saveState, setNoteTarget, setCurrentPage, setQuizTarget } = useApp();
  const [planHtml, setPlanHtml] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [tusDate, setTusDate] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState(4);
  const [targetScore, setTargetScore] = useState(65);

  const today = toDay();
  const focus = getFocusedReviewPlan(state, today, 10);
  const due = focus.filter((t) => t.due || t.overdue).slice(0, 5);
  const next = focus.filter((t) => !t.due && !t.overdue).slice(0, 5);
  const daysLeft = tusDate ? Math.max(1, Math.round((new Date(tusDate).getTime() - Date.now()) / 86400000)) : 90;
  const sim = getScoreSimulation(state, daysLeft, hoursPerDay, targetScore);

  function openNote(topic: string) {
    const branch = TREE.find((b) => b.topics.includes(topic));
    if (!branch) return;
    setNoteTarget({ cat: branch.cat, icon: branch.icon, topic });
    setCurrentPage("notes");
  }

  function startQuiz(cat: string, topic: string) {
    setQuizTarget({ cat, topic });
    setCurrentPage("quiz");
  }

  function markStudied(topic: string) {
    const s = { ...state, sr: { ...state.sr } };
    const cur = s.sr[topic] || { level: 0, studyCount: 0 };
    const level = Math.min((cur.level || 0) + 1, SR_INTERVALS.length - 1);
    s.sr[topic] = { ...cur, level, studyCount: (cur.studyCount || 0) + 1, nextDate: addDays(SR_INTERVALS[level]) };
    saveState(s);
    toast.success("Tekrar kaydedildi");
  }

  async function generatePlan() {
    setPlanLoading(true);
    const priorityList = focus.map((t, i) => `${i + 1}. ${t.topic} (${t.cat}) - ${t.reason} - ${t.action}`).join("\n");
    const prompt = `TUS öğrencisi için sade, anlaşılır çalışma planı hazırla.
Hedef puan: ${targetScore}
Günlük süre: ${hoursPerDay} saat
Kalan gün: ${daysLeft}
Tahmini band: ${sim.currentBand[0]}-${sim.currentBand[1]} -> planla ${sim.expectedBand[0]}-${sim.expectedBand[1]}
Öncelikler:
${priorityList}

SADECE HTML dön. Kısa olsun.
<h3>Bu Haftanın Hedefi</h3>
<p>...</p>
<table><thead><tr><th>Gün</th><th>1. iş</th><th>Soru</th><th>Kontrol</th></tr></thead><tbody>7 satır</tbody></table>
<div class="tip"><strong>Beklenen sonuç:</strong> ...</div>`;
    try {
      const html = await mistralText(prompt, 12000, 0.25);
      setPlanHtml(html.replace(/^```(?:html)?\s*/i, "").replace(/\s*```\s*$/, "").trim());
    } catch (e) {
      toast.error("Plan oluşturulamadı: " + (e as Error).message);
    } finally {
      setPlanLoading(false);
    }
  }

  const TaskRow = ({ item, index }: { item: (typeof focus)[number]; index: number }) => (
    <div className="simple-task">
      <div className="task-no">{index + 1}</div>
      <div className="task-main">
        <strong>{item.topic}</strong>
        <span>{item.cat} · {item.reason}</span>
      </div>
      <div className="task-actions">
        <button className="btn btn-ghost sm" onClick={() => openNote(item.topic)}>Not</button>
        <button className="btn btn-teal sm" onClick={() => startQuiz(item.cat, item.topic)}>Quiz</button>
        <button className="btn btn-primary sm" onClick={() => markStudied(item.topic)}>Bitti</button>
      </div>
    </div>
  );

  return (
    <div className="review-simple">
      <section className="review-hero">
        <div>
          <div className="eyebrow">Tekrar planı</div>
          <h1>Bugün sadece önemli olanlar</h1>
          <p>Kalabalık liste yok. Sistem hata, tekrar tarihi ve konu kapsamına göre en mantıklı işleri seçer.</p>
        </div>
        <div className="review-score">
          <strong>{sim.expectedBand[0]}-{sim.expectedBand[1]}</strong>
          <span>Planla beklenen puan bandı</span>
        </div>
      </section>

      <section className="review-grid">
        <div className="panel">
          <div className="panel-head compact">
            <div>
              <div className="eyebrow">1. adım</div>
              <h2>Bugün tekrar et</h2>
            </div>
            <span className="tag tag-teal">{due.length}</span>
          </div>
          {due.length ? due.map((item, i) => <TaskRow key={item.topic} item={item} index={i} />) : <div className="empty-state">Bugün zorunlu tekrar yok. Aşağıdaki önceliklerden birini seç.</div>}
        </div>

        <div className="panel">
          <div className="panel-head compact">
            <div>
              <div className="eyebrow">2. adım</div>
              <h2>Sıradaki öncelikler</h2>
            </div>
          </div>
          {next.map((item, i) => <TaskRow key={item.topic} item={item} index={i} />)}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">İstersen haftalık plan</div>
            <h2>AI planı sade oluşturur</h2>
          </div>
          <button className="btn btn-primary" onClick={generatePlan} disabled={planLoading}>{planLoading ? "Hazırlanıyor..." : "Plan oluştur"}</button>
        </div>
        <div className="plan-controls-simple">
          <label>TUS tarihi <input type="date" value={tusDate} onChange={(e) => setTusDate(e.target.value)} /></label>
          <label>Günlük saat <input type="number" min={1} max={12} value={hoursPerDay} onChange={(e) => setHoursPerDay(Number(e.target.value) || 4)} /></label>
          <label>Hedef puan <input type="number" min={35} max={90} value={targetScore} onChange={(e) => setTargetScore(Number(e.target.value) || 65)} /></label>
        </div>
        {planHtml && <div className="plan-output" style={{ marginTop: 16 }} dangerouslySetInnerHTML={{ __html: planHtml }} />}
      </section>
    </div>
  );
}
