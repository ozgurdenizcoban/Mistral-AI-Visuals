import { TUS_PROGRAMS } from "./tusPrograms";

export interface TusScoreSection {
  label: string;
  group: "Temel" | "Klinik";
  q: number;
}

export interface TusProgram {
  code: string;
  institution: string;
  specialty: string;
  city: string;
  quota: number;
  placed: number;
  empty: number;
  minScore: number | null;
  maxScore: number | null;
}

export type PlacementStatus = "guclu" | "sinirda" | "yakin" | "uzak" | "bos";
export type TusScoreType = "K" | "T";

export interface TusScoreEstimate {
  temelNet: number;
  klinikNet: number;
  temelStandart: number;
  klinikStandart: number;
  agirlikliK: number;
  agirlikliT: number;
  kPuan: number;
  tPuan: number;
}

interface TusNorms {
  temelMean: number;
  temelSd: number;
  klinikMean: number;
  klinikSd: number;
  weightedMean: number;
  weightedSd: number;
  weightedMax: number;
}

export const TUS_SCORE_SOURCE = {
  label: "OSYM 2026-TUS 1. Donem Basvuru Kilavuzu",
  url: "https://dokuman.osym.gov.tr/pdfdokuman/2026/TUSDONEM-1/kilavuz_tsd1d28012026.pdf",
};

export const TUS_PLACEMENT_SOURCE = {
  label: "OSYM 2025-TUS 2. Donem en kucuk/en buyuk puanlar",
  url: "https://www.osym.gov.tr/TR,33551/2025-tus-2-donem-yerlestirme-sonuclarina-iliskin-sayisal-bilgiler.html",
};

export const TUS_SECTIONS: TusScoreSection[] = [
  { label: "Anatomi", group: "Temel", q: 13 },
  { label: "Histoloji ve Embriyoloji", group: "Temel", q: 7 },
  { label: "Fizyoloji", group: "Temel", q: 8 },
  { label: "Biyokimya", group: "Temel", q: 18 },
  { label: "Mikrobiyoloji", group: "Temel", q: 18 },
  { label: "Patoloji", group: "Temel", q: 18 },
  { label: "Farmakoloji", group: "Temel", q: 18 },
  { label: "Dahiliye", group: "Klinik", q: 23 },
  { label: "Pediatri", group: "Klinik", q: 25 },
  { label: "Genel Cerrahi", group: "Klinik", q: 20 },
  { label: "Kadin Hastaliklari ve Dogum", group: "Klinik", q: 10 },
  { label: "Kucuk Stajlar", group: "Klinik", q: 22 },
];

// Exact OSYM score needs exam-period cohort values. These defaults make an honest estimate.
export const TUS_ESTIMATE_DEFAULTS: TusNorms = {
  temelMean: 42,
  temelSd: 16,
  klinikMean: 43,
  klinikSd: 16,
  weightedMean: 50,
  weightedSd: 8,
  weightedMax: 86,
};

export function netScore(correct: number, wrong: number) {
  return correct - wrong / 4;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function toStandardScore(net: number, mean: number, sd: number) {
  return round1(50 + 10 * (net - mean) / sd);
}

function toOfficialExamScore(weightedScore: number, norms: TusNorms = TUS_ESTIMATE_DEFAULTS) {
  // 2026 OSYM guide: 55 + 30 * [7(AP-X)-S] / [7(EBAP-X)-S]
  const denominator = 7 * (norms.weightedMax - norms.weightedMean) - norms.weightedSd;
  if (denominator <= 0) return clamp(round1(weightedScore), 0, 85);
  return clamp(round1(55 + 30 * (7 * (weightedScore - norms.weightedMean) - norms.weightedSd) / denominator), 0, 85);
}

export function calcTusScores(temelNet: number, klinikNet: number, norms: TusNorms = TUS_ESTIMATE_DEFAULTS): TusScoreEstimate {
  const safeTemelNet = clamp(temelNet, -25, 100);
  const safeKlinikNet = clamp(klinikNet, -25, 100);
  const temelStandart = toStandardScore(safeTemelNet, norms.temelMean, norms.temelSd);
  const klinikStandart = toStandardScore(safeKlinikNet, norms.klinikMean, norms.klinikSd);
  const agirlikliK = round1(0.4 * temelStandart + 0.6 * klinikStandart);
  const agirlikliT = round1(0.6 * temelStandart + 0.4 * klinikStandart);
  return {
    temelNet: safeTemelNet,
    klinikNet: safeKlinikNet,
    temelStandart,
    klinikStandart,
    agirlikliK,
    agirlikliT,
    kPuan: toOfficialExamScore(agirlikliK, norms),
    tPuan: toOfficialExamScore(agirlikliT, norms),
  };
}

export function calcTusPuan(temelNet: number, klinikNet: number) {
  return calcTusScores(temelNet, klinikNet).kPuan;
}

export function calcSpTemel(net: number) {
  return toStandardScore(clamp(net, -25, 100), TUS_ESTIMATE_DEFAULTS.temelMean, TUS_ESTIMATE_DEFAULTS.temelSd);
}

export function calcSpKlinik(net: number) {
  return toStandardScore(clamp(net, -25, 100), TUS_ESTIMATE_DEFAULTS.klinikMean, TUS_ESTIMATE_DEFAULTS.klinikSd);
}

function normalizeSearch(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ğ/g, "g")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/i̇/g, "i")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandQuery(query: string) {
  return normalizeSearch(query)
    .replace(/\bomu\b/g, "ondokuz mayis")
    .replace(/\bomü\b/g, "ondokuz mayis")
    .replace(/\bsbu\b/g, "saglik bilimleri")
    .replace(/\bhacettepe\b/g, "hacettepe universitesi")
    .replace(/\bgazi\b/g, "gazi universitesi")
    .replace(/\bgoz\b/g, "goz hastaliklari");
}

export function getProgramScoreType(program: TusProgram): TusScoreType {
  const specialty = normalizeSearch(program.specialty);
  const basicKeywords = ["anatomi", "histoloji", "embriyoloji", "fizyoloji", "biyokimya", "mikrobiyoloji", "patoloji", "farmakoloji"];
  return basicKeywords.some((keyword) => specialty.includes(keyword)) ? "T" : "K";
}

function getComparableScore(score: number | { kPuan: number; tPuan: number }, program: TusProgram) {
  if (typeof score === "number") return score;
  return getProgramScoreType(program) === "T" ? score.tPuan : score.kPuan;
}

export function getProgramStatus(score: number | { kPuan: number; tPuan: number }, program: TusProgram): PlacementStatus {
  if (program.minScore === null) return program.empty > 0 ? "bos" : "uzak";
  const diff = getComparableScore(score, program) - program.minScore;
  if (diff >= 1.5) return "guclu";
  if (diff >= 0) return "sinirda";
  if (diff >= -2.5) return "yakin";
  return "uzak";
}

export function getProgramMessage(score: number | { kPuan: number; tPuan: number }, program: TusProgram) {
  const status = getProgramStatus(score, program);
  if (status === "bos") return "Son yerlestirmede bos kalmis; taban puan olusmamis.";
  if (program.minScore === null) return "Bu program icin karsilastirilabilir taban puan yok.";

  const diff = round1(getComparableScore(score, program) - program.minScore);
  if (status === "guclu") return `Gecen yerlestirmeye gore ${diff.toFixed(1)} puan ustundesin.`;
  if (status === "sinirda") return `Taban puanin ${diff.toFixed(1)} puan ustunde; sinirda ama mumkun.`;
  if (status === "yakin") return `${Math.abs(diff).toFixed(1)} puan eksik; yakin hedef.`;
  return `${Math.abs(diff).toFixed(1)} puan eksik; su an uzak hedef.`;
}

export function searchTusPrograms(query: string, score: number | { kPuan: number; tPuan: number }, limit = 12) {
  const normalized = expandQuery(query);
  const tokens = normalized.split(" ").filter(Boolean);
  const programs = tokens.length > 0
    ? TUS_PROGRAMS.filter((program) => {
        const text = normalizeSearch(`${program.institution} ${program.specialty} ${program.city} ${program.code}`);
        return tokens.every((token) => text.includes(token));
      })
    : TUS_PROGRAMS.filter((program) => program.minScore !== null && program.minScore <= getComparableScore(score, program) + 2.5);

  return programs
    .map((program) => ({
      ...program,
      scoreType: getProgramScoreType(program),
      usedScore: getComparableScore(score, program),
      status: getProgramStatus(score, program),
      message: getProgramMessage(score, program),
      diff: program.minScore === null ? null : round1(getComparableScore(score, program) - program.minScore),
    }))
    .sort((a, b) => {
      const aScore = a.minScore ?? -1;
      const bScore = b.minScore ?? -1;
      if (query.trim()) {
        const statusOrder: Record<PlacementStatus, number> = { guclu: 0, sinirda: 1, yakin: 2, bos: 3, uzak: 4 };
        return statusOrder[a.status] - statusOrder[b.status] || bScore - aScore;
      }
      return bScore - aScore;
    })
    .slice(0, limit);
}
