import type { AppState, PersonalNoteEntry, PersonalNoteVolume } from "@/contexts/AppContext";
import type { QuizQuestion } from "@/lib/firestore";
import { SR_INTERVALS } from "@/lib/data";
import { mistralText } from "@/lib/mistral";
import { addDays, toDay } from "@/lib/utils";

const MAX_ENTRIES_PER_VOLUME = 18;
const MAX_NOTE_CHARS = 18000;
const AI_NOTE_TIMEOUT_MS = 210000;

const PERSONAL_NOTE_STANDARD = `PROFESYONEL KONU NOTU STANDARDI:
- ERISILEBILIRLIK KURALI: Metin ve arka plan her zaman yuksek kontrastli olsun. Acik zeminde koyu metin, koyu zeminde saf beyaz metin kullan; yakin tonlari ASLA birlikte kullanma.
- HTML icinde style="color:..." veya style="background:..." kullanma. Renk icin yalnizca tip, warn, algo, mnem ve score-box siniflarini kullan.
- Soluk, dusuk opaklikli veya arka planla karisan metin uretme.
- Diyagram zemini daima acik; oklar ve baglanti cizgileri koyu mor olsun. Siyah genel arka plan veya beyaz/gorunmez ok kullanma.
- Koyu kutuda saf beyaz, acik kutuda cok koyu metin kullan.
- Normal konu notlari sayfasindaki gibi tam, ogretici ve sinav odakli konu anlatimi yaz.
- Bu bir yanlis defteri degil. Yanlis sorular sadece hangi konunun anlatilacagini secmek icin kullanilir.
- Konuyu sifirdan kur: tanim, mekanizma, klinik yansima, TUS'ta sorulma bicimi.
- Her ana baslikta "Neden onemli?", "TUS nasil sorar?", "Karistirilan nokta" mantigi bulunsun.
- En az 8 TUS spotu, 1 klinik vaka ornegi, 1 ayirici tani tablosu, 1 karar/tani algoritmasi, 1 yanlis tuzagi bolumu ve aktif hatirlama sorulari olsun.
- Gereksiz genel kultur anlatimi yapma; sinavda puan getirecek bilgiye yogunlas.
- Cikti normal not HTML'i gibi olsun: <h2>, <h3>, <p>, <ul>, <table>, <div class="tip">, <div class="warn">, <div class="algo">, <div class="mnem"> kullan.
- Ogrencinin yanlis yaptigi kavrami kisa bir <mark>...</mark> ile vurgula; ayrintili uyariyi ayri bir <div class="warn"> blogunda anlat.
- Vurgu etiketlerini metnin ustune bindirme. position, transform, float, negatif margin veya satir disina tasan rozet kullanma.
- Bir liste maddesinin icine yan yana kutular yerlestirme; her bilgi blogu normal belge akisi icinde alt alta dursun.
- Markdown kullanma. Sadece HTML parcalari dondur; <html>, <head>, <body> yazma.`;

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

  const prompt = `Sen kidemli bir TUS akademisyeni ve ders notu editorusun.
Gorev: Ogrencinin yanlis yaptigi sorudan hangi konuyu bilmedigini tespit et ve normal konu notlari sayfasindaki kaliteyle sifirdan konu notu yaz.

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

${PERSONAL_NOTE_STANDARD}

ZORUNLU BOLUMLER:
<h2>1. Kisisel Hata Yorumu</h2>
<p>Bu ogrenci hangi kavrami/ayirici noktayi kacirmis, net acikla. Soruyu tekrar yazma.</p>
<h2>2. Konu Anlatimi</h2>
<h3>Temel mekanizma</h3>
<p>...</p>
<h3>Klinik/TUS baglantisi</h3>
<p>...</p>
<h2>3. TUS SPOTLARI</h2>
<div class="tip"><strong>TUS SPOT:</strong> ...</div>
<h2>4. Ayirici Tani ve Karistirilan Noktalar</h2>
<table><thead><tr><th>Durum</th><th>Ayirt ettiren ipucu</th><th>TUS tuzagi</th></tr></thead><tbody>...</tbody></table>
<h2>5. Karar Algoritmasi</h2>
<div class="algo"><strong>ALGORITMA:</strong> Adim 1 -> Adim 2 -> Adim 3</div>
<h2>6. Yanlis Tuzaklari</h2>
<div class="warn"><strong>DIKKAT:</strong> ...</div>
<h2>7. Aktif Hatirlama</h2>
<ol><li>...</li></ol>
<h2>8. Pekistirme Odevleri</h2>
<p>Bu nottan sonra cozulecek soru tipi ve tekrar gorevi.</p>`;

  return stripFence(await withTimeout(mistralText(prompt, 11000, 0.16), AI_NOTE_TIMEOUT_MS, "Kisisel not hazirlama zaman asimi"));
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

  const prompt = `Sen kidemli bir TUS akademisyeni ve ders notu editorusun.
Asagidaki yanlis kayitlarindan ortak bilgi eksiklerini cikar ve normal konu notlari sayfasindaki kaliteyle sifirdan konu notu hazirla.
Bu bir yanlis listesi olmayacak; ogrencinin tekrar edip ogrenebilecegi sinav odakli konu anlatimi olacak.

Not basligi: ${note.title}
Yanlis kayitlari:
${history || "Kayit yok."}

${PERSONAL_NOTE_STANDARD}

ZORUNLU BOLUMLER:
<h2>1. Kisisel Hata Yorumu</h2>
<p>Yanlislarin gosterdigi ana eksigi anlat.</p>
<h2>2. Konu Anlatimi</h2>
<h3>Temel mekanizma</h3>
<p>...</p>
<h3>Klinik/TUS baglantisi</h3>
<p>...</p>
<h2>3. TUS SPOTLARI</h2>
<div class="tip"><strong>TUS SPOT:</strong> ...</div>
<h2>4. Ayirici Tani ve Karistirilan Noktalar</h2>
<table><thead><tr><th>Durum</th><th>Ayirt ettiren ipucu</th><th>TUS tuzagi</th></tr></thead><tbody>...</tbody></table>
<h2>5. Karar Algoritmasi</h2>
<div class="algo"><strong>ALGORITMA:</strong> Adim 1 -> Adim 2 -> Adim 3</div>
<h2>6. Yanlis Tuzaklari</h2>
<div class="warn"><strong>DIKKAT:</strong> ...</div>
<h2>7. Aktif Hatirlama</h2>
<ol><li>...</li></ol>
<h2>8. Pekistirme Odevleri</h2>
<p>Bu nottan sonra cozulecek soru tipi ve tekrar gorevi.</p>`;

  return stripFence(await withTimeout(mistralText(prompt, 11000, 0.16), AI_NOTE_TIMEOUT_MS, "Kisisel not hazirlama zaman asimi"));
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
    contentHtml = active.contentHtml || "";
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
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Bilinmeyen AI hatasi";
    throw new Error("AI konu notu hazirlanamadi: " + reason);
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
