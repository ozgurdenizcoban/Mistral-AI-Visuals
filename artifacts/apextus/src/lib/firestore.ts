import {
  doc, getDoc, setDoc, updateDoc, collection,
  query, limit, getDocs, writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { topicKey } from "./utils";

export interface NoteDoc {
  html: string;
  linkHtml?: string;
  topic: string;
  createdAt: number;
  images?: { url: string; caption: string }[];
}

export async function fbGetNote(topic: string): Promise<NoteDoc | null> {
  try {
    const snap = await getDoc(doc(db, "notes", topicKey(topic)));
    if (snap.exists()) {
      const d = snap.data() as NoteDoc;
      if (d.html) return d;
    }
  } catch (_) {}
  return null;
}

export async function fbSaveNote(
  topic: string,
  html: string,
  linkHtml: string,
  images?: { url: string; caption: string }[]
): Promise<void> {
  try {
    const data: NoteDoc = { html, linkHtml: linkHtml || "", topic, createdAt: Date.now() };
    if (images?.length) data.images = images;
    await setDoc(doc(db, "notes", topicKey(topic)), data);
  } catch (e) {
    console.warn("Note cache save error:", e);
  }
}

export async function fbDeleteNote(topic: string): Promise<void> {
  try {
    const { deleteDoc } = await import("firebase/firestore");
    await deleteDoc(doc(db, "notes", topicKey(topic)));
  } catch (_) {}
}

export interface QuizQuestion {
  vaka: string;
  soru: string;
  opts: string[];
  ans: number;
  exp: string;
  cat: string;
  diff: string;
  tags: string[];
  _fid?: string;
  createdAt?: number;
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

export async function fbSaveQuestions(
  topic: string,
  diff: string,
  questions: QuizQuestion[]
): Promise<void> {
  try {
    const col = collection(db, "questions", `${topicKey(topic)}__${diff}`, "pool");
    const batch = writeBatch(db);
    questions.forEach((q) => {
      const ref = doc(col);
      batch.set(ref, {
        vaka: q.vaka || "", soru: q.soru || "", opts: q.opts || [],
        ans: q.ans || 0, exp: q.exp || "", cat: q.cat || topic,
        diff: q.diff || diff, tags: q.tags || [], createdAt: Date.now(),
      });
    });
    await batch.commit();
  } catch (e) {
    console.warn("Q save error:", e);
  }
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
  data: { name: string; username: string; email: string; createdAt: string }
): Promise<void> {
  await setDoc(doc(db, "profiles", userId), data);
}
