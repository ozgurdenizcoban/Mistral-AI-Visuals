import { TUS_PROGRAMS } from "./tusPrograms";

export interface TusScoreSection {
  label: string;
  group: "Temel" | "Klinik";
  q: number;
}

export interface SpecialtyBenchmark {
  branch: string;
  min: number;
  max?: number;
  competitiveness: "çok yüksek" | "yüksek" | "orta" | "erişilebilir";
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

export const TUS_SCORE_SOURCE = {
  label: "ÖSYM 2025-TUS 2. Dönem en küçük/en büyük puanlar",
  url: "https://www.osym.gov.tr/TR,33551/2025-tus-2-donem-yerlestirme-sonuclarina-iliskin-sayisal-bilgiler.html",
};

export const TUS_SECTIONS: TusScoreSection[] = [
  { label: "Anatomi", group: "Temel", q: 14 },
  { label: "Histoloji ve Embriyoloji", group: "Temel", q: 10 },
  { label: "Fizyoloji", group: "Temel", q: 14 },
  { label: "Biyokimya", group: "Temel", q: 14 },
  { label: "Mikrobiyoloji", group: "Temel", q: 14 },
  { label: "Farmakoloji", group: "Temel", q: 14 },
  { label: "Patoloji", group: "Temel", q: 20 },
  { label: "Kardiyoloji", group: "Klinik", q: 9 },
  { label: "Göğüs Hastalıkları", group: "Klinik", q: 7 },
  { label: "Hematoloji", group: "Klinik", q: 6 },
  { label: "Nefroloji", group: "Klinik", q: 6 },
  { label: "Endokrinoloji", group: "Klinik", q: 8 },
  { label: "Gastroenteroloji", group: "Klinik", q: 6 },
  { label: "Hepatoloji", group: "Klinik", q: 5 },
  { label: "Romatoloji", group: "Klinik", q: 5 },
  { label: "Enfeksiyon Hastalıkları", group: "Klinik", q: 7 },
  { label: "Onkoloji", group: "Klinik", q: 4 },
  { label: "Geriatri", group: "Klinik", q: 3 },
  { label: "Genel Cerrahi", group: "Klinik", q: 10 },
  { label: "Kadın Hastalıkları ve Doğum", group: "Klinik", q: 8 },
  { label: "Pediatri", group: "Klinik", q: 8 },
  { label: "Nöroloji", group: "Klinik", q: 4 },
  { label: "Psikiyatri", group: "Klinik", q: 2 },
  { label: "Dermatoloji", group: "Klinik", q: 2 },
  { label: "Göz Hastalıkları", group: "Klinik", q: 2 },
];

// Branch-level quick orientation; institution-level checks use TUS_PROGRAMS below.
export const SPECIALTY_BENCHMARKS: SpecialtyBenchmark[] = [
  { branch: "Deri ve Zührevi Hastalıkları", min: 71.5, competitiveness: "çok yüksek" },
  { branch: "Plastik, Rekonstrüktif ve Estetik Cerrahi", min: 70.8, competitiveness: "çok yüksek" },
  { branch: "Radyoloji", min: 69.8, competitiveness: "çok yüksek" },
  { branch: "Göz Hastalıkları", min: 68.9, competitiveness: "çok yüksek" },
  { branch: "Kulak Burun Boğaz Hastalıkları", min: 67.8, competitiveness: "yüksek" },
  { branch: "Çocuk ve Ergen Ruh Sağlığı", min: 67.2, competitiveness: "yüksek" },
  { branch: "Kardiyoloji", min: 65.8, competitiveness: "yüksek" },
  { branch: "Fiziksel Tıp ve Rehabilitasyon", min: 64.5, competitiveness: "yüksek" },
  { branch: "Anesteziyoloji ve Reanimasyon", min: 63.2, competitiveness: "yüksek" },
  { branch: "Nöroloji", min: 62.8, competitiveness: "yüksek" },
  { branch: "Psikiyatri", min: 61.9, competitiveness: "orta" },
  { branch: "Ortopedi ve Travmatoloji", min: 61.3, competitiveness: "orta" },
  { branch: "Üroloji", min: 60.8, competitiveness: "orta" },
  { branch: "Çocuk Sağlığı ve Hastalıkları", min: 59.5, competitiveness: "orta" },
  { branch: "İç Hastalıkları", min: 58.4, competitiveness: "orta" },
  { branch: "Kadın Hastalıkları ve Doğum", min: 57.6, competitiveness: "orta" },
  { branch: "Genel Cerrahi", min: 56.8, competitiveness: "orta" },
  { branch: "Göğüs Hastalıkları", min: 55.7, competitiveness: "erişilebilir" },
  { branch: "Acil Tıp", min: 54.2, competitiveness: "erişilebilir" },
  { branch: "Enfeksiyon Hastalıkları", min: 53.8, competitiveness: "erişilebilir" },
  { branch: "Halk Sağlığı", min: 52.6, competitiveness: "erişilebilir" },
  { branch: "Aile Hekimliği", min: 50.2, competitiveness: "erişilebilir" },
  { branch: "Anatomi", min: 48.8, competitiveness: "erişilebilir" },
  { branch: "Tıbbi Biyokimya", min: 48.2, competitiveness: "erişilebilir" },
  { branch: "Tıbbi Mikrobiyoloji", min: 47.8, competitiveness: "erişilebilir" },
  { branch: "Patoloji", min: 47.5, competitiveness: "erişilebilir" },
  { branch: "Fizyoloji", min: 46.8, competitiveness: "erişilebilir" },
];

export function netScore(correct: number, wrong: number) {
  return correct - wrong / 4;
}

export function calcTusPuan(temelNet: number, klinikNet: number): number {
  const spTemel = 50 + 10 * (temelNet - 42) / 16;
  const spKlinik = 50 + 10 * (klinikNet - 43) / 16;
  const puan = 0.4 * spTemel + 0.6 * spKlinik;
  return Math.max(0, Math.min(100, Math.round(puan * 10) / 10));
}

export function calcSpTemel(net: number) {
  return Math.max(0, Math.min(100, Math.round((50 + 10 * (net - 42) / 16) * 10) / 10));
}

export function calcSpKlinik(net: number) {
  return Math.max(0, Math.min(100, Math.round((50 + 10 * (net - 43) / 16) * 10) / 10));
}

export function getPlacementMatches(score: number) {
  return SPECIALTY_BENCHMARKS.map((item) => {
    const diff = Math.round((score - item.min) * 10) / 10;
    const status: PlacementStatus = diff >= 2 ? "guclu" : diff >= 0 ? "sinirda" : diff >= -3 ? "yakin" : "uzak";
    return { ...item, diff, status };
  }).sort((a, b) => b.min - a.min);
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

export function getProgramStatus(score: number, program: TusProgram): PlacementStatus {
  if (program.minScore === null) return program.empty > 0 ? "bos" : "uzak";
  const diff = score - program.minScore;
  if (diff >= 1.5) return "guclu";
  if (diff >= 0) return "sinirda";
  if (diff >= -2.5) return "yakin";
  return "uzak";
}

export function getProgramMessage(score: number, program: TusProgram) {
  const status = getProgramStatus(score, program);
  if (status === "bos") return "Son yerleştirmede boş kalmış; taban puan oluşmamış.";
  if (program.minScore === null) return "Bu program için karşılaştırılabilir taban puan yok.";

  const diff = Math.round((score - program.minScore) * 10) / 10;
  if (status === "guclu") return `Geçen yerleştirmeye göre ${diff.toFixed(1)} puan üstündesin.`;
  if (status === "sinirda") return `Taban puanın ${diff.toFixed(1)} puan üstünde; sınırda ama mümkün.`;
  if (status === "yakin") return `${Math.abs(diff).toFixed(1)} puan eksik; yakın hedef.`;
  return `${Math.abs(diff).toFixed(1)} puan eksik; şu an uzak hedef.`;
}

export function searchTusPrograms(query: string, score: number, limit = 12) {
  const normalized = expandQuery(query);
  const tokens = normalized.split(" ").filter(Boolean);
  const programs = tokens.length > 0
    ? TUS_PROGRAMS.filter((program) => {
        const text = normalizeSearch(`${program.institution} ${program.specialty} ${program.city} ${program.code}`);
        return tokens.every((token) => text.includes(token));
      })
    : TUS_PROGRAMS.filter((program) => program.minScore !== null && program.minScore <= score + 2.5);

  return programs
    .map((program) => ({
      ...program,
      status: getProgramStatus(score, program),
      message: getProgramMessage(score, program),
      diff: program.minScore === null ? null : Math.round((score - program.minScore) * 10) / 10,
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
