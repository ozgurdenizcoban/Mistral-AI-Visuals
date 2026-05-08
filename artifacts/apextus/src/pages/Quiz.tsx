import { useState, useEffect, useRef } from "react";
import { useApp } from "@/contexts/AppContext";
import { mistralJSON, mistralText, parseJSON } from "@/lib/mistral";
import { TREE, soruTipleri, FREE_LIMITS } from "@/lib/data";
import { fbGetQuestions, fbSaveQuestions, fbGetAnalysis, fbSaveAnalysis, QuizQuestion } from "@/lib/firestore";
import { getQuizImage, NoteImage } from "@/lib/imageGen";
import { qFingerprint, toDay, prevDay } from "@/lib/utils";
import { toast } from "sonner";

interface Q extends QuizQuestion {
  _fid?: string;
}

export default function Quiz() {
  const { state, saveState, isPro, checkLimit, markSeenQ, quizTarget, setQuizTarget, setCurrentPage } = useApp();

  const [phase, setPhase] = useState<"setup" | "quiz" | "result">("setup");
  const [cat, setCat] = useState(quizTarget?.cat || "Kardiyoloji");
  const [topic, setTopic] = useState(quizTarget?.topic || "");
  const [count, setCount] = useState(5);
  const [diff, setDiff] = useState("Orta");
  const [timerMode, setTimerMode] = useState(false);

  const [questions, setQuestions] = useState<Q[]>([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [wrongList, setWrongList] = useState<{ q: Q; sel: number }[]>([]);
  const [loading, setLoading] = useState(false);

  const [timerSec, setTimerSec] = useState(90);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [aiExp, setAiExp] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Async Wikipedia image per question (keyed by index)
  const [qImages, setQImages] = useState<Record<number, NoteImage | null>>({});
  const [qImgLoading, setQImgLoading] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (quizTarget) {
      setCat(quizTarget.cat);
      setTopic(quizTarget.topic || "");
      setQuizTarget(null);
    }
  }, [quizTarget, setQuizTarget]);

  // Load Wikipedia image for the current question
  useEffect(() => {
    if (phase !== "quiz" || !questions[current]) return;
    if (qImages[current] !== undefined) return; // already loaded or null

    const q = questions[current];
    setQImgLoading((prev) => ({ ...prev, [current]: true }));
    setQImages((prev) => ({ ...prev, [current]: undefined as unknown as null })); // mark as loading

    getQuizImage(q.cat || cat, q.tags || []).then((img) => {
      setQImages((prev) => ({ ...prev, [current]: img }));
      setQImgLoading((prev) => ({ ...prev, [current]: false }));
    }).catch(() => {
      setQImages((prev) => ({ ...prev, [current]: null }));
      setQImgLoading((prev) => ({ ...prev, [current]: false }));
    });
  }, [phase, current, questions]);

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }
  function startTimer() {
    stopTimer();
    setTimerSec(90);
    timerRef.current = setInterval(() => {
      setTimerSec((v) => {
        if (v <= 1) { stopTimer(); autoNext(); return 0; }
        return v - 1;
      });
    }, 1000);
  }
  function autoNext() { setAnswered(true); setSelected(-1); }
  useEffect(() => () => stopTimer(), []);

  async function generateQuestions() {
    if (!checkLimit("quiz")) {
      toast.error(`Ücretsiz planın ${FREE_LIMITS.quiz} soru hakkı bitti. Planları gör!`);
      setCurrentPage("pricing");
      return;
    }
    setLoading(true);
    setPhase("quiz");
    setCurrent(0);
    setScore(0);
    setWrongList([]);
    setSelected(null);
    setAnswered(false);
    setAiExp(null);
    setQImages({});
    setQImgLoading({});

    try {
      const activeCat = cat === "Karışık" ? TREE[Math.floor(Math.random() * TREE.length)].cat : cat;
      const cachedKey = topic || activeCat;
      const cached = await fbGetQuestions(cachedKey, diff, count, state.seenQ || {});
      if (cached.length >= Math.min(count, 3)) {
        setQuestions(cached.slice(0, count));
        markSeenQ(cached.map((q) => q._fid!).filter(Boolean));
        setLoading(false);
        if (timerMode) startTimer();
        return;
      }

      const topics = topic
        ? [topic]
        : cat === "Karışık"
        ? TREE.flatMap((b) => b.topics).sort(() => Math.random() - 0.5).slice(0, 3)
        : (TREE.find((b) => b.cat === activeCat)?.topics || []).sort(() => Math.random() - 0.5).slice(0, 4);

      const tiplar = soruTipleri.sort(() => Math.random() - 0.5).slice(0, Math.min(count, soruTipleri.length));

      const prompt = `Sen deneyimli bir TUS sınavı hazırlayıcısısın. Aşağıdaki konu(lar) için TUS sınavına çıkabilecek kalitede ${count} soru üret.

KATEGORİ: ${activeCat}
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
      "cat": "${activeCat}",
      "diff": "${diff}",
      "tags": ["${topics[0]}"]
    }
  ]
}

Cevap indeksi 0-4 arasında olmalı. ${count} adet soru üret.`;

      const raw = await mistralJSON(prompt, 8000, 0.75);
      const parsed = parseJSON(raw) as { questions?: Q[] };
      const qs: Q[] = (parsed?.questions || []).map((q) => ({
        ...q,
        opts: (q.opts || []).slice(0, 5),
        ans: Math.min(Math.max(0, q.ans || 0), (q.opts?.length || 5) - 1),
      })).slice(0, count);

      if (!qs.length) throw new Error("Sorular üretilemedi");

      setQuestions(qs);
      fbSaveQuestions(topic || activeCat, diff, qs).catch(() => {});
      setLoading(false);
      if (timerMode) startTimer();
    } catch (e) {
      setLoading(false);
      toast.error("Quiz yüklenemedi: " + (e as Error).message);
      setPhase("setup");
    }
  }

  function handleSelect(idx: number) {
    if (answered) return;
    stopTimer();
    setSelected(idx);
    setAnswered(true);
    setAiExp(null);

    const q = questions[current];
    const correct = idx === q.ans;

    const newState = { ...state };
    newState.total = (newState.total || 0) + 1;
    if (correct) {
      newState.correct = (newState.correct || 0) + 1;
      setScore((v) => v + 1);
    } else {
      setWrongList((prev) => [...prev, { q, sel: idx }]);
      newState.mistakes = { ...newState.mistakes };
      newState.mistakes[q.tags?.[0] || q.cat || "Genel"] = (newState.mistakes[q.tags?.[0] || q.cat || "Genel"] || 0) + 1;
    }

    const today = toDay();
    const catKey = q.cat || cat;
    newState.byCat = { ...newState.byCat };
    if (!newState.byCat[catKey]) newState.byCat[catKey] = { a: 0, c: 0 };
    newState.byCat[catKey].a += 1;
    if (correct) newState.byCat[catKey].c += 1;

    if (newState.lastDate !== today) {
      if (newState.lastDate === prevDay()) {
        newState.streak = (newState.streak || 0) + 1;
      } else {
        newState.streak = 1;
      }
      newState.lastDate = today;
    }
    saveState(newState);
  }

  function handleNext() {
    if (current + 1 >= questions.length) { stopTimer(); finishQuiz(); return; }
    setCurrent((v) => v + 1);
    setSelected(null);
    setAnswered(false);
    setAiExp(null);
    if (timerMode) startTimer();
  }

  function finishQuiz() {
    const pct = Math.round((score / questions.length) * 100);
    const newState = { ...state };
    const today = new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
    newState.sessions = [...(newState.sessions || []), { date: today, cat, c: score, t: questions.length, p: pct }];
    if (newState.sessions.length > 50) newState.sessions = newState.sessions.slice(-50);
    if (!isPro()) newState.noteCount = newState.noteCount || 0;
    saveState(newState);
    setPhase("result");
  }

  async function fetchAIExplain() {
    if (!checkLimit("aiExplain")) {
      toast.error("AI açıklama hakkın bitti. Pro'ya geç!");
      setCurrentPage("pricing");
      return;
    }
    const q = questions[current];
    const fp = qFingerprint(q);
    setAiLoading(true);
    try {
      let cached = await fbGetAnalysis(fp);
      if (!cached) {
        const prompt = `TUS sınavı sorusu için detaylı açıklama yaz (Türkçe).

VAKA: ${q.vaka}
SORU: ${q.soru}
SEÇENEKLER: ${q.opts.map((o, i) => `${["A","B","C","D","E"][i]}) ${o}`).join(" | ")}
DOĞRU CEVAP: ${["A","B","C","D","E"][q.ans]}) ${q.opts[q.ans]}
ÖĞRENCİNİN CEVABI: ${selected !== null && selected >= 0 ? `${["A","B","C","D","E"][selected]}) ${q.opts[selected]}` : "Boş"}

Detaylı açıklama yaz: neden bu cevap doğru, diğerleri neden yanlış, TUS spotları. Sadece HTML döndür (h3, p, ul, .tip, .warn formatları kullan):`;
        cached = await mistralText(prompt, 2500, 0.4);
        cached = cached.replace(/^```(?:html)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
        fbSaveAnalysis(fp, cached).catch(() => {});
      }
      setAiExp(cached);
      if (!isPro()) {
        const ns = { ...state, aiExplainCount: (state.aiExplainCount || 0) + 1 };
        saveState(ns);
      }
    } catch (e) {
      toast.error("AI açıklama alınamadı: " + (e as Error).message);
    } finally {
      setAiLoading(false);
    }
  }

  if (phase === "setup") {
    const categories = [...TREE.map((b) => b.cat), "Karışık"];
    const selectedBranch = TREE.find((b) => b.cat === cat);
    const topicsOfCat = selectedBranch?.topics || [];

    return (
      <div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: "Playfair Display, serif", fontSize: "1.6rem", fontWeight: 900, color: "var(--cream)" }}>AI Quiz</div>
          <div style={{ color: "var(--t2)", fontSize: ".82rem", marginTop: 4 }}>
            Mistral AI klinik vakalar · Wikipedia/Wikimedia Commons eğitici görseller
          </div>
        </div>

        {!isPro() && (
          <div style={{ background: "var(--rd)", border: "1px solid rgba(232,83,74,.25)", borderRadius: 10, padding: "11px 15px", marginBottom: 16, fontSize: ".8rem", color: "var(--ac)" }}>
            🔒 Ücretsiz plan: {FREE_LIMITS.quiz} soru hakkın var ({state.total || 0} kullanıldı).{" "}
            <button style={{ background: "none", border: "none", color: "var(--cream)", cursor: "pointer", fontWeight: 700 }} onClick={() => setCurrentPage("pricing")}>
              Sınırsız için Pro'ya geç →
            </button>
          </div>
        )}

        <div className="card">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".07em" }}>Kategori</div>
              <select value={cat} onChange={(e) => { setCat(e.target.value); setTopic(""); }}
                style={{ width: "100%", padding: "9px 12px", background: "var(--ink3)", border: "1px solid var(--line2)", borderRadius: 9, color: "var(--text)", fontFamily: "Syne, sans-serif", fontSize: ".84rem" }}>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".07em" }}>Konu (isteğe bağlı)</div>
              <select value={topic} onChange={(e) => setTopic(e.target.value)} disabled={cat === "Karışık"}
                style={{ width: "100%", padding: "9px 12px", background: "var(--ink3)", border: "1px solid var(--line2)", borderRadius: 9, color: "var(--text)", fontFamily: "Syne, sans-serif", fontSize: ".84rem", opacity: cat === "Karışık" ? .5 : 1 }}>
                <option value="">— Tüm konular —</option>
                {topicsOfCat.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".07em" }}>Soru Sayısı</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[5, 10, 15, 20].map((n) => (
                  <button key={n} onClick={() => setCount(n)} style={{ flex: 1, padding: "8px 4px", borderRadius: 9, border: "1.5px solid", cursor: "pointer", fontFamily: "Syne, sans-serif", fontSize: ".82rem", fontWeight: 700, background: count === n ? "var(--ac)" : "var(--ink3)", borderColor: count === n ? "var(--ac)" : "var(--line)", color: count === n ? "#fff" : "var(--t2)" }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".07em" }}>Zorluk</div>
              <div style={{ display: "flex", gap: 6 }}>
                {["Kolay", "Orta", "Zor", "Karışık"].map((d) => (
                  <button key={d} onClick={() => setDiff(d)} style={{ flex: 1, padding: "8px 4px", borderRadius: 9, border: "1.5px solid", cursor: "pointer", fontFamily: "Syne, sans-serif", fontSize: ".74rem", fontWeight: 700, background: diff === d ? "var(--teal)" : "var(--ink3)", borderColor: diff === d ? "var(--teal)" : "var(--line)", color: diff === d ? "var(--ink)" : "var(--t2)" }}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: ".82rem", color: "var(--t2)" }}>
              <input type="checkbox" checked={timerMode} onChange={(e) => setTimerMode(e.target.checked)} style={{ accentColor: "var(--ac)" }} />
              90 sn zamanlayıcı
            </label>
          </div>
          <button className="btn btn-primary lg full" style={{ marginTop: 20 }} onClick={generateQuestions}>✦ Quiz Başlat</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-orb">✦</div>
        <div className="loading-title">Sorular hazırlanıyor</div>
        <div style={{ color: "var(--t2)", fontSize: ".8rem", marginTop: 6 }}>Mistral AI klinik vakalar oluşturuyor<span className="loading-dots" /></div>
      </div>
    );
  }

  if (phase === "result") {
    const pct = Math.round((score / questions.length) * 100);
    const emoji = pct >= 80 ? "🏆" : pct >= 60 ? "✅" : pct >= 40 ? "📈" : "💪";
    const msg = pct >= 80 ? "Muhteşem!" : pct >= 60 ? "İyi iş!" : pct >= 40 ? "Gelişiyor!" : "Devam et!";
    return (
      <div className="rw">
        <div className="re">{emoji}</div>
        <div className="rs" style={{ color: pct >= 70 ? "var(--green)" : pct >= 40 ? "var(--gold)" : "var(--ac)" }}>{pct}%</div>
        <div style={{ fontSize: ".82rem", color: "var(--t2)", marginBottom: 20 }}>{msg} {score}/{questions.length} doğru</div>
        <div className="rg">
          <div className="rst"><div className="rv" style={{ color: "var(--green)" }}>{score}</div><div className="rl2">Doğru</div></div>
          <div className="rst"><div className="rv" style={{ color: "var(--ac)" }}>{questions.length - score}</div><div className="rl2">Yanlış</div></div>
          <div className="rst"><div className="rv" style={{ color: "var(--teal)" }}>{questions.length}</div><div className="rl2">Toplam</div></div>
        </div>
        {wrongList.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--ac)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10, textAlign: "left" }}>Yanlış Cevaplar</div>
            {wrongList.map(({ q }, i) => (
              <div key={i} style={{ background: "var(--rd)", border: "1px solid rgba(232,83,74,.2)", borderRadius: 9, padding: "12px 14px", marginBottom: 8, textAlign: "left" }}>
                <div style={{ fontSize: ".78rem", color: "var(--t2)", marginBottom: 4 }}>{q.vaka?.slice(0, 120)}...</div>
                <div style={{ fontSize: ".8rem", fontWeight: 700, color: "var(--cream)" }}>{q.soru}</div>
                <div style={{ fontSize: ".76rem", color: "var(--green)", marginTop: 4 }}>✓ {q.opts[q.ans]}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <button className="btn btn-primary" onClick={() => { setPhase("setup"); setCurrent(0); setScore(0); setWrongList([]); }}>✦ Yeni Quiz</button>
          <button className="btn btn-ghost" onClick={() => setCurrentPage("stats")}>📊 İstatistikler</button>
        </div>
      </div>
    );
  }

  const q = questions[current];
  if (!q) return null;
  const opts = ["A", "B", "C", "D", "E"];
  const qImg = qImages[current];
  const qImgIsLoading = qImgLoading[current];

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      {/* Progress */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase" }}>{current + 1} / {questions.length}</span>
          <span className="tag tag-teal" style={{ fontSize: ".6rem" }}>{q.diff}</span>
          <span className="tag tag-gray" style={{ fontSize: ".6rem" }}>{q.cat}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {timerMode && (
            <div className={`timer${timerSec <= 15 ? " warn" : ""}`}>
              {String(Math.floor(timerSec / 60)).padStart(2, "0")}:{String(timerSec % 60).padStart(2, "0")}
            </div>
          )}
          <span style={{ fontSize: ".78rem", fontWeight: 700, color: "var(--green)" }}>{score} ✓</span>
        </div>
      </div>

      <div className="progress-bar" style={{ marginBottom: 18 }}>
        <div className="progress-fill" style={{ width: `${((current) / questions.length) * 100}%` }} />
      </div>

      {/* Question card */}
      <div className="vc">
        <div className="vhdr">
          <span className="vlbl">Klinik Vaka — TUS Tarzı</span>
          <span style={{ fontSize: ".6rem", color: "var(--t3)", marginLeft: "auto" }}>📖 Wikipedia Görsel</span>
        </div>
        <div className="vbody">
          <div className="vnum">{current + 1}</div>
          <div className="vq">{q.vaka}</div>
          <div className="vsoru">{q.soru}</div>
        </div>

        {/* Wikipedia clinical image */}
        {qImgIsLoading && (
          <div className="quiz-img-wrap">
            <div className="quiz-img-skeleton">
              <span className="quiz-img-skeleton-icon">📖</span>
              <span className="quiz-img-skeleton-txt">Wikipedia'dan klinik görsel yükleniyor<span className="loading-dots" /></span>
            </div>
          </div>
        )}
        {!qImgIsLoading && qImg && (
          <div className="quiz-img-wrap">
            <img
              src={qImg.url}
              alt={qImg.caption}
              className="quiz-img"
              onError={(e) => { const w = (e.currentTarget as HTMLImageElement).closest(".quiz-img-wrap") as HTMLElement | null; if (w) w.style.display = "none"; }}
            />
            <div className="quiz-img-caption">
              <span style={{ color: "var(--teal)", marginRight: 5 }}>📖</span>
              {qImg.caption} — <em style={{ color: "var(--t3)" }}>Wikipedia / Wikimedia Commons</em>
            </div>
          </div>
        )}
      </div>

      {/* Options */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
        {q.opts.map((opt, i) => {
          let cls = "";
          if (answered) {
            if (i === q.ans) cls = "correct";
            else if (i === selected) cls = "wrong";
          }
          return (
            <button key={i} className={`opt-btn${cls ? " " + cls : ""}`} disabled={answered} onClick={() => handleSelect(i)}>
              <span className="opt-letter">{opts[i]}</span>
              <span>{opt}</span>
            </button>
          );
        })}
      </div>

      {/* Feedback */}
      {answered && selected !== null && (
        <div className={`feedback${selected === q.ans ? " ok" : " err"}`} style={{ marginBottom: 12 }}>
          <span>{selected === q.ans ? "✓" : "✗"}</span>
          <span>
            {selected === q.ans ? "Doğru! " : `Yanlış. Doğru cevap: ${opts[q.ans]}) ${q.opts[q.ans]}. `}
            {q.exp}
          </span>
        </div>
      )}

      {/* AI Explain */}
      {answered && (
        <div className="ai-box" style={{ marginBottom: 14 }}>
          <div className={`ai-box-header${aiLoading ? " pulsing" : ""}`}>
            ✦ AI Açıklama
            {!aiExp && !aiLoading && (
              <button className="btn btn-teal sm" style={{ marginLeft: "auto" }} onClick={fetchAIExplain}>Analiz Et</button>
            )}
          </div>
          {aiLoading && <div style={{ color: "var(--t2)", fontSize: ".8rem" }}>Mistral analiz yapıyor<span className="loading-dots" /></div>}
          {aiExp && <div className="nb" dangerouslySetInnerHTML={{ __html: aiExp }} />}
        </div>
      )}

      {answered && (
        <button className="btn btn-primary full lg" onClick={handleNext}>
          {current + 1 >= questions.length ? "Sonuçları Gör →" : "Sonraki Soru →"}
        </button>
      )}
    </div>
  );
}
