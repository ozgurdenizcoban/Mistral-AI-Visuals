import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { mistralJSON, mistralText, parseJSON } from "@/lib/mistral";
import { TREE, soruTipleri, TUS_KLINIK_WEIGHTS } from "@/lib/data";
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

type Phase = "setup" | "generating" | "quiz" | "review" | "result";

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

  /* ---- helpers ---- */
  function toggleCat(cat: string) {
    setSelectedCats((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }
  function selectAll() { setSelectedCats(TREE.map((b) => b.cat)); }
  function clearAll() { setSelectedCats([]); }

  /* ---- TUS ağırlıklı dağılım hesapla ---- */
  function buildWeightedDist(): Record<string, number> {
    const totalWeight = selectedCats.reduce((s, c) => s + (TUS_KLINIK_WEIGHTS[c] || 5), 0);
    const dist: Record<string, number> = {};
    let assigned = 0;
    for (let i = 0; i < selectedCats.length; i++) {
      const cat = selectedCats[i];
      const isLast = i === selectedCats.length - 1;
      if (isLast) {
        dist[cat] = Math.max(1, totalCount - assigned);
      } else {
        const count = Math.max(1, Math.round((TUS_KLINIK_WEIGHTS[cat] || 5) / totalWeight * totalCount));
        dist[cat] = count;
        assigned += count;
      }
    }
    return dist;
  }

  /* ---- generate ---- */
  async function startExam() {
    if (selectedCats.length === 0) { toast.error("En az bir kategori seçin"); return; }

    const dist = buildWeightedDist();
    const allQs: Q[] = [];

    setGenProgress({ done: 0, total: selectedCats.length, cat: "" });
    setPhase("generating");

    for (let i = 0; i < selectedCats.length; i++) {
      const cat = selectedCats[i];
      const catIcon = TREE.find((b) => b.cat === cat)?.icon || "";
      setGenProgress({ done: i, total: selectedCats.length, cat: `${catIcon} ${cat}` });

      const needed = dist[cat] ?? 1;
      if (needed <= 0) continue;

      try {
        const cached = await fbGetQuestions(cat, diff, needed, state.seenQ || {});
        if (cached.length >= Math.min(needed, 2)) {
          allQs.push(...cached.slice(0, needed));
          markSeenQ(cached.map((q) => q._fid!).filter(Boolean));
          continue;
        }

        const topics = (TREE.find((b) => b.cat === cat)?.topics || [])
          .sort(() => Math.random() - 0.5).slice(0, 4);
        const tiplar = soruTipleri.sort(() => Math.random() - 0.5).slice(0, Math.min(needed, soruTipleri.length));

        const prompt = `Sen deneyimli bir TUS sınavı hazırlayıcısısın. ${cat} kategorisinden TUS sınavına çıkabilecek kalitede ${needed} soru üret.

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
      "opts": ["A", "B", "C", "D", "E"],
      "ans": 2,
      "exp": "Doğru cevap B çünkü...",
      "cat": "${cat}",
      "diff": "${diff}",
      "tags": ["${topics[0]}"]
    }
  ]
}

Cevap indeksi 0-4. ${needed} soru üret.`;

        const raw = await mistralJSON(prompt, 8000, 0.75);
        const parsed = parseJSON(raw) as { questions?: Q[] };
        const qs: Q[] = (parsed?.questions || [])
          .map((q) => ({ ...q, opts: (q.opts || []).slice(0, 5), ans: Math.min(Math.max(0, q.ans || 0), (q.opts?.length || 5) - 1) }))
          .slice(0, needed);

        if (qs.length) {
          allQs.push(...qs);
          fbSaveQuestions(cat, diff, qs).then((ids) => { if (ids.length) markSeenQ(ids); }).catch(() => {});
        }
      } catch {
        toast.error(`${cat} soruları atlandı`);
      }
    }

    if (allQs.length === 0) { toast.error("Hiç soru üretilemedi"); setPhase("setup"); return; }

    setQuestions(allQs.sort(() => Math.random() - 0.5));
    setCurrent(0);
    setSelected(null);
    setAnswered(false);
    setAnswers([]);
    setPlanHtml(null);
    setPhase("quiz");
  }

  /* ---- quiz interactions ---- */
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
    if (current + 1 >= questions.length) { setPhase("result"); return; }
    setCurrent((v) => v + 1);
    setSelected(null);
    setAnswered(false);
  }

  /* ---- results ---- */
  function getCatResults(): CatResult[] {
    const map: Record<string, CatResult> = {};
    answers.forEach(({ q, correct }) => {
      const cat = q.cat || "Genel";
      if (!map[cat]) { map[cat] = { cat, icon: TREE.find((b) => b.cat === cat)?.icon || "📋", total: 0, correct: 0 }; }
      map[cat].total += 1;
      if (correct) map[cat].correct += 1;
    });
    return Object.values(map).sort((a, b) => (a.correct / a.total) - (b.correct / b.total));
  }

  async function generateStudyPlan() {
    setPlanLoading(true);
    try {
      const catResults = getCatResults();
      const overallScore = answers.length > 0 ? Math.round((answers.filter((a) => a.correct).length / answers.length) * 100) : 0;
      const catSummary = catResults.map((r) => `${r.cat}: ${r.correct}/${r.total} (%${Math.round((r.correct / r.total) * 100)})`).join("\n");
      const weakCats = catResults.filter((r) => (r.correct / r.total) < 0.6);
      const medCats = catResults.filter((r) => (r.correct / r.total) >= 0.6 && (r.correct / r.total) < 0.8);
      const strongCats = catResults.filter((r) => (r.correct / r.total) >= 0.8);

      const prompt = `TUS hazırlık uzmanısın. Aşağıdaki deneme sınavı sonuçlarına göre kişiselleştirilmiş haftalık çalışma planı oluştur.

GENEL BAŞARI: %${overallScore} (${answers.filter((a) => a.correct).length}/${answers.length})
ZORLUK: ${diff}
KATEGORİ SONUÇLARI:\n${catSummary}

Türkçe yaz. Aşağıdaki HTML yapısını AYNEN kullan, içerikleri doldur:

<div class="plan-summary">
  <div class="plan-summary-card plan-card-red">
    <div class="plan-card-icon">🔴</div>
    <div class="plan-card-label">Öncelikli</div>
    <div class="plan-card-cats">${weakCats.map((c) => c.cat).join(" · ") || "—"}</div>
  </div>
  <div class="plan-summary-card plan-card-gold">
    <div class="plan-card-icon">🟡</div>
    <div class="plan-card-label">Geliştirilecek</div>
    <div class="plan-card-cats">${medCats.map((c) => c.cat).join(" · ") || "—"}</div>
  </div>
  <div class="plan-summary-card plan-card-teal">
    <div class="plan-card-icon">✅</div>
    <div class="plan-card-label">Güçlü</div>
    <div class="plan-card-cats">${strongCats.map((c) => c.cat).join(" · ") || "—"}</div>
  </div>
</div>

<p style="font-size:.82rem;color:var(--t2);margin:16px 0 12px">[2-3 cümle genel değerlendirme ve strateji]</p>

<table class="plan-table">
  <thead><tr><th>Gün</th><th>Odak Konu</th><th>Çalışma Şekli</th><th>Hedef</th></tr></thead>
  <tbody>
    <tr><td>Pazartesi</td><td>[Zayıf kategori/konu]</td><td>[Nasıl çalışılacak]</td><td>[Somut hedef]</td></tr>
    <tr><td>Salı</td><td>...</td><td>...</td><td>...</td></tr>
    <tr><td>Çarşamba</td><td>...</td><td>...</td><td>...</td></tr>
    <tr><td>Perşembe</td><td>...</td><td>...</td><td>...</td></tr>
    <tr><td>Cuma</td><td>...</td><td>...</td><td>...</td></tr>
    <tr><td>Cumartesi</td><td>...</td><td>...</td><td>...</td></tr>
    <tr><td>Pazar</td><td>Tekrar + Deneme</td><td>Haftalık konuları gözden geçir, yeni deneme çöz</td><td>%80 hedef</td></tr>
  </tbody>
</table>

<div class="tip" style="margin-top:16px;border-left-color:var(--purple)"><strong>💡 TUS İpucu:</strong> [Bu sınav profiline özel pratik TUS stratejisi]</div>

Sadece HTML yaz.`;

      const raw = await mistralText(prompt, 4000, 0.7);
      setPlanHtml(raw.replace(/^```(?:html)?\s*/i, "").replace(/\s*```\s*$/, "").trim());
    } catch (e) {
      toast.error("Plan oluşturulamadı: " + (e as Error).message);
    } finally {
      setPlanLoading(false);
    }
  }

  const totalScore = answers.filter((a) => a.correct).length;
  const pct = answers.length > 0 ? Math.round((totalScore / answers.length) * 100) : 0;

  /* ================================================================ SETUP */
  if (phase === "setup") {
    return (
      <div style={{ maxWidth: 720 }}>
        <div style={{ fontFamily: "Playfair Display, serif", fontSize: "1.6rem", fontWeight: 900, color: "var(--cream)", marginBottom: 6 }}>
          Deneme Sınavı
        </div>
        <div style={{ color: "var(--t2)", fontSize: ".82rem", marginBottom: 28 }}>
          Çoklu kategoriden TUS tarzı sorular — bitince AI çalışma planı al
        </div>

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
                <button key={b.cat} onClick={() => toggleCat(b.cat)} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 12px", borderRadius: 9, border: "none", cursor: "pointer",
                  background: on ? "rgba(232,83,74,.15)" : "rgba(255,255,255,.04)",
                  color: on ? "var(--ac)" : "var(--t2)",
                  fontFamily: "Syne, sans-serif", fontSize: ".78rem", fontWeight: on ? 700 : 500,
                  textAlign: "left", transition: "all .12s",
                  outline: on ? "1px solid rgba(232,83,74,.35)" : "1px solid transparent",
                }}>
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

        <div className="card" style={{ marginBottom: 24, padding: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div>
              <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", marginBottom: 10 }}>Toplam Soru</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {COUNTS.map((c) => (
                  <button key={c} onClick={() => setTotalCount(c)} style={{
                    padding: "6px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                    background: totalCount === c ? "var(--ac)" : "rgba(255,255,255,.07)",
                    color: totalCount === c ? "#fff" : "var(--t2)",
                    fontFamily: "Syne, sans-serif", fontSize: ".8rem", fontWeight: 700, transition: "all .12s",
                  }}>{c}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", marginBottom: 10 }}>Zorluk</div>
              <div style={{ display: "flex", gap: 8 }}>
                {["Kolay", "Orta", "Zor"].map((d) => (
                  <button key={d} onClick={() => setDiff(d)} style={{
                    padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                    background: diff === d ? "var(--teal)" : "rgba(255,255,255,.07)",
                    color: diff === d ? "#fff" : "var(--t2)",
                    fontFamily: "Syne, sans-serif", fontSize: ".8rem", fontWeight: 700, transition: "all .12s",
                  }}>{d}</button>
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

  /* ============================================================ GENERATING */
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
            <div className="progress-fill" style={{ width: `${pctDone}%`, background: "var(--teal)", transition: "width .5s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".7rem", color: "var(--t3)", marginTop: 6 }}>
            <span>{genProgress.done}/{genProgress.total} kategori</span>
            <span>%{pctDone}</span>
          </div>
        </div>
      </div>
    );
  }

  /* ================================================================= QUIZ */
  if (phase === "quiz") {
    const q = questions[current];
    const opts = ["A", "B", "C", "D", "E"];
    const progress = Math.round(((current) / questions.length) * 100);

    return (
      <div style={{ maxWidth: 740 }}>
        {/* Progress */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".75rem", color: "var(--t2)", marginBottom: 6 }}>
            <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 700 }}>
              {current + 1} / {questions.length}
            </span>
            <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 600, color: "var(--t3)" }}>
              {diff} · {TREE.find((b) => b.cat === q.cat)?.icon} {q.cat}
            </span>
          </div>
          <div className="progress-bar" style={{ height: 5, borderRadius: 4 }}>
            <div className="progress-fill" style={{ width: `${progress}%`, background: "linear-gradient(90deg,var(--teal),var(--blue))", transition: "width .3s" }} />
          </div>
        </div>

        {/* Case */}
        <div className="card" style={{ padding: 20, marginBottom: 16, borderLeft: "3px solid var(--blue)" }}>
          <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--blue)", textTransform: "uppercase", marginBottom: 8, letterSpacing: ".06em" }}>Klinik Vaka</div>
          <div style={{ fontSize: ".88rem", color: "var(--text)", lineHeight: 1.65 }}>{q.vaka}</div>
        </div>

        {/* Question */}
        <div style={{ fontSize: ".95rem", fontWeight: 700, color: "var(--cream)", marginBottom: 16, lineHeight: 1.5 }}>{q.soru}</div>

        {/* Options — no color feedback during quiz */}
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 20 }}>
          {(q.opts || []).map((opt, i) => {
            const isSelected = selected === i;
            return (
              <button
                key={i}
                onClick={() => handleSelect(i)}
                disabled={answered}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  padding: "12px 16px", borderRadius: 10, cursor: answered ? "default" : "pointer",
                  border: isSelected ? "1px solid rgba(45,212,191,.5)" : "1px solid var(--line)",
                  background: isSelected ? "rgba(45,212,191,.1)" : "rgba(255,255,255,.04)",
                  color: isSelected ? "var(--teal)" : "var(--text)",
                  fontFamily: "Syne, sans-serif", fontSize: ".84rem", fontWeight: isSelected ? 700 : 500,
                  textAlign: "left", transition: "all .12s",
                }}
              >
                <span style={{ fontWeight: 900, flexShrink: 0, width: 18, marginTop: 1 }}>{opts[i]}.</span>
                <span style={{ lineHeight: 1.5 }}>{opt}</span>
              </button>
            );
          })}
        </div>

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

  /* =============================================================== REVIEW */
  if (phase === "review") {
    const opts = ["A", "B", "C", "D", "E"];
    return (
      <div style={{ maxWidth: 740 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
          <button className="btn btn-ghost sm" onClick={() => setPhase("result")}>← Sonuçlara Dön</button>
          <div style={{ fontFamily: "Playfair Display, serif", fontSize: "1.1rem", fontWeight: 900, color: "var(--cream)" }}>Soru İnceleme</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {answers.map(({ q, sel, correct }, idx) => (
            <div key={idx} className="card" style={{ padding: 18, borderLeft: `3px solid ${correct ? "var(--green)" : "var(--ac)"}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: ".7rem", fontWeight: 800, color: "var(--t3)", fontFamily: "Syne, sans-serif" }}>S{idx + 1}</span>
                <span style={{ fontSize: ".68rem", background: correct ? "rgba(16,185,129,.15)" : "rgba(232,83,74,.12)", color: correct ? "var(--green)" : "var(--ac)", padding: "2px 8px", borderRadius: 20, fontWeight: 800, fontFamily: "Syne, sans-serif" }}>
                  {correct ? "✓ Doğru" : "✗ Yanlış"}
                </span>
                <span style={{ fontSize: ".68rem", color: "var(--t3)", marginLeft: "auto", fontFamily: "Syne, sans-serif" }}>{q.cat}</span>
              </div>
              <div style={{ fontSize: ".8rem", color: "var(--t2)", lineHeight: 1.5, marginBottom: 8 }}>{q.vaka}</div>
              <div style={{ fontSize: ".84rem", fontWeight: 700, color: "var(--cream)", marginBottom: 10 }}>{q.soru}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 10 }}>
                {(q.opts || []).map((opt, i) => (
                  <div key={i} style={{
                    display: "flex", gap: 9, padding: "7px 12px", borderRadius: 8,
                    background: i === q.ans ? "rgba(16,185,129,.12)" : i === sel && i !== q.ans ? "rgba(232,83,74,.08)" : "transparent",
                    color: i === q.ans ? "var(--green)" : i === sel && i !== q.ans ? "var(--ac)" : "var(--t2)",
                    fontSize: ".8rem", fontWeight: i === q.ans ? 700 : 400,
                  }}>
                    <span style={{ fontWeight: 800, flexShrink: 0 }}>{opts[i]}.</span>
                    <span>{opt}</span>
                    {i === q.ans && <span style={{ marginLeft: "auto" }}>← Doğru</span>}
                    {i === sel && i !== q.ans && <span style={{ marginLeft: "auto" }}>← Seçiminiz</span>}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: ".78rem", color: "var(--t2)", lineHeight: 1.55, background: "rgba(255,255,255,.04)", padding: "10px 12px", borderRadius: 8 }}>
                {q.exp}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* =============================================================== RESULT */
  if (phase === "result") {
    const catResults = getCatResults();
    const wrongCount = answers.filter((a) => !a.correct).length;
    const scoreColor = pct >= 70 ? "var(--green)" : pct >= 50 ? "var(--gold)" : "var(--ac)";

    return (
      <div style={{ maxWidth: 720 }}>
        <div style={{ fontFamily: "Playfair Display, serif", fontSize: "1.5rem", fontWeight: 900, color: "var(--cream)", marginBottom: 4 }}>
          Sınav Sonucu
        </div>
        <div style={{ color: "var(--t2)", fontSize: ".82rem", marginBottom: 22 }}>{diff} zorluk · {answers.length} soru</div>

        {/* Score */}
        <div className="card" style={{ padding: 24, marginBottom: 20, textAlign: "center" }}>
          <div style={{ fontSize: "3.5rem", fontWeight: 900, fontFamily: "Playfair Display, serif", color: scoreColor, lineHeight: 1 }}>
            %{pct}
          </div>
          <div style={{ color: "var(--t2)", fontSize: ".85rem", marginTop: 8 }}>
            {totalScore} doğru · {wrongCount} yanlış · {answers.length} toplam
          </div>
          <div style={{ marginTop: 16 }}>
            <div className="progress-bar" style={{ height: 10, borderRadius: 6 }}>
              <div className="progress-fill" style={{ width: `${pct}%`, background: scoreColor, transition: "width 1s" }} />
            </div>
          </div>
          <div style={{ marginTop: 12, fontSize: ".82rem", fontWeight: 700, color: scoreColor }}>
            {pct >= 70 ? "🎉 Harika performans!" : pct >= 50 ? "👍 İyi gidiyorsunuz — zayıf konulara odaklanın." : "📚 Tekrara ihtiyaç var — çalışma planı oluşturun."}
          </div>
        </div>

        {/* Category breakdown — table */}
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: ".85rem", fontWeight: 700, color: "var(--cream)", marginBottom: 14 }}>
            Kategori Analizi
          </div>
          <table className="plan-table" style={{ marginBottom: 0 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Kategori</th>
                <th>Doğru/Toplam</th>
                <th>Başarı</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {catResults.map((r) => {
                const p = r.total > 0 ? Math.round((r.correct / r.total) * 100) : 0;
                const col = p >= 70 ? "var(--green)" : p >= 50 ? "var(--gold)" : "var(--ac)";
                const badge = p >= 70 ? "✅ Güçlü" : p >= 50 ? "🟡 Orta" : "🔴 Zayıf";
                return (
                  <tr key={r.cat}>
                    <td style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span>{r.icon}</span>
                      <span style={{ fontWeight: 600 }}>{r.cat}</span>
                    </td>
                    <td style={{ textAlign: "center", color: "var(--t2)" }}>{r.correct}/{r.total}</td>
                    <td style={{ textAlign: "center", fontWeight: 800, color: col }}>%{p}</td>
                    <td style={{ textAlign: "center", fontSize: ".72rem" }}>{badge}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* AI Study Plan */}
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: ".85rem", fontWeight: 700, color: "var(--cream)", marginBottom: 10 }}>
            🤖 AI Çalışma Planı
          </div>
          {!planHtml && !planLoading && (
            <>
              <div style={{ fontSize: ".78rem", color: "var(--t2)", marginBottom: 14 }}>
                Sınav sonuçlarınıza özel haftalık program + strateji önerileri
              </div>
              <button className="btn btn-primary" onClick={generateStudyPlan}>
                ✨ Çalışma Planı Oluştur
              </button>
            </>
          )}
          {planLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", color: "var(--teal)", fontSize: ".82rem", fontWeight: 600 }}>
              <span className="spin" />Plan hazırlanıyor<span className="loading-dots" />
            </div>
          )}
          {planHtml && (
            <div className="note-content" dangerouslySetInnerHTML={{ __html: planHtml }} />
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 12 }}>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }}
            onClick={() => { setPhase("setup"); setPlanHtml(null); }}>
            ↺ Yeni Deneme
          </button>
          <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center" }}
            onClick={() => setPhase("review")}>
            📖 Soruları İncele
          </button>
        </div>
      </div>
    );
  }

  return null;
}
