import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { TREE, SR_INTERVALS, FREE_LIMITS } from "@/lib/data";
import { mistralText } from "@/lib/mistral";
import { toDay, addDays } from "@/lib/utils";
import { toast } from "sonner";
import type { SREntry } from "@/contexts/AppContext";

export default function Review() {
  const { state, saveState, setNoteTarget, setCurrentPage, isPro, checkLimit } = useApp();
  const [planLoading, setPlanLoading] = useState(false);
  const [planHtml, setPlanHtml] = useState<string | null>(null);
  const [tusDate, setTusDate] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState(4);
  const [strategy, setStrategy] = useState<"dengeli" | "zayif" | "guclu">("dengeli");

  const today = toDay();
  const allTopics: { name: string; cat: string; icon: string; sr?: SREntry; due: boolean; overdue: boolean }[] = [];
  TREE.forEach((b) => b.topics.forEach((t) => {
    const sr = state.sr?.[t];
    const nextDate = sr?.nextDate;
    const due = !!nextDate && nextDate <= today;
    const overdue = !!nextDate && nextDate < today;
    if (sr?.studyCount || due) {
      allTopics.push({ name: t, cat: b.cat, icon: b.icon, sr, due, overdue });
    }
  }));

  const dueTodayList = allTopics.filter((t) => t.due);
  const upcomingList = allTopics.filter((t) => !t.due && t.sr?.nextDate);
  const completedList = allTopics.filter((t) => t.sr?.studyCount && !t.sr?.nextDate);

  function openNote(topic: string) {
    const branch = TREE.find((b) => b.topics.includes(topic));
    if (branch) {
      setNoteTarget({ cat: branch.cat, icon: branch.icon, topic });
      setCurrentPage("notes");
    }
  }

  function markStudied(topic: string) {
    const s = { ...state };
    s.sr = { ...s.sr };
    const cur = s.sr[topic] || { level: 0, studyCount: 0 };
    const level = Math.min((cur.level || 0) + 1, SR_INTERVALS.length - 1);
    s.sr[topic] = {
      ...cur,
      level,
      studyCount: (cur.studyCount || 0) + 1,
      nextDate: addDays(SR_INTERVALS[level]),
    };
    saveState(s);
    toast.success(`${topic} tekrar edildi! Sonraki: ${SR_INTERVALS[level]} gün sonra`);
  }

  async function generatePlan() {
    if (!isPro()) {
      toast.error("AI çalışma planı Pro özelliğidir.");
      setCurrentPage("pricing");
      return;
    }
    if (!tusDate) { toast.error("Lütfen TUS tarihini seçin"); return; }
    const tusDateObj = new Date(tusDate);
    if (tusDateObj <= new Date()) { toast.error("TUS tarihi bugünden ileri olmalı"); return; }
    const daysLeft = Math.max(0, Math.round((tusDateObj.getTime() - Date.now()) / 86400000));

    setPlanLoading(true);
    const topicData: { konu: string; kategori: string; tekrar: number }[] = [];
    TREE.forEach((b) => b.topics.forEach((t) => {
      topicData.push({ konu: t, kategori: b.cat, tekrar: state.sr?.[t]?.studyCount || 0 });
    }));

    const strategyLabel = { dengeli: "Dengeli", zayif: "Zayıf konulara ağırlık", guclu: "Güçlü konuları pekiştir" }[strategy];
    const priorityList = topicData.sort((a, b) => a.tekrar - b.tekrar).slice(0, 30).map((t, i) => `${i + 1}. ${t.konu} (${t.kategori}) | geçmiş: ${t.tekrar}x`).join("\n");

    const weeksToShow = Math.min(Math.max(1, Math.ceil(daysLeft / 7)), 12);
    const h = hoursPerDay;

    const prompt = `Sen TUS sınavına hazırlayan uzman bir hocasın. Aşağıdaki verilere göre DETAYLI ve BAŞARIYA ODAKLI bir çalışma planı hazırla.

=== ÖĞRENCİ PROFİLİ ===
Çözülen soru: ${state.total} | Doğruluk: ${state.total > 0 ? Math.round((state.correct / state.total) * 100) : 0}% | Seri: ${state.streak} gün
TUS tarihi: ${daysLeft} gün kaldı (yaklaşık ${weeksToShow} hafta)
Günlük çalışma: ${h} saat
Strateji: ${strategyLabel}

=== ÖNCELİK SIRASI (En az çalışılmış) ===
${priorityList}

=== ÇIKTI FORMATI (SADECE HTML, markdown yok) ===
<h3>Genel Değerlendirme ve Plan Stratejisi</h3>
<p>3-4 somut cümle.</p>

HER HAFTA (toplam ${weeksToShow} hafta):
<h3>Hafta N — [Ana tema]</h3>
<table><thead><tr><th>Gün</th><th>Sabah — Konu</th><th>Öğle — Soru</th><th>Akşam — Analiz</th><th>Hedef</th></tr></thead><tbody>
[7 satır: Pazartesi-Pazar]
</tbody></table>

EN SON:
<div class="tip"><strong>En Büyük Avantajın:</strong> ...</div>
<div class="warn"><strong>Kritik Eksik:</strong> ...</div>

Şimdi yaz. ${weeksToShow} haftanın tamamını eksiksiz yaz:`;

    try {
      const html = await mistralText(prompt, 30000, 0.3);
      const clean = html.replace(/^```(?:html)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      setPlanHtml(clean);
    } catch (e) {
      toast.error("Plan oluşturulamadı: " + (e as Error).message);
    } finally {
      setPlanLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div style={{ fontFamily: "Playfair Display, serif", fontSize: "1.6rem", fontWeight: 900, color: "var(--cream)" }}>
          Tekrar Planı
        </div>
        <div style={{ color: "var(--t2)", fontSize: ".82rem", marginTop: 4 }}>
          Aralıklı tekrar (Spaced Repetition) ile kalıcı öğrenme
        </div>
      </div>

      {/* Due today */}
      {dueTodayList.length > 0 && (
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--ac)", textTransform: "uppercase", letterSpacing: ".08em" }}>
              ⏰ Bugün Tekrar Edilmesi Gerekenler ({dueTodayList.length})
            </div>
          </div>
          {dueTodayList.map((t) => (
            <div key={t.name} className="sr-item">
              <span style={{ fontSize: "1rem" }}>{t.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: ".82rem", fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                <div style={{ fontSize: ".68rem", color: "var(--t2)" }}>{t.cat} · Seviye {t.sr?.level || 0} · {t.sr?.studyCount || 0}× çalışıldı</div>
              </div>
              <span className={`sr-due${t.overdue ? " overdue" : " soon"}`}>
                {t.overdue ? "Gecikmiş" : "Bugün"}
              </span>
              <div style={{ display: "flex", gap: 5 }}>
                <button className="btn btn-teal sm" onClick={() => openNote(t.name)}>Oku</button>
                <button className="btn btn-ghost sm" onClick={() => markStudied(t.name)}>✓</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {dueTodayList.length === 0 && (
        <div style={{ background: "var(--grd)", border: "1px solid rgba(52,211,153,.2)", borderRadius: 12, padding: "18px 22px" }}>
          <div style={{ color: "var(--green)", fontWeight: 700, marginBottom: 4 }}>✓ Bugün için tekrar yok!</div>
          <div style={{ color: "var(--t2)", fontSize: ".8rem" }}>Tüm tekrarlarını tamamladın veya henüz çalışılmış konu yok.</div>
        </div>
      )}

      {/* Upcoming */}
      {upcomingList.length > 0 && (
        <div className="card">
          <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--teal)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>
            📅 Yaklaşan Tekrarlar ({upcomingList.length})
          </div>
          {upcomingList.sort((a, b) => (a.sr?.nextDate || "").localeCompare(b.sr?.nextDate || "")).slice(0, 10).map((t) => (
            <div key={t.name} className="sr-item">
              <span style={{ fontSize: "1rem" }}>{t.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: ".82rem", fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                <div style={{ fontSize: ".68rem", color: "var(--t2)" }}>{t.cat} · {t.sr?.studyCount || 0}× çalışıldı</div>
              </div>
              <span style={{ fontSize: ".72rem", color: "var(--teal)", background: "var(--td)", padding: "2px 8px", borderRadius: 12, fontWeight: 700 }}>
                {t.sr?.nextDate}
              </span>
              <button className="btn btn-ghost sm" onClick={() => openNote(t.name)}>Oku</button>
            </div>
          ))}
        </div>
      )}

      {/* SR intervals info */}
      <div className="card">
        <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>
          SM-2 Aralıklı Tekrar Sistemi
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SR_INTERVALS.map((d, i) => (
            <div key={i} style={{ textAlign: "center", background: "var(--ink3)", borderRadius: 9, padding: "9px 14px" }}>
              <div style={{ fontFamily: "Playfair Display, serif", fontSize: "1.2rem", fontWeight: 900, color: "var(--teal)" }}>{d}</div>
              <div style={{ fontSize: ".62rem", color: "var(--t2)", marginTop: 2 }}>Gün {i === 0 ? "· İlk" : `· Sev.${i}`}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: ".76rem", color: "var(--t2)", marginTop: 10 }}>
          Her konu okunduğunda bir sonraki tekrar tarihi otomatik hesaplanır.
        </div>
      </div>

      {/* AI Study Plan */}
      <div className="card">
        <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 14 }}>
          ✦ AI Çalışma Planı {!isPro() && <span style={{ color: "var(--ac)", marginLeft: 6 }}>— PRO</span>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: ".7rem", fontWeight: 800, color: "var(--t3)", marginBottom: 6, textTransform: "uppercase" }}>TUS Tarihi</div>
            <input
              type="date"
              value={tusDate}
              onChange={(e) => setTusDate(e.target.value)}
              style={{
                width: "100%", padding: "8px 10px", background: "var(--ink3)",
                border: "1px solid var(--line2)", borderRadius: 9, color: "var(--text)",
                fontFamily: "Syne, sans-serif", fontSize: ".82rem",
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: ".7rem", fontWeight: 800, color: "var(--t3)", marginBottom: 6, textTransform: "uppercase" }}>Günlük Saat</div>
            <select
              value={hoursPerDay}
              onChange={(e) => setHoursPerDay(parseInt(e.target.value))}
              style={{
                width: "100%", padding: "8px 10px", background: "var(--ink3)",
                border: "1px solid var(--line2)", borderRadius: 9, color: "var(--text)",
                fontFamily: "Syne, sans-serif", fontSize: ".82rem",
              }}
            >
              {[1, 2, 3, 4, 5, 6, 8].map((h) => <option key={h} value={h}>{h} saat</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: ".7rem", fontWeight: 800, color: "var(--t3)", marginBottom: 6, textTransform: "uppercase" }}>Strateji</div>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as typeof strategy)}
              style={{
                width: "100%", padding: "8px 10px", background: "var(--ink3)",
                border: "1px solid var(--line2)", borderRadius: 9, color: "var(--text)",
                fontFamily: "Syne, sans-serif", fontSize: ".82rem",
              }}
            >
              <option value="dengeli">Dengeli</option>
              <option value="zayif">Zayıf konulara odak</option>
              <option value="guclu">Güçlü konuları pekiştir</option>
            </select>
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={generatePlan}
          disabled={planLoading || !isPro()}
        >
          {planLoading ? <><span className="spin" />Plan Hazırlanıyor...</> : "✦ AI Plan Oluştur"}
        </button>

        {!isPro() && (
          <div style={{ marginTop: 10, fontSize: ".76rem", color: "var(--t2)" }}>
            AI çalışma planı sadece Pro kullanıcılara açıktır.{" "}
            <button
              style={{ background: "none", border: "none", color: "var(--ac)", cursor: "pointer", fontWeight: 700 }}
              onClick={() => setCurrentPage("pricing")}
            >
              Planları gör →
            </button>
          </div>
        )}

        {planHtml && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button className="btn btn-ghost sm" onClick={() => window.print()}>🖨️ Yazdır / PDF</button>
              <button className="btn btn-ghost sm" onClick={() => setPlanHtml(null)}>✕ Kapat</button>
            </div>
            <div className="plan-output" dangerouslySetInnerHTML={{ __html: planHtml }} />
          </div>
        )}
      </div>
    </div>
  );
}
