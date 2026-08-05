import {
  doc, getDoc, setDoc, updateDoc, collection,
  query, limit, getDocs, writeBatch, where,
} from "firebase/firestore";
import { db } from "./firebase";
import { topicKey } from "./utils";

export interface NoteDoc {
  html: string;
  linkHtml?: string;
  topic: string;
  createdAt: number;
  images?: { url: string; caption: string }[];
  schemaVersion?: number;
}

const NOTE_DB = "apextus-note-cache";
const NOTE_STORE = "notes";

function openNoteDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(NOTE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(NOTE_STORE)) request.result.createObjectStore(NOTE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function getLocalNote(topic: string): Promise<NoteDoc | null> {
  const database = await openNoteDb();
  if (!database) return null;
  return new Promise((resolve) => {
    const request = database.transaction(NOTE_STORE, "readonly").objectStore(NOTE_STORE).get(topicKey(topic));
    request.onsuccess = () => resolve((request.result as NoteDoc | undefined) || null);
    request.onerror = () => resolve(null);
  });
}

async function saveLocalNote(topic: string, data: NoteDoc): Promise<void> {
  const database = await openNoteDb();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const request = database.transaction(NOTE_STORE, "readwrite").objectStore(NOTE_STORE).put(data, topicKey(topic));
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

async function deleteLocalNote(topic: string): Promise<void> {
  const database = await openNoteDb();
  if (!database) return;
  await new Promise<void>((resolve) => {
    const request = database.transaction(NOTE_STORE, "readwrite").objectStore(NOTE_STORE).delete(topicKey(topic));
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

export async function fbGetNote(topic: string): Promise<NoteDoc | null> {
  try {
    const snap = await getDoc(doc(db, "notes", topicKey(topic)));
    if (snap.exists()) {
      const d = snap.data() as NoteDoc;
      if (d.html) {
        void saveLocalNote(topic, d);
        return d;
      }
    }
  } catch (_) {}
  return getLocalNote(topic);
}

export async function fbSaveNote(
  topic: string,
  html: string,
  linkHtml: string,
  images?: { url: string; caption: string }[],
  schemaVersion = 1,
): Promise<boolean> {
  const data: NoteDoc = { html, linkHtml: linkHtml || "", topic, createdAt: Date.now(), schemaVersion };
  if (images?.length) data.images = images;
  let remoteSaved = false;
  try {
    await setDoc(doc(db, "notes", topicKey(topic)), data);
    remoteSaved = true;
  } catch (e) {
    console.warn("Note cache save error:", e);
  }
  await saveLocalNote(topic, data);
  return remoteSaved;
}

export async function fbDeleteNote(topic: string): Promise<void> {
  try {
    const { deleteDoc } = await import("firebase/firestore");
    await deleteDoc(doc(db, "notes", topicKey(topic)));
  } catch (_) {}
  await deleteLocalNote(topic);
}

export interface QuizQuestion {
  vaka: string;
  soru: string;
  opts: string[];
  ans: number;
  exp: string;
  visualHtml?: string;
  visualCaption?: string;
  cat: string;
  diff: string;
  tags: string[];
  sourceRefs?: string[];
  sourceYears?: number[];
  _fid?: string;
  createdAt?: number;
}

export interface OptionBankEntry {
  id: string;
  options: string[];
  course: string;
  topic: string;
  subtopic: string;
  tags: string[];
  examPeriod: string;
  examYear?: number;
  examType: string;
  questionNumber: number;
  source: string;
  active: boolean;
  questionStyle?: string;
  stemTemplate?: string;
}

export async function fbGetOptionBank(course: string, count = 12): Promise<OptionBankEntry[]> {
  try {
    const snap = await getDocs(query(
      collection(db, "optionBank"),
      where("course", "==", course),
      limit(300),
    ));
    const entries: OptionBankEntry[] = [];
    snap.forEach((item) => {
      const entry = item.data() as OptionBankEntry;
      if (entry.active !== false && Array.isArray(entry.options) && entry.options.length === 5) {
        entries.push({ ...entry, id: item.id });
      }
    });
    const byYear = new Map<number, OptionBankEntry[]>();
    entries.forEach((entry) => {
      const year = entry.examYear || Number(entry.examPeriod?.slice(0, 4));
      if (!Number.isFinite(year)) return;
      const bucket = byYear.get(year) || [];
      bucket.push(entry);
      byYear.set(year, bucket);
    });
    byYear.forEach((bucket) => bucket.sort(() => Math.random() - 0.5));
    const years = [...byYear.keys()].sort(() => Math.random() - 0.5);
    const balanced: OptionBankEntry[] = [];
    while (balanced.length < count && years.some((year) => (byYear.get(year)?.length || 0) > 0)) {
      for (const year of years) {
        const entry = byYear.get(year)?.pop();
        if (entry) balanced.push(entry);
        if (balanced.length >= count) break;
      }
    }
    return balanced;
  } catch (error) {
    console.warn("Option bank read error:", error);
    return [];
  }
}

export async function fbGetQuestions(
  topic: string,
  diff: string,
  count: number,
  seenIds: Record<string, boolean>
): Promise<QuizQuestion[]> {
  try {
    const col = collection(db, "questions", `${topicKey(topic)}__${diff}`, "pool");
    const snap = await getDocs(query(col, limit(200)));
    if (snap.empty) return [];
    const all: QuizQuestion[] = [];
    snap.forEach((d) => {
      const q = d.data() as QuizQuestion;
      q._fid = d.id;
      all.push(q);
    });
    const unseen = all.filter((q) => !seenIds[q._fid!]);
    if (!unseen.length) return [];
    return unseen.sort(() => Math.random() - 0.5).slice(0, count);
  } catch (_) {
    return [];
  }
}

/** Saves questions to Firebase pool and returns the auto-generated doc IDs
 *  so the caller can immediately mark them as seen. */
export async function fbSaveQuestions(
  topic: string,
  diff: string,
  questions: QuizQuestion[]
): Promise<string[]> {
  const savedIds: string[] = [];
  try {
    const col = collection(db, "questions", `${topicKey(topic)}__${diff}`, "pool");
    const batch = writeBatch(db);
    questions.forEach((q) => {
      const ref = doc(col);
      savedIds.push(ref.id);
      batch.set(ref, {
        vaka: q.vaka || "", soru: q.soru || "", opts: q.opts || [],
        ans: q.ans || 0, exp: q.exp || "", cat: q.cat || topic,
        visualHtml: q.visualHtml || "", visualCaption: q.visualCaption || "",
        diff: q.diff || diff, tags: q.tags || [], createdAt: Date.now(),
        sourceRefs: q.sourceRefs || [], sourceYears: q.sourceYears || [],
      });
    });
    await batch.commit();
  } catch (e) {
    console.warn("Q save error:", e);
  }
  return savedIds;
}

export async function fbGetAnalysis(fp: string): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, "analyses", fp));
    if (snap.exists()) {
      const d = snap.data();
      if (d.html) return d.html as string;
    }
  } catch (_) {}
  return null;
}

export async function fbSaveAnalysis(fp: string, html: string): Promise<void> {
  try {
    await setDoc(doc(db, "analyses", fp), { html, createdAt: Date.now() });
  } catch (e) {
    console.warn("Analysis cache save error:", e);
  }
}

export async function fbGetSeenQ(userId: string): Promise<Record<string, boolean>> {
  try {
    const snap = await getDoc(doc(db, "users", userId));
    if (snap.exists()) {
      const d = snap.data();
      return (d.seenQ as Record<string, boolean>) || {};
    }
  } catch (_) {}
  return {};
}

export async function fbMarkSeenQ(userId: string, qIds: string[]): Promise<void> {
  if (!qIds.length) return;
  try {
    const upd: Record<string, boolean> = {};
    qIds.forEach((id) => { upd[`seenQ.${id}`] = true; });
    await updateDoc(doc(db, "users", userId), upd);
  } catch (_) {
    try {
      const seenQ: Record<string, boolean> = {};
      qIds.forEach((id) => { seenQ[id] = true; });
      await setDoc(doc(db, "users", userId), { seenQ }, { merge: true });
    } catch (_) {}
  }
}

export async function fbLoadUserData(userId: string): Promise<Record<string, unknown> | null> {
  try {
    const snap = await getDoc(doc(db, "users", userId));
    if (snap.exists()) return snap.data() as Record<string, unknown>;
  } catch (_) {}
  return null;
}

export async function fbSaveUserData(userId: string, data: Record<string, unknown>): Promise<void> {
  try {
    await setDoc(doc(db, "users", userId), data);
  } catch (e) {
    console.warn("Firebase kayıt hatası:", e);
  }
}

export async function fbGetProfile(userId: string): Promise<{ username?: string; name?: string } | null> {
  try {
    const snap = await getDoc(doc(db, "profiles", userId));
    if (snap.exists()) return snap.data() as { username?: string; name?: string };
  } catch (_) {}
  return null;
}

export async function fbSaveProfile(
  userId: string,
  data: { uid?: string; name: string; username: string; email: string; createdAt: string }
): Promise<void> {
  await setDoc(doc(db, "profiles", userId), { uid: userId, ...data }, { merge: true });
}
