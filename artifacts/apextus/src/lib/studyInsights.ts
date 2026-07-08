import type { AppState } from "@/contexts/AppContext";
import { TREE } from "@/lib/data";

export interface TopicInsight {
  topic: string;
  cat: string;
  icon: string;
  mistakes: number;
  studyCount: number;
  categoryPct: number | null;
  priority: number;
  reason: string;
  action: string;
}

export interface ScoreSimulation {
  currentBand: [number, number];
  expectedBand: [number, number];
  stretchBand: [number, number];
  targetScore: number;
  daysLeft: number;
  totalTopics: number;
  studiedTopics: number;
  coveragePct: number;
  accuracyPct: number;
  weakTopicCount: number;
  weeklyQuestionTarget: number;
  dailyQuestionTarget: number;
  dailyReviewTarget: number;
  hoursPerDay: number;
  readiness: "başlangıç" | "gelişiyor" | "sınırda" | "hedefe yakın";
  message: string;
}

export interface FocusedReviewTask extends TopicInsight {
  due: boolean;
  overdue: boolean;
  nextDate?: string;
  urgency: "bugün" | "gecikmiş" | "riskli" | "temel";
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function getAllTopics() {
  return TREE.flatMap((b) =>
    b.topics.map((topic) => ({ topic, cat: b.cat, icon: b.icon }))
  );
}

export function getTopicInsights(state: AppState): TopicInsight[] {
  const allTopics = getAllTopics();
  return allTopics
    .map((t) => {
      const cd = state.byCat?.[t.cat];
      const categoryPct = cd?.a ? Math.round((cd.c / cd.a) * 100) : null;
      const mistakes = state.mistakes?.[t.topic] || 0;
      const studyCount = state.sr?.[t.topic]?.studyCount || 0;
      const lowCatPenalty = categoryPct === null ? 12 : Math.max(0, 72 - categoryPct);
      const untouchedPenalty = studyCount === 0 ? 28 : Math.max(0, 10 - studyCount * 2);
      const mistakePenalty = mistakes * 15;
      const priority = mistakePenalty + untouchedPenalty + lowCatPenalty;
      const reason =
        mistakes > 0
          ? `${mistakes} hata kaydı var`
          : studyCount === 0
          ? "henüz çalışılmadı"
          : categoryPct !== null && categoryPct < 65
          ? `${t.cat} başarısı düşük`
          : "tekrar sayısı düşük";
      const action =
        mistakes > 0
          ? "Yanlış kalıbını çöz ve 10 soru ile pekiştir"
          : studyCount === 0
          ? "Önce notu oku, sonra 5 klinik vaka çöz"
          : "Kısa tekrar ve hedefli quiz yap";
      return { ...t, mistakes, studyCount, categoryPct, priority, reason, action };
    })
    .sort((a, b) => b.priority - a.priority);
}

export function getFocusedReviewPlan(state: AppState, today: string, limit = 12): FocusedReviewTask[] {
  return getTopicInsights(state)
    .map((insight) => {
      const sr = state.sr?.[insight.topic];
      const nextDate = sr?.nextDate;
      const due = !!nextDate && nextDate <= today;
      const overdue = !!nextDate && nextDate < today;
      const dueBoost = overdue ? 45 : due ? 28 : 0;
      const noDataBoost = insight.studyCount === 0 ? 10 : 0;
      const priority = insight.priority + dueBoost + noDataBoost;
      const urgency: FocusedReviewTask["urgency"] = overdue
        ? "gecikmiş"
        : due
        ? "bugün"
        : insight.mistakes > 0 || (insight.categoryPct !== null && insight.categoryPct < 65)
        ? "riskli"
        : "temel";

      return { ...insight, priority, due, overdue, nextDate, urgency };
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit);
}

export function getScoreSimulation(
  state: AppState,
  daysLeft: number,
  hoursPerDay: number,
  targetScore: number
): ScoreSimulation {
  const allTopics = getAllTopics();
  const totalTopics = allTopics.length || 1;
  const studiedTopics = allTopics.filter((t) => (state.sr?.[t.topic]?.studyCount || 0) > 0).length;
  const coveragePct = Math.round((studiedTopics / totalTopics) * 100);
  const accuracyPct = state.total > 0 ? Math.round((state.correct / state.total) * 100) : 0;
  const insights = getTopicInsights(state);
  const weakTopicCount = insights.filter((i) => i.priority >= 40).length;
  const consistency = clamp((state.streak || 0) / 14, 0, 1);
  const questionVolume = clamp((state.total || 0) / 1200, 0, 1);
  const timePotential = clamp((daysLeft * hoursPerDay) / 720, 0, 1);
  const weakPenalty = clamp(weakTopicCount / 45, 0, 1);

  const baseScore =
    34 +
    accuracyPct * 0.26 +
    coveragePct * 0.16 +
    questionVolume * 7 +
    consistency * 4 -
    weakPenalty * 5;
  const currentMid = clamp(Math.round(baseScore), 32, 78);
  const expectedGain = clamp(Math.round(4 + hoursPerDay * 1.2 + timePotential * 11 - weakPenalty * 3), 3, 19);
  const expectedMid = clamp(currentMid + expectedGain, 38, 88);
  const stretchMid = clamp(expectedMid + Math.round(2 + consistency * 3), 42, 92);

  const dailyQuestionTarget = clamp(Math.round(20 + (targetScore - currentMid) * 1.5 + weakTopicCount * 0.25), 20, 90);
  const weeklyQuestionTarget = dailyQuestionTarget * 6;
  const dailyReviewTarget = clamp(Math.round(5 + weakTopicCount / 6 + (100 - coveragePct) / 12), 6, 22);

  const readiness =
    expectedMid >= targetScore ? "hedefe yakın" :
    currentMid >= targetScore - 6 ? "sınırda" :
    coveragePct < 35 || accuracyPct < 45 ? "başlangıç" :
    "gelişiyor";

  const message =
    readiness === "hedefe yakın"
      ? "Plan düzenli uygulanırsa hedef puan bandına girme ihtimali güçlü görünüyor."
      : readiness === "sınırda"
      ? "Hedefe yaklaşmak için zayıf konularda hata döngüsünü hızlı kapatmak gerekiyor."
      : readiness === "başlangıç"
      ? "Önce konu kapsamı ve temel doğruluk oranı yükseltilmeli; planın ilk iki haftası kritik."
      : "İlerleme zemini var; puan sıçraması için düzenli soru analizi şart.";

  return {
    currentBand: [clamp(currentMid - 4, 25, 95), clamp(currentMid + 4, 25, 95)],
    expectedBand: [clamp(expectedMid - 3, 25, 95), clamp(expectedMid + 4, 25, 95)],
    stretchBand: [clamp(stretchMid - 3, 25, 95), clamp(stretchMid + 3, 25, 95)],
    targetScore,
    daysLeft,
    totalTopics,
    studiedTopics,
    coveragePct,
    accuracyPct,
    weakTopicCount,
    weeklyQuestionTarget,
    dailyQuestionTarget,
    dailyReviewTarget,
    hoursPerDay,
    readiness,
    message,
  };
}
