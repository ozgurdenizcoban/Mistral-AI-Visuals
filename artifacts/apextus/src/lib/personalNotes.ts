import type { AppState, PersonalNoteEntry, PersonalNoteVolume } from "@/contexts/AppContext";
import type { QuizQuestion } from "@/lib/firestore";
import { SR_INTERVALS } from "@/lib/data";
import { mistralText } from "@/lib/mistral";
import { addDays, toDay } from "@/lib/utils";

const MAX_ENTRIES_PER_VOLUME = 18;
const MAX_NOTE_CHARS = 18000;
const AI_NOTE_TIMEOUT_MS = 90000;

function clean(value?: string) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function optionLabel(index: number) {
  return ["A", "B", "C", "D", "E"][index] || "-";
}

function stripFence(html: string) {
  return html.replace(/^```(?:html)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function fallbackLearningNote(q: QuizQuestion, selected: number) {
  const topic = q.tags?.[0] || q.cat || "Genel";
  return [
    `<h3>${topic} - Kisisel Konu Notu</h3>`,
    `<p>Bu not, yaptigin yanlisa gore olusturuldu. Ana hedef soruyu ezberlemek degil, ayni konudan gelen yeni bir TUS sorusunda ipucunu taniyabilmek.</p>`,
    `<h4>Ogrenilecek cekirdek bilgi</h4>`,
    `<p>${clean(q.exp) || clean(q.soru)}</p>`,
    `<h4>TUS'ta nasil sorulur?</h4>`,
    `<ul><li>Vaka metninde ayirici ipucunu bul.</li><li>Dogru cevabin mekanizmasini ve en yakin yanlis secenegi neden eleyecegini bil.</li><li>Bu basliktan 5 hedefli soru coz.</li></ul>`,
    `<h4>Son hata</h4>`,
    `<p>Secilen: ${optionLabel(selected)} | Dogru: ${optionLabel(q.ans)}</p>`,
  ].join("");
}

function makeEntry(q: QuizQuestion, selected: number): PersonalNoteEntry {
  const selectedText = selected >= 0 ? q.opts?.[selected] || "" : "";
  const correctText = q.opts?.[q.ans] || "";
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    date: toDay(),
    cat: q.cat || "Genel",
    topic: q.tags?.[0] || q.cat || "Genel",
    vaka: clean(q.vaka),
    question: clean(q.soru),
    selected: optionLabel(selected),
    selectedText: clean(selectedText),
    correct: optionLabel(q.ans),
    correctText: clean(correctText),
    explanation: clean(q.exp),
    options: (q.opts || []).map(clean),
    noteHtml: "",
  };
}

function shouldStartNewVolume(note?: PersonalNoteVolume) {
  if (!note) return true;
  return note.entries.length >= MAX_ENTRIES_PER_VOLUME || (note.contentHtml || "").length >= MAX_NOTE_CHARS;
}

function createVolume(index: number): PersonalNoteVolume {
  const today = toDay();
  return {
    id: `wrong-note-${index}`,
    title: `Kisisel Konu Notu ${index}`,
    contentHtml: "",
    createdAt: today,
    updatedAt: today,
    level: 0,
    studyCount: 0,
    nextDate: today,
    entries: [],
  };
}

async function buildAiLearningNote(previousHtml: string, q: QuizQuestion, selected: number, volumeTitle: string) {
  const selectedText = selected >= 0 ? q.opts?.[selected] || "Bos" : "Bos";
  const correctText = q.opts?.[q.ans] || "";
  const topic = q.tags?.[0] || q.cat || "Genel";
  const previous = previousHtml ? previousHtml.slice(-12000) : "";

  const prompt = `Sen TUS'a hazirlanan bir hekim icin kisisel konu anlatimi hazirlayan ust duzey TUS hocasisin.
Gorev: Ogrencinin yanlis yaptigi sorudan bilgi eksigini tespit et ve o kisinin tekrar edip ogrenebilecegi sifirdan konu notu yaz.

Not basligi: ${volumeTitle}
Ders: ${q.cat || "Genel"}
Konu etiketi: ${topic}
Soru vaka/metin: ${clean(q.vaka)}
Soru: ${clean(q.soru)}
Secenekler: ${(q.opts || []).map((o, i) => `${optionLabel(i)}) ${clean(o)}`).join(" | ")}
Ogrencinin sectigi: ${optionLabel(selected)} - ${clean(selectedText)}
Dogru cevap: ${optionLabel(q.ans)} - ${clean(correctText)}
Mevcut aciklama: ${clean(q.exp)}

Onceki kisisel konu notu:
${previous || "Bu ciltte henuz konu notu yok."}

Kurallar:
- Bu bir yanlis defteri degil; soru detaylarini listeleme, konuyu ogret.
- Ogrencinin neden yanildigini acikca hedefle: kavram eksigi, ayirici tani eksigi, mekanizma eksigi veya ezber tuzagi.
- Onceki notu koru ama dagitma; yeni bilgiyi mantikli baslik altina yerlestir.
- TUS odakli yaz: klinik ipucu, mekanizma, ayirici tani, sik tuzak, karar algoritmasi, mini tablo.
- Gereksiz genel bilgi verme; sinavda net kazandiracak bilgi yaz.
- En sonda "Aktif hatirlama" diye 6 soru ve "Bugun uygulanacak pekistirme" diye 10 soruluk odev ekle.
- Kompakt ama ogretici yaz; bos slogan yazma.
- Sadece HTML dondur. Markdown kullanma.

HTML iskeleti:
<h3>...</h3>
<p><strong>Kisisel hata yorumu:</strong> ...</p>
<h4>1. Konuyu sifirdan kur</h4>
<p>...</p>
<h4>2. TUS'ta yakalanacak ipuclari</h4>
<ul>...</ul>
<h4>3. Ayirici tani / tuzak tablo</h4>
<table><thead><tr><th>Durum</th><th>Ipucu</th><th>TUS tuzagi</th></tr></thead><tbody>...</tbody></table>
<h4>4. Karar algoritmasi</h4>
<ol>...</ol>
<h4>5. Aktif hatirlama</h4>
<ol>...</ol>
<h4>Bugun uygulanacak pekistirme</h4>
<p>...</p>`;

  return stripFence(await withTimeout(mistralText(prompt, 7000, 0.18), AI_NOTE_TIMEOUT_MS, "Kisisel not hazirlama zaman asimi"));
}

async function buildAiLearningNoteFromEntries(note: PersonalNoteVolume) {
  const history = note.entries.slice(-12).map((entry, index) =>
    `${index + 1}. Ders: ${entry.cat}
Konu: ${entry.topic}
Vaka: ${entry.vaka || "-"}
Soru: ${entry.question}
Secenekler: ${(entry.options || []).map((o, i) => `${optionLabel(i)}) ${o}`).join(" | ")}
Secilen: ${entry.selected}${entry.selectedText ? ` - ${entry.selectedText}` : ""}
Dogru: ${entry.correct}${entry.correctText ? ` - ${entry.correctText}` : ""}
Aciklama: ${entry.explanation || "-"}`
  ).join("\n");

  const prompt = `Sen TUS'a hazirlanan bir hekim icin kisisel konu anlatimi hazirlayan ust duzey TUS hocasisin.
Asagidaki yanlis kayitlarindan ortak bilgi eksiklerini cikar ve sifirdan ogreten tek bir konu notu hazirla.
Bu bir yanlis listesi olmayacak; ogrencinin tekrar edip ogrenebilecegi sinav odakli konu anlatimi olacak.

Not basligi: ${note.title}
Yanlis kayitlari:
${history || "Kayit yok."}

Kurallar:
- Soru soru liste tutma.
- Ortak eksik bilgi kaliplarini birlestir ve konuyu sifirdan anlat.
- TUS odakli anlat: mekanizma, klinik ipucu, ayirici tani, tuzak, karar algoritmasi, mini tablo.
- Eski not kotu/bos olsa bile kullanma; bastan kaliteli konu notu yaz.
- En sona 6 aktif hatirlama sorusu ve 10 soruluk pekistirme odevini ekle.
- Sadece HTML dondur.

<h3>...</h3>
<p><strong>Kisisel hata yorumu:</strong> ...</p>
<h4>1. Konuyu sifirdan kur</h4>
<p>...</p>
<h4>2. TUS ipuclari ve tuzaklar</h4>
<table><thead><tr><th>Ipucu</th><th>Anlami</th><th>Tuzak</th></tr></thead><tbody>...</tbody></table>
<h4>3. Karar algoritmasi</h4>
<ol>...</ol>
<h4>4. Aktif hatirlama</h4>
<ol>...</ol>
<h4>Bugun uygulanacak pekistirme</h4>
<p>...</p>`;

  return stripFence(await withTimeout(mistralText(prompt, 7000, 0.18), AI_NOTE_TIMEOUT_MS, "Kisisel not hazirlama zaman asimi"));
}

function fallbackVolumeNote(note: PersonalNoteVolume) {
  const grouped = note.entries.reduce<Record<string, PersonalNoteEntry[]>>((acc, entry) => {
    const key = entry.topic || entry.cat || "Genel";
    acc[key] = acc[key] || [];
    acc[key].push(entry);
    return acc;
  }, {});

  const blocks = Object.entries(grouped).map(([topic, entries]) => `
    <h4>${topic}</h4>
    <p>Bu baslikta ${entries.length} hata kaydi var. Once temel mekanizmayi oku, sonra ayni basliktan 5 hedefli soru coz.</p>
    <ul>
      ${entries.slice(-4).map((entry) => `<li>${entry.question} <strong>Dogru:</strong> ${entry.correct}</li>`).join("")}
    </ul>
  `).join("");

  return `<h3>${note.title}</h3>
  <p><strong>Kisisel calisma notu:</strong> Bu not, yanlis yaptigin basliklari ogrenmeye donusturmek icin hazirlandi. Once konu mantigini oku, sonra aktif hatirlama sorularini kapali sekilde cevapla.</p>
  ${blocks}
  <h4>Aktif hatirlama</h4>
  <ol><li>Bu konularda en sik karistirdigin ipucu ne?</li><li>Dogru cevabi hangi bulguya gore sececeksin?</li><li>En yakin yanlis secenek neden elenir?</li><li>Bu basliktan 5 soru cozunce hata tekrar ediyor mu?</li><li>Bir cumlelik ana kuralin ne?</li></ol>
  <h4>Bugun uygulanacak pekistirme</h4>
  <p>Bu notu okuduktan sonra ayni basliklardan 10 hedefli soru coz; yanlis tekrar ederse notu yeniden AI ile derinlestir.</p>`;
}

export function getPersonalNotesDue(state: AppState, today = toDay()) {
  return (state.personalNotes || []).filter((note) => !note.nextDate || note.nextDate <= today);
}

export async function addWrongToPersonalNotes(state: AppState, q: QuizQuestion, selected: number): Promise<AppState> {
  const notes = [...(state.personalNotes || [])];
  let active = notes[notes.length - 1];
  if (shouldStartNewVolume(active)) {
    active = createVolume(notes.length + 1);
    notes.push(active);
  }

  const entry = makeEntry(q, selected);
  let contentHtml = "";
  try {
    contentHtml = await buildAiLearningNote(active.contentHtml || "", q, selected, active.title);
  } catch (_) {
    contentHtml = active.contentHtml
      ? `${active.contentHtml}<hr />${fallbackLearningNote(q, selected)}`
      : fallbackLearningNote(q, selected);
  }

  const updated: PersonalNoteVolume = {
    ...active,
    contentHtml,
    updatedAt: toDay(),
    nextDate: toDay(),
    entries: [...active.entries, { ...entry, noteHtml: contentHtml }],
  };
  notes[notes.length - 1] = updated;

  return { ...state, personalNotes: notes };
}

export async function rebuildPersonalNoteVolume(state: AppState, noteId: string): Promise<AppState> {
  const notes = [...(state.personalNotes || [])];
  const index = notes.findIndex((note) => note.id === noteId);
  if (index < 0) return state;

  const note = notes[index];
  let contentHtml = "";
  try {
    contentHtml = await buildAiLearningNoteFromEntries(note);
  } catch (_) {
    contentHtml = fallbackVolumeNote(note);
  }

  notes[index] = {
    ...note,
    contentHtml,
    updatedAt: toDay(),
    nextDate: toDay(),
  };
  return { ...state, personalNotes: notes };
}

export function markPersonalNoteStudied(state: AppState, noteId: string): AppState {
  const notes = (state.personalNotes || []).map((note) => {
    if (note.id !== noteId) return note;
    const level = Math.min((note.level || 0) + 1, SR_INTERVALS.length - 1);
    return {
      ...note,
      level,
      studyCount: (note.studyCount || 0) + 1,
      nextDate: addDays(SR_INTERVALS[level]),
      updatedAt: toDay(),
    };
  });
  return { ...state, personalNotes: notes };
}
