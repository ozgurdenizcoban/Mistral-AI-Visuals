import { useState, useEffect, useRef } from "react";
import { useApp } from "@/contexts/AppContext";
import { addWrongToPersonalNotes } from "@/lib/personalNotes";
import { mistralJSON, mistralText, parseJSON } from "@/lib/mistral";
import { TREE, soruTipleri } from "@/lib/data";
import { fbGetQuestions, fbSaveQuestions, fbGetAnalysis, fbSaveAnalysis, QuizQuestion } from "@/lib/firestore";
import { buildQuizImageHtml, getQuizImage } from "@/lib/imageGen";
import { getSourceGuide } from "@/lib/sourceGuides";
import { qFingerprint, toDay, prevDay } from "@/lib/utils";
import { toast } from "sonner";

interface Q extends QuizQuestion {
  _fid?: string;
}

function cleanVisualHtml(raw?: string) {
  if (!raw) return "";
  const s = raw.trim();
  if (/script|iframe|object|embed|base64/i.test(s)) return "";
  const hasSafeWikiImg = /<img\s[^>]*src=["']https:\/\/upload\.wikimedia\.org\/[^"']+["'][^>]*>/i.test(s);
  if (/https?:\/\//i.test(s) && !hasSafeWikiImg) return "";
  if (!/(<svg[\s>]|quiz-ai-diagram|<img\s)/i.test(s)) return "";
  return s.slice(0, 5000);
}

function shouldUseSourceImage(q: Q) {
  const text = `${q.tags?.join(" ") || ""} ${q.vaka || ""} ${q.soru || ""}`.toLocaleLowerCase("tr-TR");
  return /(anatomi|histoloji|embriyoloji|ekg|grafi|radyoloji|deri|lezyon|döküntü|hücre|kas|sinir|kalp|akciğer|böbrek|serebellum|damar|organ|görüntü|şekil)/i.test(text);
}

async function enrichQuestionsWithSourceImages(questions: Q[], requestedCount: number) {
  let sourceImagesAdded = 0;
  const sourceImageLimit = Math.max(1, Math.floor(requestedCount / 8));
  for (const question of questions) {
    if (sourceImagesAdded >= sourceImageLimit) break;
    if (!shouldUseSourceImage(question) || /<img\s/i.test(question.visualHtml || "")) continue;
    const image = await getQuizImage(
      question.tags || [],
      `${question.cat || ""} ${question.vaka || ""} ${question.soru || ""}`,
    );
    if (!image) continue;
    question.visualHtml = cleanVisualHtml(buildQuizImageHtml(image));
    question.visualCaption = `${image.caption} — ${image.attribution}`;
    sourceImagesAdded += 1;
  }
  return questions;
}

export default function Quiz() {
  const { state, saveState, isPro, markSeenQ, quizTarget, setQuizTarget, setCurrentPage } = useApp();

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

  // Refs to always have fresh values inside async callbacks
  const currentRef = useRef(current);
  const selectedRef = useRef(selected);
  const questionsRef = useRef(questions);
  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { questionsRef.current = questions; }, [questions]);


  useEffect(() => {
    if (quizTarget) {
      setCat(quizTarget.cat);
      setTopic(quizTarget.topic || "");
      setQuizTarget(null);
    }
  }, [quizTarget, setQuizTarget]);

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
    setLoading(true);
    setPhase("quiz");
    setCurrent(0);
    setScore(0);
    setWrongList([]);
    setSelected(null);
    setAnswered(false);
    setAiExp(null);

    try {
      const activeCat = cat === "Karışık" ? TREE[Math.floor(Math.random() * TREE.length)].cat : cat;
      const cachedKey = topic || activeCat;
      const cached = await fbGetQuestions(cachedKey, diff, count, state.seenQ || {});
      if (cached.length >= Math.min(count, 3)) {
        const cachedQuestions = cached.slice(0, count).map((q) => ({
          ...q,
          visualHtml: cleanVisualHtml(q.visualHtml),
          visualCaption: (q.visualCaption || "").slice(0, 120),
        }));
        setQuestions(await enrichQuestionsWithSourceImages(cachedQuestions, count));
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
      const sourceGuide = getSourceGuide(activeCat, topics);

      const prompt = `Sen deneyimli bir TUS sınavı hazırlayıcısısın. Aşağıdaki konu(lar) için TUS sınavına çıkabilecek kalitede ${count} soru üret.

KATEGORİ: ${activeCat}
KONULAR: ${topics.join(", ")}
${sourceGuide}
KALITE KURALLARI:
- Sorular ezber degil klinik akil yurutme gerektirsin.
- Klinik derslerde yaş, cinsiyet, başvuru, fizik muayene ve en az 2 laboratuvar/görüntüleme ipucu olan vaka kullan.
- Temel bilimlerde soru kökü mekanizma, deney, hücre/doku bulgusu, reseptör-yolak, enzim veya patoloji preparatı mantığıyla kurulabilir; gereksiz klinik hikaye ekleme.
- Secenekler birbirine yakin ama tek dogru olacak sekilde ayirici tani mantigiyla yazilsin.
- TUS tuzaklari, esik degerleri, klasik bulgular ve tedavi algoritmalari kullanilsin.
- Aciklama dogru cevabi ve en az 2 yanlis secenegin neden elendigini anlatsin.
- Sadece gorsel gercekten klinik akil yurutmeyi guclendiriyorsa visualHtml ekle. AI cizimi gerekiyorsa guvenli inline <svg> veya <div class="quiz-ai-diagram"> kullan; gereksizse visualHtml bos string olsun. Sistem uygun konularda ayrica Wikipedia/Wikimedia gorseli ekleyebilir.
- visualHtml zemini daima beyaz veya cok acik olsun. Siyah/koyu genel arka plan kullanma. Tum metinler koyu ve yuksek kontrastli, oklar ve baglanti cizgileri belirgin koyu mor olsun. Koyu zemin ustune koyu yazi veya acik zemin ustune beyaz yazi ASLA kullanma.
ZORLUK: ${diff}
SORU TİPLERİ: ${tiplar.join(", ")}

Her soru TUS tarzında olsun. Klinik derslerde gerçekçi vaka, temel bilimlerde mekanizma/preparat/laboratuvar odaklı kaliteli soru yaz. 5 şık, 1 doğru cevap. Türkçe yaz.

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
      const seenInSession = new Set<string>();
      const qs: Q[] = (parsed?.questions || [])
        .map((q) => ({
          ...q,
          opts: (q.opts || []).slice(0, 5),
          ans: Math.min(Math.max(0, q.ans || 0), (q.opts?.length || 5) - 1),
          visualHtml: cleanVisualHtml(q.visualHtml),
          visualCaption: (q.visualCaption || "").slice(0, 120),
        }))
        .filter((q) => {
          // Deduplicate within this batch using vaka first 60 chars + soru first 40 chars
          const key = (q.vaka || "").slice(0, 60) + "|" + (q.soru || "").slice(0, 40);
          if (seenInSession.has(key)) return false;
          seenInSession.add(key);
          return true;
        })
        .slice(0, count);

      if (!qs.length) throw new Error("Sorular üretilemedi");

      await enrichQuestionsWithSourceImages(qs, count);

      setQuestions(qs);
      // Save and immediately mark as seen so they never repeat
      fbSaveQuestions(topic || activeCat, diff, qs)
        .then((savedIds) => { if (savedIds.length) markSeenQ(savedIds); })
        .catch(() => {});
      setLoading(false);
      if (timerMode) startTimer();
    } catch (e) {
      setLoading(false);
      toast.error("Quiz yüklenemedi: " + (e as Error).message);
      setPhase("setup");
    }
  }

  async function handleSelect(idx: number) {
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
      Object.assign(newState, await addWrongToPersonalNotes(newState, q, idx));
    }

    const today = toDay();
    const catKey = q.cat || cat;
    newState.byCat = { ...newState.byCat };
    if (!newState.byCat[catKey]) newState.byCat[catKey] = { a: 0, c: 0 };
    newState.byCat[catKey].a += 1;
    if (correct) newState.byCat[catKey].c += 1;

    if (newState.lastDate !== today) {
      newState.streak = (newState.lastDate === prevDay()) ? (newState.streak || 0) + 1 : 1;
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
    const today = new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const newState = { ...state };
    newState.sessions = [...(newState.sessions || []), { date: today, cat, c: score, t: questions.length, p: pct }];
    if (newState.sessions.length > 50) newState.sessions = newState.sessions.slice(-50);
    saveState(newState);
    setPhase("result");
  }

  async function fetchAIExplain() {
    const idx = currentRef.current;
    const sel = selectedRef.current;
    const q = questionsRef.current[idx];
    if (!q) return;

    const fp = qFingerprint(q);
    setAiLoading(true);
    try {
      let cached = await fbGetAnalysis(fp);
      if (!cached) {
        const prompt = `TUS sınavı sorusu için detaylı klinik açıklama yaz (Türkçe).

VAKA: ${q.vaka}
SORU: ${q.soru}
SEÇENEKLER: ${q.opts.map((o, i) => `${["A","B","C","D","E"][i]}) ${o}`).join(" | ")}
DOĞRU CEVAP: ${["A","B","C","D","E"][q.ans]}) ${q.opts[q.ans]}
ÖĞRENCİNİN CEVABI: ${sel !== null && sel >= 0 ? `${["A","B","C","D","E"][sel]}) ${q.opts[sel]}` : "Boş (süre doldu)"}

Klinik açıklama:
1. Neden doğru cevap doğru (mekanizma, patofizyoloji)
2. Diğer seçenekler neden yanlış (kısa)
3. TUS SPOT: Bu sorudan çıkarılacak kritik bilgi

Sadece HTML döndür (.tip, .warn, h3, p, ul kullan):`;
        cached = await mistralText(prompt, 2500, 0.35);
        cached = cached.replace(/^```(?:html)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
        fbSaveAnalysis(fp, cached).catch(() => {});
      }

      if (currentRef.current === idx) {
        setAiExp(cached);
      }
    } catch (e) {
      toast.error("Analiz yüklenemedi: " + (e as Error).message);
    } finally {
      setAiLoading(false);
    }
  }

  /* ─── SETUP ─────────────────────────────────────────── */
  if (phase === "setup") {
    const categories = [...TREE.map((b) => b.cat), "Karışık"];
    const topicsOfCat = TREE.find((b) => b.cat === cat)?.topics || [];

    return (
      <div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: "Playfair Display, serif", fontSize: "1.6rem", fontWeight: 900, color: "var(--cream)" }}>TUS Quiz</div>
          <div style={{ color: "var(--t2)", fontSize: ".82rem", marginTop: 4 }}>Temel ve klinik bilimlerde TUS tarzı sorular — performansına göre kişiselleştirilmiş</div>
        </div>

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
                  <button key={n} onClick={() => setCount(n)}
                    style={{ flex: 1, padding: "8px 4px", borderRadius: 9, border: "1.5px solid", cursor: "pointer", fontFamily: "Syne, sans-serif", fontSize: ".82rem", fontWeight: 700, background: count === n ? "var(--ac)" : "var(--ink3)", borderColor: count === n ? "var(--ac)" : "var(--line)", color: count === n ? "#fff" : "var(--t2)" }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--t3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".07em" }}>Zorluk</div>
              <div style={{ display: "flex", gap: 6 }}>
                {["Kolay", "Orta", "Zor", "Karışık"].map((d) => (
                  <button key={d} onClick={() => setDiff(d)}
                    style={{ flex: 1, padding: "8px 4px", borderRadius: 9, border: "1.5px solid", cursor: "pointer", fontFamily: "Syne, sans-serif", fontSize: ".74rem", fontWeight: 700, background: diff === d ? "var(--teal)" : "var(--ink3)", borderColor: diff === d ? "var(--teal)" : "var(--line)", color: diff === d ? "var(--ink)" : "var(--t2)" }}>
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

  /* ─── LOADING ───────────────────────────────────────── */
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-orb">✦</div>
        <div className="loading-title">Sorular hazırlanıyor</div>
        <div style={{ color: "var(--t2)", fontSize: ".8rem", marginTop: 6 }}>TUS soruları hazırlanıyor<span className="loading-dots" /></div>
      </div>
    );
  }

  /* ─── RESULT ────────────────────────────────────────── */
  if (phase === "result") {
    const pct = Math.round((score / questions.length) * 100);
    const emoji = pct >= 80 ? "🏆" : pct >= 60 ? "✅" : pct >= 40 ? "📈" : "💪";
    const msg = pct >= 80 ? "Mükemmel performans!" : pct >= 60 ? "Güçlü skor!" : pct >= 40 ? "Gelişme gösteriyor!" : "Devam et, başaracaksın!";
    return (
      <div className="rw">
        <div className="re">{emoji}</div>
        <div className="rs" style={{ color: pct >= 70 ? "var(--green)" : pct >= 40 ? "var(--teal)" : "var(--ac)" }}>{pct}%</div>
        <div style={{ fontSize: ".82rem", color: "var(--t2)", marginBottom: 20 }}>{msg} — {score}/{questions.length} doğru</div>

        <div className="rg">
          <div className="rst"><div className="rv" style={{ color: "var(--green)" }}>{score}</div><div className="rl2">Doğru</div></div>
          <div className="rst"><div className="rv" style={{ color: "var(--ac)" }}>{questions.length - score}</div><div className="rl2">Yanlış</div></div>
          <div className="rst"><div className="rv" style={{ color: "var(--teal)" }}>{questions.length}</div><div className="rl2">Toplam</div></div>
        </div>

        {wrongList.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--ac)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10, textAlign: "left" }}>
              Tekrar Edilmesi Gereken Konular
            </div>
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

  /* ─── QUIZ ──────────────────────────────────────────── */
  const q = questions[current];
  if (!q) return null;
  const opts = ["A", "B", "C", "D", "E"];

  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
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
        <div className="progress-fill" style={{ width: `${(current / questions.length) * 100}%` }} />
      </div>

      {/* Question card */}
      <div className="vc">
        <div className="vhdr">
          <span className="vlbl">TUS Sorusu</span>
        </div>

        <div className="vbody">
          {q.visualHtml && (
            <figure className="quiz-clinical-img quiz-ai-visual">
              <div dangerouslySetInnerHTML={{ __html: q.visualHtml }} />
              {q.visualCaption && <figcaption className="quiz-clinical-cap">{q.visualCaption}</figcaption>}
            </figure>
          )}
          <div className="vnum">{current + 1}</div>
          <div className="vq">{q.vaka}</div>
          <div className="vsoru">{q.soru}</div>
        </div>
        <div style={{ clear: "both" }} />
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

      {/* Immediate feedback */}
      {answered && selected !== null && (
        <div className={`feedback${selected === q.ans ? " ok" : " err"}`} style={{ marginBottom: 12 }}>
          <span>{selected === q.ans ? "✓" : "✗"}</span>
          <span>
            {selected === q.ans
              ? "Doğru! "
              : `Yanlış. Doğru cevap: ${opts[q.ans]}) ${q.opts[q.ans]}. `}
            {q.exp}
          </span>
        </div>
      )}

      {/* Klinik Analiz — on demand */}
      {answered && (
        <div className="ai-box" style={{ marginBottom: 14 }}>
          <div className={`ai-box-header${aiLoading ? " pulsing" : ""}`}>
            ✦ Klinik Analiz
            {!aiExp && !aiLoading && (
              <button className="btn btn-teal sm" style={{ marginLeft: "auto" }} onClick={fetchAIExplain}>
                Analiz Et
              </button>
            )}
          </div>
          {aiLoading && (
            <div style={{ color: "var(--t2)", fontSize: ".8rem", padding: "6px 0" }}>
              Klinik analiz hazırlanıyor<span className="loading-dots" />
            </div>
          )}
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
