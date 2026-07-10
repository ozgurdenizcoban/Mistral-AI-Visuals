import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { mistralJSON, parseJSON } from "@/lib/mistral";
import { fbGetQuestions, fbSaveQuestions, QuizQuestion } from "@/lib/firestore";
import { searchTusPrograms, TUS_SCORE_SOURCE } from "@/lib/tusData";
import { toDay, prevDay } from "@/lib/utils";
import { toast } from "sonner";

interface Q extends QuizQuestion { _fid?: string; }
type Phase = "setup" | "generating" | "quiz" | "review" | "result";
type Scale = 50 | 100 | 200;

/* ================================================================
   TUS tam dağılımı
================================================================ */
interface TusSubject {
  cat: string;
  group: "temel" | "klinik";
  q200: number;
  icon: string;
  topics: string[];
}

const FULL_TUS_SUBJECTS: TusSubject[] = [
  // ── TEMEL BİLİMLER (100 soru) ──────────────────────────────────
  { cat: "Anatomi", group: "temel", q200: 14, icon: "🦴",
    topics: ["Extremite ve Kol-Bacak Anatomisi", "Baş-Boyun Anatomisi", "Toraks Anatomisi", "Abdominal ve Pelvik Anatomi", "Nöroanatomi", "Klinik Sinir-Damar İlişkileri"] },
  { cat: "Histoloji", group: "temel", q200: 10, icon: "🔬",
    topics: ["Epitel ve Bez Dokusu", "Bağ ve Kıkırdak Dokusu", "Kas Dokusu", "Sinir Dokusu", "Kan Hücreleri", "Organ Histolojisi"] },
  { cat: "Fizyoloji", group: "temel", q200: 14, icon: "⚡",
    topics: ["Kardiyovasküler Fizyoloji", "Solunum Fizyolojisi", "Renal Fizyoloji", "Sinir Sistemi Fizyolojisi", "GİS Fizyolojisi", "Endokrin Fizyoloji"] },
  { cat: "Biyokimya", group: "temel", q200: 14, icon: "🧪",
    topics: ["Karbonhidrat Metabolizması", "Lipid Metabolizması", "Protein ve Amino Asit Metabolizması", "Enzim Kinetiği", "Nükleik Asitler", "Vitaminler ve Kofaktörler"] },
  { cat: "Mikrobiyoloji", group: "temel", q200: 14, icon: "🦠",
    topics: ["Gram Pozitif Bakteriler", "Gram Negatif Bakteriler", "Virüsler", "Mantar ve Parazitler", "İmmünoloji Temelleri", "Antimikrobiyal Direnç"] },
  { cat: "Farmakoloji", group: "temel", q200: 14, icon: "💊",
    topics: ["Farmakokinetik/Farmakodinami", "Otonom İlaçlar", "Kardiyovasküler İlaçlar", "Antibiyotikler ve Antimikrobiyaller", "SSS İlaçları", "NSAİİ ve Analjezikler"] },
  { cat: "Patoloji", group: "temel", q200: 20, icon: "🔭",
    topics: ["Hücre Hasarı ve Ölüm", "İnflamasyon ve Tamir", "Neoplazi", "Kardiyovasküler Patoloji", "Pulmoner Patoloji", "GİS Patolojisi", "Böbrek Patolojisi", "Hematolojik Neoplaziler"] },
  // ── KLİNİK — DAHİLİYE (66 soru) ───────────────────────────────
  { cat: "Kardiyoloji", group: "klinik", q200: 9, icon: "🫀",
    topics: ["Akut Koroner Sendrom", "Kalp Yetmezliği", "Aritmiler", "Kapak Hastalıkları", "Hipertansiyon", "Perikard Hastalıkları"] },
  { cat: "Göğüs Hastalıkları", group: "klinik", q200: 7, icon: "🫁",
    topics: ["KOAH ve Astım", "Pulmoner Emboli", "Pnömoni", "Akciğer Kanseri", "Plevral Efüzyon", "Tüberküloz"] },
  { cat: "Hematoloji", group: "klinik", q200: 6, icon: "🩸",
    topics: ["Anemiler", "Lenfomalar", "Lösemiler", "Koagülasyon Bozuklukları", "Multipl Myelom"] },
  { cat: "Nefroloji", group: "klinik", q200: 6, icon: "🫘",
    topics: ["Akut Böbrek Hasarı", "Kronik Böbrek Hastalığı", "Glomerülonefritler", "Elektrolit Bozuklukları", "Asit-Baz"] },
  { cat: "Endokrinoloji", group: "klinik", q200: 8, icon: "⚗️",
    topics: ["Diabetes Mellitus", "Tiroid Hastalıkları", "Adrenal Hastalıklar", "Hipofiz Hastalıkları", "Kalsiyum Metabolizması"] },
  { cat: "Gastroenteroloji", group: "klinik", q200: 6, icon: "🫃",
    topics: ["Peptik Ülser Hastalığı", "İnflamatuvar Barsak Hastalığı", "Kolorektal Kanser", "GİS Kanamaları", "Pankreas Hastalıkları"] },
  { cat: "Hepatoloji", group: "klinik", q200: 5, icon: "🟤",
    topics: ["Viral Hepatitler", "Karaciğer Sirozu", "Hepatoselüler Karsinom", "Metabolik Karaciğer Hastalıkları"] },
  { cat: "Romatoloji", group: "klinik", q200: 5, icon: "🦴",
    topics: ["Romatoid Artrit", "Sistemik Lupus Eritematozus", "Spondiloartropatiler", "Vaskülitler", "Gut"] },
  { cat: "Enfeksiyon Hastalıkları", group: "klinik", q200: 7, icon: "🦠",
    topics: ["Pnömoniler", "Menenjit ve Ensefalit", "HIV/AIDS", "Sepsis", "Üriner Sistem Enfeksiyonları", "Tüberküloz"] },
  { cat: "Onkoloji", group: "klinik", q200: 4, icon: "🎗️",
    topics: ["Paraneoplastik Sendromlar", "Onkolojik Aciller", "Kemoterapi Yan Etkileri", "Kanser Taraması"] },
  { cat: "Geriatri", group: "klinik", q200: 3, icon: "👴",
    topics: ["Demans ve Deliryum", "Polifarmasi", "Geriatrik Kırılganlık", "Düşme"] },
  // ── KLİNİK — DİĞER (34 soru) ───────────────────────────────────
  { cat: "Genel Cerrahi", group: "klinik", q200: 10, icon: "🔪",
    topics: ["Akut Karın ve Appendisit", "Safra Yolu Hastalıkları", "İleus ve Obstriksiyon", "GİS Tümörleri", "Meme Hastalıkları", "Herni", "Tiroid ve Adrenal Cerrahi"] },
  { cat: "Kadın Doğum", group: "klinik", q200: 8, icon: "👶",
    topics: ["Normal Gebelik", "Gebelik Komplikasyonları (Preeklampsi, Plasenta)", "Normal ve Patolojik Doğum", "Jinekolojik Kanserler", "Menstrüel Bozukluklar", "Enfeksiyonlar"] },
  { cat: "Pediatri", group: "klinik", q200: 8, icon: "🧒",
    topics: ["Neonatal Dönem", "Aşılama Takvimi", "Çocukluk Çağı Enfeksiyonları", "Pediatrik Aciller", "Gelişim Basamakları", "Çocukluk Kanserleri"] },
  { cat: "Nöroloji", group: "klinik", q200: 4, icon: "🧠",
    topics: ["İnme", "Epilepsi", "MS ve Demiyelinizan Hastalıklar", "Periferik Nöropati", "Hareket Bozuklukları"] },
  { cat: "Psikiyatri", group: "klinik", q200: 2, icon: "🧘",
    topics: ["Şizofreni ve Psikozlar", "Duygudurum Bozuklukları", "Anksiyete", "Madde Kullanım Bozuklukları"] },
  { cat: "Dermatoloji", group: "klinik", q200: 2, icon: "🩹",
    topics: ["Psoriazis, Ekzema, Akne", "Deri Kanserleri ve Melanom"] },
  { cat: "Göz Hastalıkları", group: "klinik", q200: 2, icon: "👁️",
    topics: ["Glokom ve Katarakt", "Retina Hastalıkları", "Acil Göz Durumları"] },
];
// Doğrulama: 14+10+14+14+14+14+20=100, 9+7+6+6+8+6+5+5+7+4+3=66, 10+8+8+4+2+2+2=36 → toplam 202
// Not: Dermatoloji ve Göz'ü 2'şer soru yaptım, 202 soruda kuyruğu kesiyorum — tam dağılım 200
const SCALE_OPTIONS: { label: string; val: Scale; desc: string }[] = [
  { val: 50,  label: "Hızlı Deneme",  desc: "~50 soru · ~25 dk üretim" },
  { val: 100, label: "Yarı TUS",      desc: "~100 soru · ~45 dk üretim" },
  { val: 200, label: "Tam TUS",       desc: "~200 soru · ~60 dk üretim" },
];

/* TUS puan hesabı (TusScore ile aynı formül) */
const TB_MEAN = 42; const TB_SD = 16;
const KB_MEAN = 43; const KB_SD = 16;
function tusPuanCalc(tNet: number, kNet: number) {
  const spt = 50 + 10 * (tNet - TB_MEAN) / TB_SD;
  const spk = 50 + 10 * (kNet - KB_MEAN) / KB_SD;
  return Math.max(0, Math.min(100, Math.round((0.4 * spt + 0.6 * spk) * 10) / 10));
}
function netScore(c: number, w: number) { return c - w / 4; }

function puanColor(p: number) {
  if (p >= 62) return "var(--green)";
  if (p >= 55) return "var(--teal)";
  if (p >= 48) return "var(--gold)";
  return "var(--ac)";
}
function pctColor(p: number) {
  if (p >= 75) return "var(--green)";
  if (p >= 55) return "var(--teal)";
  if (p >= 40) return "var(--gold)";
  return "var(--ac)";
}

function placementStatusLabel(status: string) {
  if (status === "guclu") return "Yerleşir gibi";
  if (status === "sinirda") return "Sınırda";
  if (status === "yakin") return "Yakın";
  if (status === "bos") return "Boş kalmış";
  return "Uzak";
}

/* Build per-subject question counts for a given scale */
function buildPlan(scale: Scale): (TusSubject & { needed: number })[] {
  const ratio = scale / 200;
  const result: (TusSubject & { needed: number })[] = [];
  let remaining = scale;
  for (let i = 0; i < FULL_TUS_SUBJECTS.length; i++) {
    const s = FULL_TUS_SUBJECTS[i];
    const isLast = i === FULL_TUS_SUBJECTS.length - 1;
    const needed = isLast ? remaining : Math.max(1, Math.round(s.q200 * ratio));
    const clamped = Math.min(needed, remaining);
    if (clamped > 0) { result.push({ ...s, needed: clamped }); remaining -= clamped; }
    if (remaining <= 0) break;
  }
  return result;
}

/* Prompt builders */
function temelPrompt(cat: string, topics: string[], needed: number): string {
  const topicList = topics.sort(() => Math.random() - 0.5).slice(0, Math.min(4, topics.length));
  return `Sen TUS sınavı hazırlayıcısısın. TUS Temel Bilimler bölümünde ${cat} dersinden gerçekten çıkmış kalitede ${needed} soru üret.

DERS: ${cat}
KONULAR: ${topicList.join(", ")}
SORU TARZI: TUS Temel Bilimler soruları klinik korelasyon içerir.
  - Anatomi: "Sinir/damar hasarında hangi bulgu çıkar?", foramenler, cerrahi risk anatomisi
  - Histoloji: "Hangi hücre/doku tipi bu görevi üstlenir?", patolojik korelasyon
  - Fizyoloji: "Mekanizma soruları", fizyolojik parametrelerin klinik yorumu
  - Biyokimya: "Metabolik yol bozukluğu → hangi klinik sonuç?", enzim eksiklikleri
  - Mikrobiyoloji: "Patojen tanımlama", antijenik özellikler, direnç mekanizmaları
  - Farmakoloji: "İlaç hangi reseptöre bağlanır?", yan etkiler, kontrendikasyonlar
  - Patoloji: "Makroskopik/mikroskopik bulgu → hangi hastalık?", patogenez soruları

Her soru: 1-3 cümlelik klinik/laboratuvar bağlamı + mekanizma/tanımlama sorusu. 5 şık, 1 doğru.
Türkçe yaz. TUS'ta gerçekten sorulabilir kalitede ve zorlukta olsun.

JSON (başka hiçbir şey yazma):
{
  "questions": [
    {
      "vaka": "Klinik/laboratuvar bağlam cümleleri...",
      "soru": "Soru metni?",
      "opts": ["seçenek A", "seçenek B", "seçenek C", "seçenek D", "seçenek E"],
      "ans": 2,
      "exp": "Doğru cevap C çünkü... (kısa ama bilimsel açıklama)",
      "cat": "${cat}",
      "diff": "Orta",
      "tags": ["${topicList[0]}"]
    }
  ]
}

Cevap indeksi 0-4 arası. Tam olarak ${needed} soru üret.`;
}

function klinikPrompt(cat: string, topics: string[], needed: number): string {
  const topicList = topics.sort(() => Math.random() - 0.5).slice(0, Math.min(4, topics.length));
  return `Sen TUS Klinik Bilimler sınav hazırlayıcısısın. ${cat} bölümünden TUS'ta gerçekten çıkmış kalitede ${needed} klinik soru üret.

BÖLÜM: ${cat}
KONULAR: ${topicList.join(", ")}

Her soru için:
1. DETAYLI KLİNİK VAKA: Yaş, cinsiyet, başvuru şikâyeti, süre, ek semptomlar, fizik muayene bulguları, laboratuvar/görüntüleme sonuçları
2. TUS TARZI SORU: "Bu hastada en olası tanı?", "İlk yapılacak işlem?", "En uygun tedavi?", "Hangi bulgu beklenmez?" vb.
3. 5 ŞIK: Mantıklı ve ayırt edici seçenekler (sadece 1 doğru)
4. AÇIKLAMA: Doğru cevabın neden doğru olduğu, ayırıcı tanı ipuçları

Türkçe yaz. Gerçekçi hasta sunumu, klinik detaylar zengin olsun. Zor ama adil sorular.

JSON (başka hiçbir şey yazma):
{
  "questions": [
    {
      "vaka": "52 yaşında kadın hasta...",
      "soru": "Bu hastada ilk yapılacak işlem nedir?",
      "opts": ["A seçeneği", "B seçeneği", "C seçeneği", "D seçeneği", "E seçeneği"],
      "ans": 1,
      "exp": "Doğru B çünkü...",
      "cat": "${cat}",
      "diff": "Orta",
      "tags": ["${topicList[0]}"]
    }
  ]
}

Cevap indeksi 0-4. Tam olarak ${needed} soru üret.`;
}

/* ================================================================
   Component
================================================================ */
export default function FullTUS() {
  const { state, saveState, markSeenQ } = useApp();

  const [phase, setPhase] = useState<Phase>("setup");
  const [scale, setScale] = useState<Scale>(100);
  const plan = buildPlan(scale);
  const totalQ = plan.reduce((s, p) => s + p.needed, 0);

  const [questions, setQuestions] = useState<Q[]>([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [answers, setAnswers] = useState<{ q: Q; sel: number; correct: boolean }[]>([]);
  const [genProgress, setGenProgress] = useState({ done: 0, total: 0, cat: "", failed: 0 });
  const [placementQuery, setPlacementQuery] = useState("");

  /* ---- generate ---- */
  async function startExam() {
    setPhase("generating");
    setGenProgress({ done: 0, total: plan.length, cat: "", failed: 0 });

    const allQs: Q[] = [];
    let failed = 0;

    for (let i = 0; i < plan.length; i++) {
      const subj = plan[i];
      setGenProgress({ done: i, total: plan.length, cat: `${subj.icon} ${subj.cat}`, failed });

      try {
        const cached = await fbGetQuestions(subj.cat, "Orta", subj.needed, state.seenQ || {});
        if (cached.length >= Math.min(subj.needed, 2)) {
          allQs.push(...cached.slice(0, subj.needed));
          markSeenQ(cached.map((q) => q._fid!).filter(Boolean));
          continue;
        }

        const prompt = subj.group === "temel"
          ? temelPrompt(subj.cat, subj.topics, subj.needed)
          : klinikPrompt(subj.cat, subj.topics, subj.needed);

        const raw = await mistralJSON(prompt, 10000, 0.72);
        const parsed = parseJSON(raw) as { questions?: Q[] };
        const qs: Q[] = (parsed?.questions || [])
          .map((q) => ({ ...q, opts: (q.opts || []).slice(0, 5), ans: Math.min(Math.max(0, q.ans || 0), (q.opts?.length || 5) - 1) }))
          .slice(0, subj.needed);

        if (qs.length) {
          allQs.push(...qs);
          fbSaveQuestions(subj.cat, "Orta", qs).then((ids) => { if (ids.length) markSeenQ(ids); }).catch(() => {});
        } else {
          failed++;
        }
      } catch {
        failed++;
        toast.error(`${subj.cat} soruları atlandı`);
      }
    }

    setGenProgress((p) => ({ ...p, done: plan.length, cat: "Tamamlandı ✓" }));

    if (allQs.length === 0) { toast.error("Hiç soru üretilemedi"); setPhase("setup"); return; }

    setQuestions(allQs.sort(() => Math.random() - 0.5));
    setCurrent(0); setSelected(null); setAnswered(false); setAnswers([]);
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
    const ns = { ...state };
    ns.total = (ns.total || 0) + 1;
    if (correct) ns.correct = (ns.correct || 0) + 1;
    else { ns.mistakes = { ...ns.mistakes }; ns.mistakes[q.tags?.[0] || q.cat || "Genel"] = (ns.mistakes[q.tags?.[0] || q.cat || "Genel"] || 0) + 1; }
    ns.byCat = { ...ns.byCat };
    const ck = q.cat || "Genel";
    if (!ns.byCat[ck]) ns.byCat[ck] = { a: 0, c: 0 };
    ns.byCat[ck].a += 1;
    if (correct) ns.byCat[ck].c += 1;
    if (ns.lastDate !== today) { ns.streak = ns.lastDate === prevDay() ? (ns.streak || 0) + 1 : 1; ns.lastDate = today; }
    saveState(ns);
    setAnswers((prev) => [...prev, { q, sel: idx, correct }]);
  }

  function handleNext() {
    if (current + 1 >= questions.length) { setPhase("result"); return; }
    setCurrent((v) => v + 1);
    setSelected(null);
    setAnswered(false);
  }

  /* ---- result helpers ---- */
  const temelCorrect  = answers.filter((a) => a.correct && FULL_TUS_SUBJECTS.find((s) => s.cat === a.q.cat)?.group === "temel").length;
  const temelTotal    = answers.filter((a) => FULL_TUS_SUBJECTS.find((s) => s.cat === a.q.cat)?.group === "temel").length;
  const klinikCorrect = answers.filter((a) => a.correct && FULL_TUS_SUBJECTS.find((s) => s.cat === a.q.cat)?.group === "klinik").length;
  const klinikTotal   = answers.filter((a) => FULL_TUS_SUBJECTS.find((s) => s.cat === a.q.cat)?.group === "klinik").length;

  const totalCorrect = answers.filter((a) => a.correct).length;
  const totalWrong   = answers.filter((a) => !a.correct).length;

  /* Scaled net (adjust for partial exams) */
  const scaleFactor = scale / 200;
  const temelMaxNet  = 100 * scaleFactor;
  const klinikMaxNet = 100 * scaleFactor;

  const temelNet  = temelTotal  > 0 ? Math.round(netScore(temelCorrect,  temelTotal  - temelCorrect)  * 10) / 10 : 0;
  const klinikNet = klinikTotal > 0 ? Math.round(netScore(klinikCorrect, klinikTotal - klinikCorrect) * 10) / 10 : 0;

  /* Normalize nets to 200-question equivalent for TUS puan */
  const temelNet200  = temelTotal  > 0 ? Math.round((temelNet  / temelTotal)  * 100 * 10) / 10 : 0;
  const klinikNet200 = klinikTotal > 0 ? Math.round((klinikNet / klinikTotal) * 100 * 10) / 10 : 0;
  const tusPuan = tusPuanCalc(temelNet200, klinikNet200);
  const mainColor = puanColor(tusPuan);

  /* ================================================================ SETUP */
  if (phase === "setup") {
    const temelSubs  = FULL_TUS_SUBJECTS.filter((s) => s.group === "temel");
    const klinikSubs = FULL_TUS_SUBJECTS.filter((s) => s.group === "klinik");
    const ratio = scale / 200;

    return (
      <div style={{ maxWidth: 800 }}>
        <div style={{ fontFamily: "Playfair Display, serif", fontSize: "1.6rem", fontWeight: 900, color: "var(--cream)", marginBottom: 6 }}>
          Gerçek TUS Denemesi
        </div>
        <div style={{ color: "var(--t2)", fontSize: ".82rem", marginBottom: 28, lineHeight: 1.6 }}>
          Temel Bilimler + Klinik Bilimler tüm branşlar — gerçek TUS soru dağılımında, sınav kalitesinde sorular.
          Sınav sonunda TUS puanınız hesaplanır.
        </div>

        {/* Scale selector */}
        <div className="card" style={{ padding: 20, marginBottom: 18 }}>
          <div style={{ fontSize: ".75rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 14 }}>
            Sınav Boyutu
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {SCALE_OPTIONS.map((opt) => {
              const on = scale === opt.val;
              return (
                <button key={opt.val} onClick={() => setScale(opt.val)} style={{
                  padding: "14px 10px", borderRadius: 10, border: "none", cursor: "pointer",
                  background: on ? "rgba(232,83,74,.15)" : "rgba(255,255,255,.04)",
                  outline: on ? "2px solid rgba(232,83,74,.5)" : "2px solid transparent",
                  transition: "all .12s", textAlign: "center",
                }}>
                  <div style={{ fontSize: "1.1rem", fontWeight: 900, color: on ? "var(--ac)" : "var(--cream)", fontFamily: "Playfair Display, serif" }}>{opt.val}</div>
                  <div style={{ fontSize: ".72rem", fontWeight: 700, color: on ? "var(--ac)" : "var(--t2)", marginTop: 3 }}>{opt.label}</div>
                  <div style={{ fontSize: ".65rem", color: "var(--t3)", marginTop: 2 }}>{opt.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Subject breakdown */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--gold)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 12 }}>
              Temel Bilimler · {Math.round(100 * ratio)} soru
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {temelSubs.map((s) => {
                const n = Math.max(1, Math.round(s.q200 * ratio));
                return (
                  <div key={s.cat} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: ".8rem" }}>{s.icon}</span>
                    <span style={{ fontSize: ".75rem", color: "var(--text)", flex: 1 }}>{s.cat}</span>
                    <span style={{ fontSize: ".7rem", fontWeight: 800, color: "var(--gold)", minWidth: 20, textAlign: "right" }}>{n}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--teal)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 12 }}>
              Klinik Bilimler · {Math.round(100 * ratio)} soru
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {klinikSubs.map((s) => {
                const n = Math.max(1, Math.round(s.q200 * ratio));
                return (
                  <div key={s.cat} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: ".8rem" }}>{s.icon}</span>
                    <span style={{ fontSize: ".75rem", color: "var(--text)", flex: 1 }}>{s.cat}</span>
                    <span style={{ fontSize: ".7rem", fontWeight: 800, color: "var(--teal)", minWidth: 20, textAlign: "right" }}>{n}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.2)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: ".75rem", color: "var(--gold)", lineHeight: 1.6 }}>
          ⏱️ Bu sınav AI ile üretilir. {scale === 200 ? "~60-90" : scale === 100 ? "~35-50" : "~20-30"} dakika sürebilir.
          Üretilen sorular önbelleğe alınır, sonraki sınavlar daha hızlı olur. Sabırsız olmayın — kalite önceliklidir.
        </div>

        <button
          className="btn btn-primary"
          style={{ width: "100%", justifyContent: "center", padding: "14px 24px", fontSize: "1rem" }}
          onClick={startExam}
        >
          🎓 Gerçek TUS Denemesini Başlat — {totalQ} Soru
        </button>
      </div>
    );
  }

  /* ============================================================ GENERATING */
  if (phase === "generating") {
    const pctDone = genProgress.total > 0 ? Math.round((genProgress.done / genProgress.total) * 100) : 0;
    return (
      <div className="loading-screen" style={{ minHeight: "65vh" }}>
        <div className="loading-orb">🎓</div>
        <div className="loading-title">TUS Soruları Hazırlanıyor</div>
        <div style={{ color: "var(--teal)", fontSize: ".82rem", marginTop: 8, fontWeight: 600, textAlign: "center" }}>
          {genProgress.cat || "Başlıyor..."}<span className="loading-dots" />
        </div>
        <div style={{ width: 300, marginTop: 22 }}>
          <div className="progress-bar" style={{ height: 10, borderRadius: 6 }}>
            <div className="progress-fill" style={{ width: `${pctDone}%`, background: "linear-gradient(90deg,var(--teal),var(--blue))", transition: "width .6s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".7rem", color: "var(--t3)", marginTop: 8 }}>
            <span>{genProgress.done}/{genProgress.total} ders</span>
            {genProgress.failed > 0 && <span style={{ color: "var(--ac)" }}>{genProgress.failed} atlandı</span>}
            <span>%{pctDone}</span>
          </div>
        </div>
        <div style={{ marginTop: 20, fontSize: ".72rem", color: "var(--t3)", maxWidth: 280, textAlign: "center", lineHeight: 1.6 }}>
          Her ders için ayrı ayrı TUS kalitesinde sorular üretiliyor. Sabırsız olmayın.
        </div>
      </div>
    );
  }

  /* ================================================================= QUIZ */
  if (phase === "quiz") {
    const q = questions[current];
    const opts = ["A", "B", "C", "D", "E"];
    const subj = FULL_TUS_SUBJECTS.find((s) => s.cat === q.cat);
    const groupColor = subj?.group === "temel" ? "var(--gold)" : "var(--teal)";
    const groupBg    = subj?.group === "temel" ? "rgba(245,158,11,.12)" : "rgba(45,212,191,.12)";
    const groupBorder= subj?.group === "temel" ? "rgba(245,158,11,.3)"  : "rgba(45,212,191,.3)";
    const groupLabel = subj?.group === "temel" ? "Temel Bilimler" : "Klinik Bilimler";
    const progress = Math.round((current / questions.length) * 100);

    return (
      <div style={{ maxWidth: 740 }}>
        {/* Progress */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".75rem", color: "var(--t2)", marginBottom: 6 }}>
            <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 700 }}>{current + 1} / {questions.length}</span>
            <span style={{ fontFamily: "Syne, sans-serif", fontWeight: 600, color: "var(--t3)" }}>
              {subj?.icon} {q.cat} · <span style={{ color: groupColor }}>{groupLabel}</span>
            </span>
          </div>
          <div className="progress-bar" style={{ height: 6, borderRadius: 4 }}>
            <div className="progress-fill" style={{ width: `${progress}%`, background: `linear-gradient(90deg,${groupColor},var(--blue))`, transition: "width .3s" }} />
          </div>
        </div>

        {/* Group badge */}
        <div style={{ marginBottom: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: groupBg, border: `1px solid ${groupBorder}`, color: groupColor, fontSize: ".68rem", fontWeight: 800, padding: "3px 10px", borderRadius: 20, fontFamily: "Syne, sans-serif" }}>
            {subj?.icon} {q.cat} · {groupLabel}
          </span>
        </div>

        {/* Case */}
        <div className="card" style={{ padding: 20, marginBottom: 16, borderLeft: "3px solid var(--blue)" }}>
          <div style={{ fontSize: ".72rem", fontWeight: 800, color: "var(--blue)", textTransform: "uppercase", marginBottom: 8, letterSpacing: ".06em" }}>
            {subj?.group === "temel" ? "Soru Bağlamı" : "Klinik Vaka"}
          </div>
          <div style={{ fontSize: ".88rem", color: "var(--text)", lineHeight: 1.65 }}>{q.vaka}</div>
        </div>

        {/* Question */}
        <div style={{ fontSize: ".95rem", fontWeight: 700, color: "var(--cream)", marginBottom: 16, lineHeight: 1.5 }}>{q.soru}</div>

        {/* Options */}
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 20 }}>
          {(q.opts || []).map((opt, i) => {
            const isSel = selected === i;
            return (
              <button key={i} onClick={() => handleSelect(i)} disabled={answered} style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                padding: "12px 16px", borderRadius: 10, cursor: answered ? "default" : "pointer",
                border: isSel ? "1px solid rgba(45,212,191,.5)" : "1px solid var(--line)",
                background: isSel ? "rgba(45,212,191,.1)" : "rgba(255,255,255,.04)",
                color: isSel ? "var(--teal)" : "var(--text)",
                fontFamily: "Syne, sans-serif", fontSize: ".84rem", fontWeight: isSel ? 700 : 500,
                textAlign: "left", transition: "all .12s",
              }}>
                <span style={{ fontWeight: 900, flexShrink: 0, width: 18, marginTop: 1 }}>{opts[i]}.</span>
                <span style={{ lineHeight: 1.5 }}>{opt}</span>
              </button>
            );
          })}
        </div>

        {answered && (
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={handleNext}>
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
          {answers.map(({ q, sel, correct }, idx) => {
            const subj = FULL_TUS_SUBJECTS.find((s) => s.cat === q.cat);
            const groupColor = subj?.group === "temel" ? "var(--gold)" : "var(--teal)";
            return (
              <div key={idx} className="card" style={{ padding: 18, borderLeft: `3px solid ${correct ? "var(--green)" : "var(--ac)"}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: ".7rem", fontWeight: 800, color: "var(--t3)", fontFamily: "Syne, sans-serif" }}>S{idx + 1}</span>
                  <span style={{ fontSize: ".68rem", background: correct ? "rgba(16,185,129,.15)" : "rgba(232,83,74,.12)", color: correct ? "var(--green)" : "var(--ac)", padding: "2px 8px", borderRadius: 20, fontWeight: 800 }}>
                    {correct ? "✓ Doğru" : "✗ Yanlış"}
                  </span>
                  <span style={{ fontSize: ".68rem", color: groupColor, marginLeft: 4, fontWeight: 700 }}>{subj?.icon} {q.cat}</span>
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
                <div style={{ fontSize: ".78rem", color: "var(--t2)", lineHeight: 1.55, background: "rgba(255,255,255,.04)", padding: "10px 12px", borderRadius: 8 }}>{q.exp}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* =============================================================== RESULT */
  if (phase === "result") {
    const overallPct = answers.length > 0 ? Math.round((totalCorrect / answers.length) * 100) : 0;
    const barPct = Math.max(0, Math.min(100, Math.round(((tusPuan - 40) / 40) * 100)));
    const placementMatches = searchTusPrograms(placementQuery, tusPuan, placementQuery.trim() ? 12 : 8);

    /* Per-category */
    const catMap: Record<string, { correct: number; total: number; group: "temel" | "klinik"; icon: string }> = {};
    answers.forEach(({ q, correct }) => {
      const s = FULL_TUS_SUBJECTS.find((s) => s.cat === q.cat);
      if (!catMap[q.cat]) catMap[q.cat] = { correct: 0, total: 0, group: s?.group || "klinik", icon: s?.icon || "📋" };
      catMap[q.cat].total += 1;
      if (correct) catMap[q.cat].correct += 1;
    });
    const catResults = Object.entries(catMap).sort((a, b) => (a[1].correct / a[1].total) - (b[1].correct / b[1].total));

    return (
      <div style={{ maxWidth: 800 }}>
        <div style={{ fontFamily: "Playfair Display, serif", fontSize: "1.5rem", fontWeight: 900, color: "var(--cream)", marginBottom: 4 }}>
          TUS Denemesi Sonucu
        </div>
        <div style={{ color: "var(--t2)", fontSize: ".82rem", marginBottom: 22 }}>{answers.length} soru · Gerçek TUS Dağılımı</div>

        {/* Main score cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
          {/* TUS puan */}
          <div className="card" style={{ padding: 20, textAlign: "center", gridColumn: "span 1" }}>
            <div style={{ fontSize: ".62rem", fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Tahmini TUS Puanı</div>
            <div style={{ fontSize: "3rem", fontWeight: 900, fontFamily: "Playfair Display, serif", color: mainColor, lineHeight: 1 }}>{tusPuan.toFixed(1)}</div>
            <div style={{ fontSize: ".65rem", color: "var(--t3)", marginTop: 4 }}>/ 100</div>
            <div style={{ marginTop: 12 }}>
              <div className="progress-bar" style={{ height: 7, borderRadius: 4 }}>
                <div className="progress-fill" style={{ width: `${barPct}%`, background: mainColor, transition: "width .8s" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".58rem", color: "var(--t3)", marginTop: 4 }}>
                <span>40</span><span>60</span><span>80</span>
              </div>
            </div>
          </div>

          {/* Temel */}
          <div className="card" style={{ padding: 20, textAlign: "center" }}>
            <div style={{ fontSize: ".62rem", fontWeight: 800, color: "var(--gold)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Temel Bilimler</div>
            <div style={{ fontSize: "2.2rem", fontWeight: 900, fontFamily: "Playfair Display, serif", color: pctColor(temelTotal > 0 ? Math.round(temelCorrect / temelTotal * 100) : 0), lineHeight: 1 }}>
              {temelTotal > 0 ? Math.round(temelCorrect / temelTotal * 100) : 0}<span style={{ fontSize: "1rem" }}>%</span>
            </div>
            <div style={{ fontSize: ".7rem", color: "var(--t2)", marginTop: 6 }}>{temelCorrect}/{temelTotal} · net {Math.max(0, temelNet)}</div>
            <div style={{ fontSize: ".62rem", color: "var(--t3)", marginTop: 3 }}>SP: {(50 + 10 * (temelNet200 - TB_MEAN) / TB_SD).toFixed(1)}</div>
          </div>

          {/* Klinik */}
          <div className="card" style={{ padding: 20, textAlign: "center" }}>
            <div style={{ fontSize: ".62rem", fontWeight: 800, color: "var(--teal)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Klinik Bilimler</div>
            <div style={{ fontSize: "2.2rem", fontWeight: 900, fontFamily: "Playfair Display, serif", color: pctColor(klinikTotal > 0 ? Math.round(klinikCorrect / klinikTotal * 100) : 0), lineHeight: 1 }}>
              {klinikTotal > 0 ? Math.round(klinikCorrect / klinikTotal * 100) : 0}<span style={{ fontSize: "1rem" }}>%</span>
            </div>
            <div style={{ fontSize: ".7rem", color: "var(--t2)", marginTop: 6 }}>{klinikCorrect}/{klinikTotal} · net {Math.max(0, klinikNet)}</div>
            <div style={{ fontSize: ".62rem", color: "var(--t3)", marginTop: 3 }}>SP: {(50 + 10 * (klinikNet200 - KB_MEAN) / KB_SD).toFixed(1)}</div>
          </div>
        </div>

        <div className="placement-panel" style={{ marginBottom: 20 }}>
          <div className="panel-head">
            <div>
              <div className="eyebrow">Nereye yerle?ebilirim?</div>
              <h2>Kurum ve b?l?m kontrol?</h2>
            </div>
            <a href={TUS_SCORE_SOURCE.url} target="_blank" rel="noreferrer" style={{ color: "var(--t3)", fontSize: ".7rem" }}>?SYM verisi</a>
          </div>
          <div className="placement-search">
            <input
              value={placementQuery}
              onChange={(e) => setPlacementQuery(e.target.value)}
              placeholder="?rn: OM? plastik, Ankara g?z"
            />
            <span>{placementQuery.trim() ? "Arama sonucu" : "Deneme puan?na g?re en yak?n kurumlar"}</span>
          </div>
          <div className="placement-grid">
            {placementMatches.map((item) => (
              <div className={`placement-card program-card ${item.status}`} key={item.code}>
                <div>
                  <strong>{item.institution}</strong>
                  <span>{item.specialty}</span>
                  <small>{item.message}</small>
                </div>
                <div>
                  <b>{item.minScore === null ? "Bo?" : item.minScore.toFixed(2)}</b>
                  <em>{placementStatusLabel(item.status)}</em>
                  <small>{item.placed}/{item.quota} yerle?en</small>
                </div>
              </div>
            ))}
          </div>
          {placementQuery.trim() && placementMatches.length === 0 && (
            <div className="near-note">Sonu? bulunamad?. Daha k?sa aramay? dene: ?plastik?, ?ankara g?z?, ?ondokuz may?s?.</div>
          )}
        </div>
        {/* Genel ozet */}
        <div className="card" style={{ padding: 18, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-around", textAlign: "center" }}>
            {[
              { label: "Toplam Soru", val: `${answers.length}`, color: "var(--cream)" },
              { label: "Doğru", val: `${totalCorrect}`, color: "var(--green)" },
              { label: "Yanlış", val: `${totalWrong}`, color: "var(--ac)" },
              { label: "Genel Başarı", val: `%${overallPct}`, color: pctColor(overallPct) },
            ].map((r) => (
              <div key={r.label}>
                <div style={{ fontSize: "1.5rem", fontWeight: 900, fontFamily: "Playfair Display, serif", color: r.color }}>{r.val}</div>
                <div style={{ fontSize: ".65rem", color: "var(--t3)", marginTop: 3, fontFamily: "Syne, sans-serif" }}>{r.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Category breakdown */}
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: ".85rem", fontWeight: 700, color: "var(--cream)", marginBottom: 14 }}>Ders Analizi</div>
          <table className="plan-table" style={{ marginBottom: 0 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Ders</th>
                <th>Bölüm</th>
                <th>D/T</th>
                <th>%</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {catResults.map(([cat, r]) => {
                const p = r.total > 0 ? Math.round((r.correct / r.total) * 100) : 0;
                const col = pctColor(p);
                const badge = p >= 70 ? "✅" : p >= 50 ? "🟡" : "🔴";
                const s = FULL_TUS_SUBJECTS.find((s) => s.cat === cat);
                return (
                  <tr key={cat}>
                    <td><div style={{ display: "flex", alignItems: "center", gap: 6 }}><span>{r.icon}</span><span style={{ fontWeight: 600 }}>{cat}</span></div></td>
                    <td style={{ textAlign: "center", fontSize: ".68rem", color: r.group === "temel" ? "var(--gold)" : "var(--teal)", fontWeight: 700 }}>
                      {r.group === "temel" ? "Temel" : "Klinik"}
                    </td>
                    <td style={{ textAlign: "center", color: "var(--t2)" }}>{r.correct}/{r.total}</td>
                    <td style={{ textAlign: "center", fontWeight: 800, color: col }}>%{p}</td>
                    <td style={{ textAlign: "center" }}>{badge}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 12 }}>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => setPhase("setup")}>
            ↺ Yeni Deneme
          </button>
          <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => setPhase("review")}>
            📖 Soruları İncele
          </button>
        </div>
      </div>
    );
  }

  return null;
}
