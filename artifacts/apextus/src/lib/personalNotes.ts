import type { AppState, PersonalNoteEntry, PersonalNoteVolume } from "@/contexts/AppContext";
import type { QuizQuestion } from "@/lib/firestore";
import { SR_INTERVALS } from "@/lib/data";
import { addDays, toDay } from "@/lib/utils";

const MAX_ENTRIES_PER_VOLUME = 24;

function clean(value?: string) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function optionLabel(index: number) {
  return ["A", "B", "C", "D", "E"][index] || "-";
}

function buildTeachingNote(q: QuizQuestion, selected: number): string {
  const correctText = q.opts?.[q.ans] || "";
  const selectedText = selected >= 0 ? q.opts?.[selected] || "" : "Bos";
  const tag = q.tags?.[0] || q.cat || "Genel";

  return [
    `<h4>${tag}</h4>`,
    `<p><strong>Hata kalibi:</strong> Bu soruda hedeflenen bilgi ${clean(q.soru)}</p>`,
    `<p><strong>Dogru cevap:</strong> ${optionLabel(q.ans)} - ${clean(correctText)}</p>`,
    `<p><strong>Secilen cevap:</strong> ${selected >= 0 ? `${optionLabel(selected)} - ${clean(selectedText)}` : "Bos birakildi"}</p>`,
    `<p><strong>Ogrenilecek cekirdek bilgi:</strong> ${clean(q.exp) || "Bu konu icin temel mekanizma ve ayirici tani tekrar edilmeli."}</p>`,
    `<ul>`,
    `<li>Bir sonraki cozumde once ana ipucunu bul: vaka, laboratuvar, muayene veya mekanizma.</li>`,
    `<li>Dogru secenegi ezberleme; neden diger seceneklerin elendigini kisa not olarak dusun.</li>`,
    `<li>Bu basligi tekrar ederken 5 hedefli soru coz ve ayni hata tekrarliyor mu kontrol et.</li>`,
    `</ul>`,
  ].join("");
}

export function getPersonalNotesDue(state: AppState, today = toDay()) {
  return (state.personalNotes || []).filter((note) => !note.nextDate || note.nextDate <= today);
}

export function getActivePersonalNote(state: AppState): PersonalNoteVolume | null {
  const notes = state.personalNotes || [];
  return notes[notes.length - 1] || null;
}

export function addWrongToPersonalNotes(state: AppState, q: QuizQuestion, selected: number): AppState {
  const notes = [...(state.personalNotes || [])];
  const today = toDay();
  let active = notes[notes.length - 1];

  if (!active || active.entries.length >= MAX_ENTRIES_PER_VOLUME) {
    active = {
      id: `wrong-note-${notes.length + 1}`,
      title: `Kisisel Yanlis Notu ${notes.length + 1}`,
      createdAt: today,
      updatedAt: today,
      level: 0,
      studyCount: 0,
      nextDate: today,
      entries: [],
    };
    notes.push(active);
  }

  const entry: PersonalNoteEntry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    date: today,
    cat: q.cat || "Genel",
    topic: q.tags?.[0] || q.cat || "Genel",
    question: clean(q.soru),
    selected: optionLabel(selected),
    correct: optionLabel(q.ans),
    noteHtml: buildTeachingNote(q, selected),
  };

  const updated: PersonalNoteVolume = {
    ...active,
    updatedAt: today,
    nextDate: today,
    entries: [...active.entries, entry],
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
