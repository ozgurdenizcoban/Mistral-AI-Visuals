import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  fbLoadUserData, fbSaveUserData, fbGetProfile,
  fbGetSeenQ, fbMarkSeenQ as fbMarkSeenQFirestore,
} from "@/lib/firestore";
import { toDay, prevDay } from "@/lib/utils";
import { TREE, FREE_LIMITS, CAT_MIGRATE } from "@/lib/data";

export interface SREntry {
  level: number;
  studyCount: number;
  nextDate?: string;
  _manual?: boolean;
}

export interface AppState {
  total: number;
  correct: number;
  streak: number;
  lastDate: string;
  byCat: Record<string, { a: number; c: number }>;
  sessions: { date: string; cat: string; c: number; t: number; p: number }[];
  sr: Record<string, SREntry>;
  mistakes: Record<string, number>;
  seenQ: Record<string, boolean>;
  noteCount: number;
  aiExplainCount: number;
  plan: "free" | "weekly" | "monthly";
  planExpiry?: string;
}

interface AppContextValue {
  user: User | null;
  username: string;
  setUsername: (name: string) => void;
  loading: boolean;
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  saveState: (s: AppState) => void;
  isPro: () => boolean;
  checkLimit: (type: "quiz" | "notes" | "aiExplain") => boolean;
  markSeenQ: (ids: string[]) => void;
  currentPage: string;
  setCurrentPage: (page: string) => void;
  noteTarget: { cat: string; icon: string; topic: string } | null;
  setNoteTarget: (t: { cat: string; icon: string; topic: string } | null) => void;
  quizTarget: { cat: string; topic: string } | null;
  setQuizTarget: (t: { cat: string; topic: string } | null) => void;
  fbReady: boolean;
}

function emptyState(): AppState {
  return {
    total: 0, correct: 0, streak: 0, lastDate: "", byCat: {},
    sessions: [], sr: {}, mistakes: {}, seenQ: {}, noteCount: 0,
    aiExplainCount: 0, plan: "free", planExpiry: "",
  };
}

function migrateByCat(byCat: Record<string, { a: number; c: number }>) {
  const result: Record<string, { a: number; c: number }> = {};
  Object.entries(byCat).forEach(([k, v]) => {
    const newKey = CAT_MIGRATE[k] || k;
    if (result[newKey]) {
      result[newKey].a += v.a || 0;
      result[newKey].c += v.c || 0;
    } else {
      result[newKey] = { a: v.a || 0, c: v.c || 0 };
    }
  });
  return result;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [fbReady, setFbReady] = useState(false);
  const [state, setStateRaw] = useState<AppState>(emptyState());
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [noteTarget, setNoteTarget] = useState<{ cat: string; icon: string; topic: string } | null>(null);
  const [quizTarget, setQuizTarget] = useState<{ cat: string; topic: string } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userRef = useRef<User | null>(null);
  const stateRef = useRef<AppState>(emptyState());

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  function saveState(s: AppState) {
    stateRef.current = s;
    setStateRaw(s);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const u = userRef.current;
      if (u) {
        fbSaveUserData(u.uid, s as unknown as Record<string, unknown>).catch(() => {});
      }
    }, 800);
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        try {
          const profile = await fbGetProfile(u.uid);
          const uname =
            profile?.username || profile?.name || u.displayName || u.email?.split("@")[0] || "Kullanıcı";
          setUsername(uname);
          const seenQ = await fbGetSeenQ(u.uid);
          const raw = await fbLoadUserData(u.uid);
          if (raw) {
            const fbSr = (raw.sr && typeof raw.sr === "object" ? raw.sr : {}) as Record<string, SREntry>;
            Object.entries(fbSr).forEach(([t, v]: [string, SREntry]) => {
              if ((v as unknown as Record<string, unknown>).rc || (v as unknown as Record<string, unknown>).readCount) {
                v.studyCount = (v.studyCount || 0) +
                  ((v as unknown as Record<string, unknown>).rc as number || 0) +
                  ((v as unknown as Record<string, unknown>).readCount as number || 0);
              }
            });
            const merged: AppState = {
              total: typeof raw.total === "number" ? raw.total : 0,
              correct: typeof raw.correct === "number" ? raw.correct : 0,
              streak: typeof raw.streak === "number" ? raw.streak : 0,
              lastDate: (raw.lastDate as string) || "",
              byCat: raw.byCat && typeof raw.byCat === "object"
                ? migrateByCat(raw.byCat as Record<string, { a: number; c: number }>)
                : {},
              sessions: Array.isArray(raw.sessions) ? raw.sessions as AppState["sessions"] : [],
              sr: fbSr,
              mistakes: raw.mistakes && typeof raw.mistakes === "object"
                ? raw.mistakes as Record<string, number>
                : {},
              seenQ: { ...seenQ, ...(raw.seenQ as Record<string, boolean> || {}) },
              noteCount: typeof raw.noteCount === "number" ? raw.noteCount : 0,
              aiExplainCount: typeof raw.aiExplainCount === "number" ? raw.aiExplainCount : 0,
              plan: (raw.plan as AppState["plan"]) || "free",
              planExpiry: (raw.planExpiry as string) || "",
            };
            stateRef.current = merged;
            setStateRaw(merged);
          }
        } catch (_) {}
        setFbReady(true);
      } else {
        setUser(null);
        setUsername("");
        setStateRaw(emptyState());
        setFbReady(false);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // All features are currently free for all users
  const isPro = useCallback(() => true, []);

  const checkLimit = useCallback(
    (type: "quiz" | "notes" | "aiExplain") => {
      if (isPro()) return true;
      const s = stateRef.current;
      if (type === "quiz") return (s.total || 0) < FREE_LIMITS.quiz;
      if (type === "notes") return (s.noteCount || 0) < FREE_LIMITS.notes;
      if (type === "aiExplain") return (s.aiExplainCount || 0) < FREE_LIMITS.aiExplain;
      return true;
    },
    [isPro]
  );

  const markSeenQ = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      const u = userRef.current;
      setStateRaw((prev) => {
        const next = { ...prev, seenQ: { ...prev.seenQ } };
        ids.forEach((id) => { next.seenQ[id] = true; });
        stateRef.current = next;
        return next;
      });
      if (u) fbMarkSeenQFirestore(u.uid, ids).catch(() => {});
    },
    []
  );

  useEffect(() => {
    if (!fbReady) return;
    const s = stateRef.current;
    const tod = toDay();
    const allCatNames: Record<string, boolean> = {
      Kardiyoloji: true, "Göğüs Hastalıkları": true, Hematoloji: true,
      Nefroloji: true, Onkoloji: true, Geriatri: true, Endokrinoloji: true,
      Romatoloji: true, Hepatoloji: true, Gastroenteroloji: true,
      "Enfeksiyon Hastalıkları": true, Pulmoloji: true,
    };
    const allTopicNames: Record<string, boolean> = {};
    TREE.forEach((b) => b.topics.forEach((t) => { allTopicNames[t] = true; }));
    let mkDirty = false;
    const newMistakes = { ...s.mistakes };
    Object.keys(newMistakes).forEach((k) => {
      if (allCatNames[k]) { delete newMistakes[k]; mkDirty = true; }
    });
    let newStreak = s.streak;
    let newLastDate = s.lastDate;
    if (s.lastDate && s.lastDate !== tod) {
      if (s.lastDate === prevDay()) {
        // streak continues — don't auto-update, wait for quiz
      } else {
        // streak reset
        newStreak = 0;
      }
    }
    if (mkDirty || newStreak !== s.streak) {
      const next = { ...s, mistakes: newMistakes, streak: newStreak, lastDate: newLastDate };
      stateRef.current = next;
      setStateRaw(next);
    }
  }, [fbReady]);

  return (
    <AppContext.Provider
      value={{
        user, username, setUsername, loading, state, setState: setStateRaw, saveState,
        isPro, checkLimit, markSeenQ, currentPage, setCurrentPage,
        noteTarget, setNoteTarget, quizTarget, setQuizTarget, fbReady,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
