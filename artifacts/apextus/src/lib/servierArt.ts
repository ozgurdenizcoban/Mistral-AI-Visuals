export interface ServierArtAsset {
  id: string;
  purpose: "study" | "quiz";
  kit: string;
  title: string;
  slide: number;
  src: string;
  keywords: string;
}

interface ServierManifest {
  assets: ServierArtAsset[];
}

const TERM_ALIASES: Record<string, string[]> = {
  adrenal: ["adrenal", "endocrinology"],
  akciger: ["lung", "respiratory"],
  anatomi: ["anatomy"],
  arter: ["artery", "arteries"],
  atardamar: ["artery", "arteries"],
  bagisiklik: ["immunology", "immune"],
  bagirsak: ["intestine", "digestive", "gastrointestinal"],
  beyin: ["brain", "nervous", "neural"],
  bobrek: ["kidney", "renal", "urinary"],
  damar: ["artery", "arteries", "vein", "veins"],
  deri: ["skin", "dermatology"],
  diyabet: ["diabetes"],
  embriyoloji: ["embryology"],
  endokrin: ["endocrinology", "hormone"],
  enfeksiyon: ["infection", "infectiology"],
  fizyoloji: ["physiology"],
  goz: ["eye", "ophthalmology"],
  hipofiz: ["pituitary", "endocrinology"],
  hucre: ["cell", "intracellular"],
  ilac: ["drug", "drugs", "pharmacology"],
  kalp: ["heart", "cardiac"],
  kan: ["blood", "hematology"],
  kanser: ["cancer", "oncology"],
  karaciger: ["liver", "hepatic", "digestive"],
  kemik: ["bone", "bones"],
  kirik: ["fracture", "fractures"],
  kulak: ["ear", "ent"],
  lenf: ["lymphatic", "lymph"],
  kas: ["muscle", "muscles"],
  mide: ["stomach", "digestive", "gastrointestinal"],
  mikrobiyoloji: ["microbiology", "cell-culture"],
  parazit: ["parasite", "parasitology"],
  pankreas: ["pancreas", "digestive", "endocrinology"],
  patoloji: ["pathology", "pathophysiology"],
  reseptor: ["receptor", "receptors", "channels"],
  sinir: ["nerve", "nervous", "neural"],
  sindirim: ["digestive", "gastrointestinal"],
  solunum: ["respiratory", "lung"],
  toplardamar: ["vein", "veins"],
  tiroid: ["thyroid", "endocrinology"],
  ureme: ["reproduction"],
  uterus: ["uterus", "reproduction"],
  virus: ["infection", "infectiology", "microbiology"],
};

let manifestPromise: Promise<ServierManifest | null> | null = null;

function normalize(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function queryTokens(value: string) {
  const base = normalize(value).split(/\s+/).filter((token) => token.length >= 3);
  const expanded = new Set(base);
  base.forEach((token) => TERM_ALIASES[token]?.forEach((alias) => expanded.add(alias)));
  return [...expanded];
}

async function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch("/medical-art/manifest.json", { cache: "force-cache" })
      .then(async (response) => response.ok ? response.json() as Promise<ServierManifest> : null)
      .catch(() => null);
  }
  return manifestPromise;
}

function stableIndex(value: string, length: number) {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % Math.max(1, length);
}

export async function findServierArt(
  query: string,
  purpose: "study" | "quiz",
  excludedUrls: string[] = [],
): Promise<ServierArtAsset | null> {
  const manifest = await loadManifest();
  if (!manifest?.assets?.length) return null;

  const tokens = queryTokens(query);
  if (!tokens.length) return null;
  const excluded = new Set(excludedUrls);
  const ranked = manifest.assets
    .filter((asset) => asset.purpose === purpose && !excluded.has(asset.src))
    .map((asset) => {
      const haystack = normalize(`${asset.kit} ${asset.title} ${asset.keywords}`);
      const score = tokens.reduce((total, token) => {
        if (new RegExp(`(^| )${token}( |$)`).test(haystack)) return total + 3;
        if (haystack.includes(token)) return total + 1;
        return total;
      }, 0);
      return { asset, score };
    })
    .filter((entry) => entry.score >= 3)
    .sort((a, b) => b.score - a.score || a.asset.id.localeCompare(b.asset.id));

  if (!ranked.length) return null;
  const bestScore = ranked[0].score;
  const candidates = ranked.filter((entry) => entry.score >= Math.max(3, bestScore - 2)).slice(0, 10);
  return candidates[stableIndex(normalize(query), candidates.length)]?.asset || null;
}
