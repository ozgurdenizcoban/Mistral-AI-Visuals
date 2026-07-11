import type { AppState, PersonalNoteEntry, PersonalNoteVolume } from "@/contexts/AppContext";
import type { QuizQuestion } from "@/lib/firestore";
import { SR_INTERVALS } from "@/lib/data";
import { mistralText } from "@/lib/mistral";
import { addDays, toDay } from "@/lib/utils";

const MAX_ENTRIES_PER_VOLUME = 18;
const MAX_NOTE_CHARS = 18000;

function clean(value?: string) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function optionLabel(index: number) {
  return ["A", "B", "C", "D", "E"][index] || "-";
}

function stripFence(html: string) {
  return html.replace(/^```(?:html)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
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
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    date: toDay(),
    cat: q.cat || "Genel",
    topic: q.tags?.[0] || q.cat || "Genel",
    question: clean(q.soru),
    selected: optionLabel(selected),
    correct: optionLabel(q.ans),
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

  const prompt = `Sen TUS'a hazirlanan bir ogrenci icin kisisel konu anlatimi hazirlayan uzman bir TUS hocasisin.
Gorev: Ogrencinin yanlis yaptigi sorudan konuyu tespit et ve "yanlis defteri" degil, sifirdan ogreten konu notu yaz.

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
- Cikti tek bir konu notu gibi aksin; soru soru liste tutma.
- Ogrencinin hatasindan anlasilan bilgi eksigini hedefle.
- Yeni bilgiyi onceki notla birlestir; tekrar eden basliklari sisirme.
- TUS odakli olsun: klinik ipucu, mekanizma, ayirici tani, sik tuzak, akilda kalacak mini tablo.
- En sonda "Aralikli tekrar sorulari" diye 5 aktif hatirlama sorusu ekle.
- 10 sayfalik notu asmayacak kadar kompakt ama ogretici yaz.
- Sadece HTML dondur. Markdown kullanma.

HTML iskeleti:
<h3>...</h3>
<p>...</p>
<h4>Sinavda yakalanacak ipucu</h4>
<ul>...</ul>
<h4>Konu anlatimi</h4>
<p>...</p>
<h4>Ayirici tani / tuzak tablo</h4>
<table><thead><tr><th>Durum</th><th>Ipucu</th><th>TUS tuzagi</th></tr></thead><tbody>...</tbody></table>
<h4>Aralikli tekrar sorulari</h4>
<ol>...</ol>`;

  return stripFence(await mistralText(prompt, 18000, 0.2));
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
