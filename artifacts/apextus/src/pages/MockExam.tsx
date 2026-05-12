import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { mistralJSON, mistralText, parseJSON } from "@/lib/mistral";
import { TREE, soruTipleri } from "@/lib/data";
import { fbGetQuestions, fbSaveQuestions, QuizQuestion } from "@/lib/firestore";
import { toDay, prevDay } from "@/lib/utils";
import { toast } from "sonner";

interface Q extends QuizQuestion { _fid?: string; }

interface CatResult {
  cat: string;
  icon: string;
  total: number;
  correct: number;
}

type Phase = "setup" | "generating" | "quiz" | "result";

const COUNTS = [10, 20, 30, 40];

export default function MockExam() {
  const { state, saveState, markSeenQ } = useApp();

  const [phase, setPhase] = useState<Phase>("setup");
  const [selectedCats, setSelectedCats] = useState<string[]>(TREE.map((b) => b.cat));
  const [totalCount, setTotalCount] = useState(20);
  const [diff, setDiff] = useState("Orta");

  const [questions, setQuestions] = useState<Q[]>([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [answers, setAnswers] = useState<{ q: Q; sel: number; correct: boolean }[]>([]);

  const [genProgress, setGenProgress] = useState({ done: 0, total: 0, cat: "" });
  const [planHtml, setPlanHtml] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);

  function toggleCat(cat: string) {
    setSelectedCats((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  function selectAll() { setSelectedCats(TREE.map((b) => b.cat)); }
  function clearAll() { setSelectedCats([]); }

  async function startExam() {
    if (selectedCats.length === 0) { toast.error("En az bir kategori seçin"); return; }

    const perCat = Math.max(1, Math.floor(totalCount / selectedCats.length));
    const allQs: Q[] = [];

    setGenProgress({ done: 0, total: selectedCats.length, cat: "" });
    setPhase("generating");

    for (let i = 0; i < selectedCats.length; i++) {
      const cat = selectedCats[i];
      const catIcon = TREE.find((b) => b.cat === cat)?.icon || "";
      setGenProgress({ done: i, total: selectedCats.length, cat: `${catIcon} ${cat}` });

      const needed = i === selectedCats.length - 1
        ? totalCount - allQs.length
        : perCat;
      if (needed <= 0) break;

      try {
        const cached = await fbGetQuestions(cat, diff, needed, state.seenQ || {});
        if (cached.length >= Math.min(needed, 2)) {
          allQs.push(...cached.slice(0, needed));
          markSeenQ(cached.map((q) => q._fid!).filter(Boolean));
          continue;
        }

        const topics = (TREE.find((b) => b.cat === cat)?.topics || [])
          .sort(() => Math.random() - 0.5)
          .slice(0, 4);
        const tiplar = soruTipleri.sort(() => Math.random() - 0.5).slice(0, Math.min(needed, soruTipleri.length));

        const prompt = `Sen deneyimli bir TUS sınavı hazırlayıcısısın. Aşağıdaki konu(lar) için TUS sınavına çıkabilecek kalitede ${needed} soru üret.

KATEGORİ: ${cat}
KONULAR: ${topics.join(", ")}
ZORLUK: ${diff}
SORU TİPLERİ: ${tiplar.join(", ")}

Her soru için TUS tarzında gerçekçi klinik vaka yaz. 5 şık, 1 doğru cevap. Türkçe yaz.

JSON formatı (başka hiçbir şey yazma):
{
  "questions": [
    {
      "vaka": "65 yaşında erkek hasta...",
      "soru": "Bu hastanın en olası tanısı nedir?",
      "opts": ["A seçeneği", "B seçeneği", "C seçeneği", "D seçeneği", "E seçeneği"],
      "ans": 2,
      "exp": "Doğru cevap B'dir çünkü...",
      "cat": "${cat}",
      "diff": "${diff}",
      "tags": ["${topics[0]}"]
    }
  ]
}

Cevap indeksi 0-4 arasında olmalı. ${needed} adet soru üret.`;

        const raw = await mistralJSON(prompt, 8000, 0.75);
        const parsed = parseJSON(raw) as { questions?: Q[] };
        const qs: Q[] = (parsed?.questions || [])
          .map((q) => ({ ...q, opts: (q.opts || []).slice(0, 5), ans: Math.min(Math.max(0, q.ans || 0), (q.opts?.length || 5) - 1) }))
          .slice(0, needed);

        if (qs.length) {
          allQs.push(...qs);
          fbSaveQuestions(cat, diff, qs)
            .then((ids) => { if (ids.length) markSeenQ(ids); })
            .catch(() => {});
        }
      } catch (e) {
        toast.error(`${cat} soruları yüklenemedi, atlanıyor`);
      }
    }

    setGenProgress({ done: selectedCats.length, total: selectedCats.length, cat: "" });

    if (allQs.length === 0) {
      toast.error("Hiç soru üretilemedi");
      setPhase("setup");
      return;
    }

    const shuffled = allQs.sort(() => Math.random() - 0.5);
    setQuestions(shuffled);
    setCurrent(0);
    setSelected(null);
    setAnswered(false);
    setAnswers([]);
    setPlanHtml(null);
    setPhase("quiz");
  }

  function handleSelect(idx: number) {
    if (answered) return;
    setSelected(idx);
    setAnswered(true);

    const q = questions[current];
    const correct = idx === q.ans;

    const today = toDay();
    const newState = { ...state };
    newState.total = (newState.total || 0) + 1;
    if (correct) newState.correct = (newState.correct || 0) + 1;
    else {
      newState.mistakes = { ...newState.mistakes };
      newState.mistakes[q.tags?.[0] || q.cat || "Genel"] = (newState.mistakes[q.tags?.[0] || q.cat || "Genel"] || 0) + 1;
    }
    newState.byCat = { ...newState.byCat };
    const catKey = q.cat || "Genel";
    if (!newState.byCat[catKey]) newState.byCat[catKey] = { a: 0, c: 0 };
    newState.byCat[catKey].a += 1;
    if (correct) newState.byCat[catKey].c += 1;
    if (newState.lastDate !== today) {
      newState.streak = (newState.lastDate === prevDay()) ? (newState.streak || 0) + 1 : 1;
      newState.lastDate = today;
    }
    saveState(newState);

    setAnswers((prev) => [...prev, { q, sel: idx, correct }]);
  }

  function handleNext() {
    if (current + 1 >= questions.length) {
      setPhase("result");
      return;
    }
    setCurrent((v) => v + 1);
    setSelected(null);
    setAnswered(false);
  }

  function getCatResults(): CatResult[] {
    const map: Record<string, CatResult> = {};
    answers.forEach(({ q, correct }) => {
      const cat = q.cat || "Genel";
      if (!map[cat]) {
        const icon = TREE.find((b) => b.cat === cat)?.icon || "📋";
        map[cat] = { cat, icon, total: 0, correct: 0 };
      }
      map[cat].total += 1;
      if (correct) map[cat].correct += 1;
    });
    return Object.values(map).sort((a, b) => (a.correct / a.total) - (b.correct / b.total));
  }

  async function generateStudyPlan() {
    setPlanLoading(true);
    try {
      const catResults = getCatResults();
      const weakCats = catResults.filter((r) => r.total > 0 && (r.correct / r.total) < 0.7);
      const overallScore = answers.length > 0
        ? Math.round((answers.filter((a) => a.correct).length / answers.length) * 100)
        : 0;

      const catSummary = catResults
        .map((r) => `${r.cat}: ${r.correct}/${r.total} (${Math.round((r.correct / r.total) * 100)}%)`)
        .join("\n");

      const prompt = `TUS hazırlık uzmanı olarak aşağıdaki deneme sınavı sonuçlarına göre kişiselleştirilmiş bir çalışma planı oluştur.

GENEL BAŞARI: %${overallScore} (${answers.filter((a) => a.correct).length}/${answers.length} doğru)
ZORLUK SEVİYESİ: ${diff}

KATEGORİ SONUÇLARI:
${catSummary}

ZAYIF KATEGORİLER: ${weakCats.map((c) => c.cat).join(", ") || "Yok (tebrikler!)"}

Aşağıdaki HTML formatında çalışma planı oluştur. Türkçe yaz. Gerçekçi ve klinik detaylarla açıkla:

<div class="tip"><strong>🎯 Genel Değerlendirme:</strong> [Genel performans yorumu]</div>
<div class="tip" style="border-left-color:var(--ac)"><strong>🔴 Öncelikli Konular (Bu Hafta):</strong>
<ul>
  <li><strong>[Kategori]:</strong> [Hangi konulara odaklan, neden eksik, nasıl çalış]</li>
</ul>
</div>
<div class="tip" style="border-left-color:var(--gold)"><strong>🟡 Güçlendirilecek Konular (2. Hafta):</strong>
<ul>
  <li><strong>[Kategori]:</strong> [Tavsiye]</li>
</ul>
</div>
<div class="tip" style="border-left-color:var(--teal)"><strong>✅ Güçlü Yönler:</strong> [Başarılı kategoriler + pekiştirme önerileri]</div>
<div class="tip" style="border-left-color:var(--purple)"><strong>📅 Haftalık Plan:</strong>
<ul>
  <li><strong>Pazartesi-Salı:</strong> ...</li>
  <li><strong>Çarşamba-Perşembe:</strong> ...</li>
  <li><strong>Cuma-Cumartesi:</strong> ...</li>
  <li><strong>Pazar:</strong> Deneme tekrarı + eksik konular</li>
</ul>
</div>

Sadece HTML yaz, başka açıklama yapma.`;

      const raw = await mistralText(prompt, 4000, 0.7);
      const cleaned = raw
        .replace(/^```(?:html)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
      setPlanHtml(cleaned);
    } catch (e) {
      toast.error("Plan oluşturulamadı: " + (e as Error).message);
    } finally {
      setPlanLoading(false);
    }
  }

  const totalScore = answers.filter((a) => a.correct).length;
  const pct = answers.length > 0 ? Math.round((totalScore / answers.length) * 100) : 0;

  if (phase === "setup") {
    return (
      <div style={{ maxWidth: 720 }}>
        <div style={{ fontFamily: "Playfair Display, serif", fontSize: "1.6rem", fontWeight: 900, color: "var(--cream)", marginBottom: 6 }}>
          Deneme Sınavı
        </div>
        <div style={{ color: "var(--t2)", fontSize: ".82rem", marginBottom: 28 }}>
          Çoklu kategoriden gerçekçi TUS soruları — sonuçlara göre AI çalışma planı al
        </div>

        {/* Category selection */}
        <div className="card" style={{ marginBottom: 18, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontSize: ".85rem", fontWeight: 700, color: "var(--cream)" }}>Kategoriler</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost sm" onClick={selectAll} style={{ fontSize: ".72rem" }}>Tümünü Seç</button>
              <button className="btn btn-ghost sm" onClick={clearAll} style={{ fontSize: ".72rem" }}>Temizle</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(185px, 1fr))", gap: 8 }}>
            {TREE.map((b) => {
              const on = selectedCats.includes(b.cat);
              return (
                <button
                  key={b.cat}
                  onClick={() => toggleCat(b.cat)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 12px", borderRadius: 9, border: "none", cursor: "pointer",
                    background: on ? "rgba(232,83,74,.15)" : "rgba(255,255,255,.04)",
                    color: on ? "var(--ac)" : "var(--t2)",
                    fontFamily: "Syne, sans-serif", fontSize: ".78rem", fontWeight: on ? 700 : 500,
                    textAlign: "left", transition: "all .12s",
                    outline: on ? "1px solid rgba(232,83,74,.35)" : "1px solid transparent",
                  }}
                >
                  <span>{b.icon}</span>
                  <span style={{ flex: 1 }}>{b.cat}</span>
                  {on && <span style={{ fontSize: ".65rem", color: "var(--ac)" }}>✓</span>}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 12, fontSize: ".73rem", color: "var(--t3)" }}>
            {selectedCats.length} kategori seçildi · ~{selectedCats.length > 0 ? Math.max(1, Math.floor(totalCount / selectedCats.length)) : 0} soru/kategori
          </div>
        </div>

        {/* Settings */}
        <div className="card" style={{ marginBottom: 24, padding: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div>
              <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", marginBottom: 10 }}>Toplam Soru</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {COUNTS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setTotalCount(c)}
                    style={{
                      padding: "6px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                      background: totalCount === c ? "var(--ac)" : "rgba(255,255,255,.07)",
                      color: totalCount === c ? "#fff" : "var(--t2)",
                      fontFamily: "Syne, sans-serif", fontSize: ".8rem", fontWeight: 700,
                      transition: "all .12s",
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", marginBottom: 10 }}>Zorluk</div>
              <div style={{ display: "flex", gap: 8 }}>
                {["Kolay", "Orta", "Zor"].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDiff(d)}
                    style={{
                      padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                      background: diff === d ? "var(--teal)" : "rgba(255,255,255,.07)",
                      color: diff === d ? "#fff" : "var(--t2)",
                      fontFamily: "Syne, sans-serif", fontSize: ".8rem", fontWeight: 700,
                      transition: "all .12s",
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <button
          className="btn btn-primary"
          style={{ width: "100%", justifyContent: "center", padding: "14px 24px", fontSize: "1rem" }}
          onClick={startExam}
          disabled={selectedCats.length === 0}
        >
          🎯 Denemeyi Başlat — {totalCount} Soru
        </button>
      </div>
    );
  }

  if (phase === "generating") {
    const pctDone = genProgress.total > 0 ? Math.round((genProgress.done / genProgress.total) * 100) : 0;
    return (
      <div className="loading-screen" style={{ minHeight: "60vh" }}>
        <div className="loading-orb">📝</div>
        <div className="loading-title">Sorular Hazırlanıyor</div>
        <div style={{ color: "var(--teal)", fontSize: ".82rem", marginTop: 8, fontWeight: 600 }}>
          {genProgress.cat || "Başlıyor..."}<span className="loading-dots" />
        </div>
        <div style={{ width: 260, marginTop: 18 }}>
          <div className="progress-bar" style={{ height: 8, borderRadius: 6 }}>
            <div
              className="progress-fill"
              style={{ width: `${pctDone}%`, background: "var(--teal)", transition: "width .5s" }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".7rem", color: "var(--t3)", marginTop: 6 }}>
            <span>{genProgress.done}/{genProgress.total} kategori</span>
            <span>%{pctDone}</span>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "quiz") {
    const q = questions[current];
    const opts = ["A", "B", "C", "D", "E"];
    const progress = Math.round(((current + (answered ? 1 : 0)) / questions.length) * 100);

    return (
      <div style={{ maxWidth: 740 }}>
        {/* Progress bar */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".75rem", color: "var(--t2)", marginBottom: 6 }}>
            <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 700 }}>
              {current + 1} / {questions.length}
            </span>
            <span style={{ color: "var(--teal)", fontWeight: 700 }}>
              {answers.filter((a) => a.correct).length} doğru · {answers.filter((a) => !a.correct).length} yanlış
            </span>
          </div>
          <div className="progress-bar" style={{ height: 6, borderRadius: 4 }}>
            <div
              className="progress-fill"
              style={{ width: `${progress}%`, background: "linear-gradient(90deg,var(--teal),var(--blue))", transition: "width .3s" }}
            />
          </div>
        </div>

        {/* Category tag */}
        <div style={{ marginBottom: 14 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            background: "rgba(45,212,191,.12)", border: "1px solid rgba(45,212,191,.22)",
            color: "var(--teal)", fontSize: ".7rem", fontWeight: 800,
            padding: "3px 10px", borderRadius: 20, fontFamily: "Syne, sans-serif",
          }}>
            {TREE.find((b) => b.cat === q.cat)?.icon || "📋"} {q.cat || "Genel"}
          </span>
        </div>

        {/* Case */}
        <div className="card" style={{ padding: 20, marginBottom: 16, borderLeft: "3px solid var(--blue)" }}>
          <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--blue)", textTransform: "uppercase", marginBottom: 8, letterSpacing: ".06em" }}>
            Klinik Vaka
          </div>
          <div style={{ fontSize: ".88rem", color: "var(--text)", lineHeight: 1.65 }}>{q.vaka}</div>
        </div>

        {/* Question */}
        <div style={{ fontSize: ".95rem", fontWeight: 700, color: "var(--cream)", marginBottom: 16, lineHeight: 1.5 }}>
          {q.soru}
        </div>

        {/* Options */}
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 20 }}>
          {(q.opts || []).map((opt, i) => {
            let bg = "rgba(255,255,255,.05)";
            let color = "var(--text)";
            let border = "1px solid var(--line)";
            if (answered) {
              if (i === q.ans) { bg = "rgba(16,185,129,.15)"; color = "var(--green)"; border = "1px solid rgba(16,185,129,.4)"; }
              else if (i === selected && i !== q.ans) { bg = "rgba(232,83,74,.12)"; color = "var(--ac)"; border = "1px solid rgba(232,83,74,.3)"; }
            } else if (selected === i) {
              bg = "rgba(45,212,191,.12)"; color = "var(--teal)"; border = "1px solid rgba(45,212,191,.3)";
            }
            return (
              <button
                key={i}
                onClick={() => handleSelect(i)}
                disabled={answered}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  padding: "12px 16px", borderRadius: 10, border, cursor: answered ? "default" : "pointer",
                  background: bg, color, fontFamily: "Syne, sans-serif", fontSize: ".84rem",
                  fontWeight: 500, textAlign: "left", transition: "all .12s",
                }}
              >
                <span style={{ fontWeight: 900, flexShrink: 0, width: 18, marginTop: 1 }}>{opts[i]}.</span>
                <span style={{ lineHeight: 1.5 }}>{opt}</span>
                {answered && i === q.ans && <span style={{ marginLeft: "auto", flexShrink: 0 }}>✓</span>}
              </button>
            );
          })}
        </div>

        {/* Explanation */}
        {answered && (
          <div
            className="card"
            style={{
              padding: "14px 18px", marginBottom: 16,
              borderLeft: `3px solid ${selected === q.ans ? "var(--green)" : "var(--ac)"}`,
              background: selected === q.ans ? "rgba(16,185,129,.07)" : "rgba(232,83,74,.07)",
            }}
          >
            <div style={{ fontSize: ".72rem", fontWeight: 800, color: selected === q.ans ? "var(--green)" : "var(--ac)", textTransform: "uppercase", marginBottom: 6, letterSpacing: ".05em" }}>
              {selected === q.ans ? "✓ Doğru" : "✗ Yanlış"}
            </div>
            <div style={{ fontSize: ".83rem", color: "var(--text)", lineHeight: 1.6 }}>{q.exp}</div>
          </div>
        )}

        {answered && (
          <button
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={handleNext}
          >
            {current + 1 < questions.length ? "Sonraki Soru →" : "Sonuçları Gör"}
          </button>
        )}
      </div>
    );
  }

  if (phase === "result") {
    const catResults = getCatResults();
    const wrongCount = answers.filter((a) => !a.correct).length;
    const scoreColor = pct >= 70 ? "var(--green)" : pct >= 50 ? "var(--gold)" : "var(--ac)";

    return (
      <div style={{ maxWidth: 720 }}>
        {/* Header */}
        <div style={{ fontFamily: "Playfair Display, serif", fontSize: "1.5rem", fontWeight: 900, color: "var(--cream)", marginBottom: 4 }}>
          Sınav Sonucu
        </div>
        <div style={{ color: "var(--t2)", fontSize: ".82rem", marginBottom: 22 }}>{diff} zorluk · {answers.length} soru</div>

        {/* Score */}
        <div className="card" style={{ padding: 24, marginBottom: 20, textAlign: "center" }}>
          <div style={{ fontSize: "3.2rem", fontWeight: 900, fontFamily: "Playfair Display, serif", color: scoreColor, lineHeight: 1 }}>
            %{pct}
          </div>
          <div style={{ color: "var(--t2)", fontSize: ".85rem", marginTop: 8 }}>
            {totalScore} doğru · {wrongCount} yanlış · {answers.length} toplam
          </div>
          <div style={{ marginTop: 16 }}>
            <div className="progress-bar" style={{ height: 10, borderRadius: 6 }}>
              <div
                className="progress-fill"
                style={{ width: `${pct}%`, background: scoreColor, transition: "width 1s" }}
              />
            </div>
          </div>
          <div style={{ marginTop: 12, fontSize: ".82rem", fontWeight: 700, color: scoreColor }}>
            {pct >= 70 ? "🎉 Harika! Çok iyi bir sonuç." : pct >= 50 ? "👍 İyi gidiyorsunuz. Zayıf konulara odaklanın." : "📚 Tekrara ihtiyaç var. Çalışma planı oluşturun."}
          </div>
        </div>

        {/* Category breakdown */}
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: ".85rem", fontWeight: 700, color: "var(--cream)", marginBottom: 16 }}>
            Kategori Analizi
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {catResults.map((r) => {
              const p = r.total > 0 ? Math.round((r.correct / r.total) * 100) : 0;
              const col = p >= 70 ? "var(--green)" : p >= 50 ? "var(--gold)" : "var(--ac)";
              return (
                <div key={r.cat}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: ".8rem", color: "var(--text)" }}>
                      <span>{r.icon}</span>
                      <span style={{ fontWeight: 600 }}>{r.cat}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: ".72rem", color: "var(--t2)" }}>{r.correct}/{r.total}</span>
                      <span style={{ fontSize: ".78rem", fontWeight: 800, color: col, minWidth: 34, textAlign: "right" }}>%{p}</span>
                    </div>
                  </div>
                  <div className="progress-bar" style={{ height: 5, borderRadius: 4 }}>
                    <div className="progress-fill" style={{ width: `${p}%`, background: col }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI Study Plan */}
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: ".85rem", fontWeight: 700, color: "var(--cream)", marginBottom: 10 }}>
            🤖 AI Çalışma Planı
          </div>
          {!planHtml && !planLoading && (
            <>
              <div style={{ fontSize: ".78rem", color: "var(--t2)", marginBottom: 14 }}>
                Sınav sonuçlarına göre kişiselleştirilmiş çalışma planı oluşturun
              </div>
              <button className="btn btn-primary" onClick={generateStudyPlan}>
                ✨ Çalışma Planı Oluştur
              </button>
            </>
          )}
          {planLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", color: "var(--teal)", fontSize: ".82rem", fontWeight: 600 }}>
              <span className="spin" />
              Plan hazırlanıyor, yaklaşık 30 saniye<span className="loading-dots" />
            </div>
          )}
          {planHtml && (
            <div
              className="note-content"
              dangerouslySetInnerHTML={{ __html: planHtml }}
            />
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 12 }}>
          <button
            className="btn btn-primary"
            style={{ flex: 1, justifyContent: "center" }}
            onClick={() => { setPhase("setup"); setPlanHtml(null); }}
          >
            ↺ Yeni Deneme
          </button>
          <button
            className="btn btn-ghost"
            style={{ flex: 1, justifyContent: "center" }}
            onClick={() => { setPhase("quiz"); setCurrent(0); setAnswered(false); setSelected(null); }}
          >
            📖 Soruları Tekrar İncele
          </button>
        </div>
      </div>
    );
  }

  return null;
}
