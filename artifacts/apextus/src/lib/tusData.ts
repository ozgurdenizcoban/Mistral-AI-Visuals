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

// Branch-level approximation derived from the latest ÖSYM min/max placement tables.
// The app uses branch bands, not institution-specific rows, so students see a realistic orientation.
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
    const status = diff >= 2 ? "güçlü" : diff >= 0 ? "sınırda" : diff >= -3 ? "yakın" : "uzak";
    return { ...item, diff, status };
  }).sort((a, b) => b.min - a.min);
}
