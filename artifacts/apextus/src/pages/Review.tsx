import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { mistralText } from "@/lib/mistral";
import { getPersonalNotesDue, markPersonalNoteStudied, rebuildPersonalNoteVolume } from "@/lib/personalNotes";
import { getScoreSimulation } from "@/lib/studyInsights";
import { toDay } from "@/lib/utils";
import { toast } from "sonner";

export default function Review() {
  const { state, saveState, setCurrentPage } = useApp();
  const [planHtml, setPlanHtml] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [tusDate, setTusDate] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState(4);
  const [targetScore, setTargetScore] = useState(65);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [noteLoadingId, setNoteLoadingId] = useState<string | null>(null);

  const today = toDay();
  const personalNotes = state.personalNotes || [];
  const dueNotes = getPersonalNotesDue(state, today);
  const activeNotes = dueNotes.length ? dueNotes : personalNotes.slice(-1);
  const daysLeft = tusDate ? Math.max(1, Math.round((new Date(tusDate).getTime() - Date.now()) / 86400000)) : 90;
  const sim = getScoreSimulation(state, daysLeft, hoursPerDay, targetScore);

  const weakSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    personalNotes.forEach((note) => note.entries.forEach((entry) => {
      counts[entry.topic] = (counts[entry.topic] || 0) + 1;
    }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [personalNotes]);

  function markStudied(noteId: string) {
    saveState(markPersonalNoteStudied(state, noteId));
    toast.success("Kisisel not tekrar tarihi guncellendi");
  }

  async function rebuildNote(noteId: string) {
    setNoteLoadingId(noteId);
    try {
      const next = await rebuildPersonalNoteVolume(state, noteId);
      saveState(next);
      setOpenNoteId(noteId);
      toast.success("Kisisel konu notu hazirlandi");
    } catch (e) {
      toast.error("Not hazirlanamadi: " + (e as Error).message);
    } finally {
      setNoteLoadingId(null);
    }
  }

  async function generatePlan() {
    setPlanLoading(true);
    const noteSummary = personalNotes.map((note) => {
      const topics = note.entries.slice(-8).map((e) => `${e.topic}: ${e.question}`).join("\n");
      return `${note.title} (${note.entries.length} hata, sonraki tekrar: ${note.nextDate || "bugun"})\nSon hata konulari:\n${topics}\nMevcut kisisel konu notundan ozet:\n${(note.contentHtml || "").replace(/<[^>]+>/g, " ").slice(0, 1800)}`;
    }).join("\n\n");

    const prompt = `Sen deneyimli bir TUS kocusun. Ogrenciye TUS tarihine kadar profesyonel, hedefe yonelik ve uygulanabilir plan hazirla.
Hedef puan: ${targetScore}
Kalan gun: ${daysLeft}
Gunluk calisma suresi: ${hoursPerDay} saat
Mevcut tahmini puan bandi: ${sim.currentBand[0]}-${sim.currentBand[1]}
Planla beklenen puan bandi: ${sim.expectedBand[0]}-${sim.expectedBand[1]}

Ogrencinin sadece yanlislarindan olusan kisisel notlari:
${noteSummary || "Henuz yanlis notu yok."}

Kurallar:
- Dogru yaptigi konulari plana sisirme; ana odak yanlis kaliplari ve deneme analizi olsun.
- TUS calisma plani mantigi kullan: once zayif konu kapatma, sonra brans denemesi, sonra karma deneme, sonra son tekrar.
- Plani fazlara bol: tani koyma fazi, eksik kapatma fazi, deneme/analiz fazi, son tekrar fazi.
- Gunluk plan "80 soru coz" deyip gecmesin; blok blok yaz: konu notu, aktif hatirlama, hedefli soru, yanlis analizi, mini tekrar.
- Calisan ogrenci gibi dusun: ${hoursPerDay} saatlik gunu gercekci bloklara bol.
- Her fazda olculen metrikleri yaz: net artisi, hata tekrari, konu kapatma, deneme hizi.
- Her 7 gunde bir deneme analizi ve plan revizyonu koy.
- Yanlis notlari icin aralikli tekrar gunlerini kullan: bugun, 3 gun, 7 gun, 14 gun, 30 gun.
- Puan vaadi kesin olmasin; beklenen etkiyi aralik olarak yaz.
- Cikti sadece HTML olsun.

HTML iskeleti:
<h3>TUS Kocu Plani</h3>
<p>...</p>
<h4>1. Faz Haritasi</h4>
<table><thead><tr><th>Faz</th><th>Sure</th><th>Odak</th><th>Olcum</th><th>Beklenen etki</th></tr></thead><tbody>...</tbody></table>
<h4>2. Gunluk Blok Sablonu</h4>
<table><thead><tr><th>Blok</th><th>Sure</th><th>Is</th><th>Cikti</th></tr></thead><tbody>...</tbody></table>
<h4>3. Haftalik Revizyon</h4>
<ul>...</ul>
<div class="tip"><strong>Bu haftanin net hedefi:</strong> ...</div>`;

    try {
      const html = await mistralText(prompt, 16000, 0.22);
      setPlanHtml(html.replace(/^```(?:html)?\s*/i, "").replace(/\s*```\s*$/, "").trim());
    } catch (e) {
      toast.error("Plan olusturulamadi: " + (e as Error).message);
    } finally {
      setPlanLoading(false);
    }
  }

  const NoteCard = ({ note }: { note: typeof personalNotes[number] }) => {
    const isOpen = openNoteId === note.id;
    const lastEntry = note.entries[note.entries.length - 1];
    const hasContent = !!(note.contentHtml || "").trim();
    const isPreparing = noteLoadingId === note.id;
    return (
      <div className="personal-note-card">
        <div className="personal-note-top">
          <div>
            <div className="eyebrow">{note.entries.length >= 24 ? "Dolu cilt" : "Aktif cilt"}</div>
            <h2>{note.title}</h2>
            <p>{note.entries.length} yanlis kaydi · Son konu: {lastEntry?.topic || "Henuz yok"}</p>
          </div>
          <div className="task-actions">
            <button className="btn btn-ghost sm" onClick={() => setOpenNoteId(isOpen ? null : note.id)}>{isOpen ? "Kapat" : "Notu ac"}</button>
            {!hasContent && (
              <button className="btn btn-teal sm" onClick={() => rebuildNote(note.id)} disabled={isPreparing}>
                {isPreparing ? "Hazirlaniyor..." : "Notu hemen hazirla"}
              </button>
            )}
            {hasContent && (
              <button className="btn btn-teal sm" onClick={() => rebuildNote(note.id)} disabled={isPreparing}>
                {isPreparing ? "Yeniden yaziliyor..." : "AI ile derinlestir"}
              </button>
            )}
            <button className="btn btn-primary sm" onClick={() => markStudied(note.id)}>Tekrar ettim</button>
          </div>
        </div>
        {isOpen && (
          hasContent
            ? <div className="personal-note-body nb ai-topic-note" dangerouslySetInnerHTML={{ __html: note.contentHtml }} />
            : <div className="personal-note-body ai-topic-note">
                <h3>Bu not henuz konu anlatimina donusmedi</h3>
                <p>Eski kayittan gelen yanlislar var ama konu notu govdesi bos. <strong>Notu hemen hazirla</strong> dugmesine bas; sistem bu yanlislardan sifirdan kisisel konu notu uretecek.</p>
              </div>
        )}
      </div>
    );
  };

  return (
    <div className="review-simple">
      <section className="review-hero">
        <div>
          <div className="eyebrow">Kisisel yanlis notu</div>
          <h1>Sadece yanlislarini ogreten tekrar</h1>
          <p>Dogru yaptigin konular burada kalabalik yapmaz. Her yanlis soru tek bir yasayan nota eklenir; not dolunca otomatik ikinci cilt acilir.</p>
        </div>
        <div className="review-score">
          <strong>{personalNotes.reduce((sum, n) => sum + n.entries.length, 0)}</strong>
          <span>ogrenilecek hata kaydi</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="eyebrow">Aralikli tekrar</div>
            <h2>Bugun calisilacak kisisel not</h2>
          </div>
          <span className="tag tag-teal">{activeNotes.length} not</span>
        </div>
        {activeNotes.length ? activeNotes.map((note) => <NoteCard key={note.id} note={note} />) : (
          <div className="empty-state">
            Henuz yanlis notu yok. Bir quiz veya deneme coz; ilk yanlisin burada kisisel konu notuna donusecek.
          </div>
        )}
      </section>

      <section className="review-grid">
        <div className="panel">
          <div className="panel-head compact">
            <div>
              <div className="eyebrow">Zayiflik haritasi</div>
              <h2>En cok tekrar eden hatalar</h2>
            </div>
          </div>
          {weakSummary.length ? weakSummary.map(([topic, count], i) => (
            <div className="simple-task" key={topic}>
              <div className="task-no">{i + 1}</div>
              <div className="task-main">
                <strong>{topic}</strong>
                <span>{count} kez yanlis yapildi</span>
              </div>
            </div>
          )) : <div className="empty-state">Zayif konu analizi icin once biraz soru cozmek gerekiyor.</div>}
        </div>

        <div className="panel">
          <div className="panel-head compact">
            <div>
              <div className="eyebrow">Koç modu</div>
              <h2>TUS'a kadar plan</h2>
            </div>
          </div>
          <div className="plan-controls-simple single">
            <label>TUS tarihi <input type="date" value={tusDate} onChange={(e) => setTusDate(e.target.value)} /></label>
            <label>Gunluk saat <input type="number" min={1} max={12} value={hoursPerDay} onChange={(e) => setHoursPerDay(Number(e.target.value) || 4)} /></label>
            <label>Hedef puan <input type="number" min={35} max={90} value={targetScore} onChange={(e) => setTargetScore(Number(e.target.value) || 65)} /></label>
          </div>
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 12 }} onClick={generatePlan} disabled={planLoading}>
            {planLoading ? "Koc plani hazirlaniyor..." : "AI TUS kocu plan olustur"}
          </button>
          <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} onClick={() => setCurrentPage("quiz")}>
            Yanlis notu icin soru coz
          </button>
        </div>
      </section>

      {planHtml && <section className="panel plan-output" dangerouslySetInnerHTML={{ __html: planHtml }} />}
    </div>
  );
}
