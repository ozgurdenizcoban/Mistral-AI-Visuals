import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

function topicKey(topic: string): string {
  return topic.replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ]/g, "_").substring(0, 80);
}

function buildPollinationsUrl(prompt: string, seed?: number): string {
  const encoded = encodeURIComponent(prompt);
  const s = seed ?? Math.floor(Math.random() * 10000);
  return `https://image.pollinations.ai/prompt/${encoded}?model=flux&width=800&height=450&nologo=true&seed=${s}`;
}

export interface NoteImage {
  url: string;
  caption: string;
  storagePath?: string;
}

export async function generateNoteImages(
  cat: string,
  topic: string
): Promise<NoteImage[]> {
  const prompts = getMedicalImagePrompts(cat, topic);
  const images: NoteImage[] = [];

  for (let i = 0; i < prompts.length; i++) {
    const { prompt, caption } = prompts[i];
    const seed = i * 1337 + 42;
    const pollinationsUrl = buildPollinationsUrl(prompt, seed);

    try {
      const storagePath = `notes-images/${topicKey(topic)}/${i}.jpg`;
      const storageUrl = await uploadImageToStorage(pollinationsUrl, storagePath);
      images.push({ url: storageUrl || pollinationsUrl, caption, storagePath });
    } catch (_) {
      images.push({ url: pollinationsUrl, caption });
    }
  }

  return images;
}

async function uploadImageToStorage(imageUrl: string, path: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(imageUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
    return await getDownloadURL(storageRef);
  } catch (_) {
    return null;
  }
}

function getMedicalImagePrompts(
  cat: string,
  topic: string
): { prompt: string; caption: string }[] {
  const base = `medical educational illustration, clean white background, professional anatomical diagram, high detail, no text labels, scientific style`;

  const catPrompts: Record<string, { prompt: string; caption: string }[]> = {
    Kardiyoloji: [
      { prompt: `human heart anatomy detailed cross-section showing chambers valves coronary arteries, ${base}`, caption: "Kalp Anatomisi ve Koroner Arterler" },
      { prompt: `ECG electrocardiogram waveform diagram PQRST labeled medical education, ${base}`, caption: "EKG Dalga Morfolojisi" },
    ],
    "Göğüs Hastalıkları": [
      { prompt: `human lungs detailed anatomy showing bronchial tree alveoli pulmonary vessels, ${base}`, caption: "Akciğer Anatomisi" },
      { prompt: `spirometry lung function test graph showing obstructive restrictive patterns FEV1 FVC, ${base}`, caption: "Solunum Fonksiyon Testi Grafikleri" },
    ],
    Hematoloji: [
      { prompt: `blood cell types erythrocytes leukocytes platelets hematopoiesis diagram, ${base}`, caption: "Kan Hücreleri ve Hematopoez" },
      { prompt: `coagulation cascade diagram showing intrinsic extrinsic pathway fibrin clot formation, ${base}`, caption: "Koagülasyon Kaskadı" },
    ],
    Nefroloji: [
      { prompt: `kidney nephron detailed anatomy showing glomerulus tubules collecting duct, ${base}`, caption: "Nefron Anatomisi" },
      { prompt: `acid base balance diagram pH bicarbonate compensation respiratory metabolic, ${base}`, caption: "Asit-Baz Dengesi" },
    ],
    Onkoloji: [
      { prompt: `cancer cell cycle tumor growth hallmarks oncogenesis molecular pathway diagram, ${base}`, caption: "Kanser Hücre Biyolojisi" },
    ],
    Geriatri: [
      { prompt: `aging physiological changes human body systems organ function decline diagram, ${base}`, caption: "Yaşlanmanın Fizyolojik Etkileri" },
    ],
    Endokrinoloji: [
      { prompt: `endocrine system glands hormones pituitary thyroid adrenal pancreas anatomy diagram, ${base}`, caption: "Endokrin Sistem Anatomisi" },
      { prompt: `insulin glucose regulation pancreas beta cells mechanism diagram, ${base}`, caption: "İnsülin-Glukoz Regulasyonu" },
    ],
    Romatoloji: [
      { prompt: `joint anatomy synovial membrane cartilage rheumatoid arthritis pathology diagram, ${base}`, caption: "Eklem Anatomisi ve Patoloji" },
      { prompt: `autoimmune disease pathway immune complex complement activation diagram, ${base}`, caption: "Otoimmün Mekanizmalar" },
    ],
    Hepatoloji: [
      { prompt: `liver anatomy hepatic lobule portal triad bile duct hepatocytes microscopic, ${base}`, caption: "Karaciğer Histolojisi" },
      { prompt: `liver cirrhosis fibrosis progression Child-Pugh scoring diagram, ${base}`, caption: "Siroz Progresyonu" },
    ],
    Gastroenteroloji: [
      { prompt: `gastrointestinal tract anatomy detailed stomach intestines histology, ${base}`, caption: "GİS Anatomisi" },
      { prompt: `peptic ulcer disease gastric mucosal barrier H pylori pathogenesis diagram, ${base}`, caption: "Peptik Ülser Patofizyolojisi" },
    ],
    "Enfeksiyon Hastalıkları": [
      { prompt: `pathogen host interaction immune response infection chain diagram, ${base}`, caption: "Enfeksiyon Zinciri ve İmmün Yanıt" },
      { prompt: `antibiotic mechanism of action bacterial cell wall protein synthesis DNA, ${base}`, caption: "Antibiyotik Etki Mekanizmaları" },
    ],
  };

  const topicOverrides: Record<string, { prompt: string; caption: string }[]> = {
    "Diabetes Mellitus": [
      { prompt: `diabetes mellitus type 1 type 2 insulin resistance pathophysiology diagram, ${base}`, caption: "Diyabet Patofizyolojisi" },
      { prompt: `diabetic complications retinopathy nephropathy neuropathy angiopathy diagram, ${base}`, caption: "Diyabetin Kronik Komplikasyonları" },
    ],
    "Akut Böbrek Hasarı": [
      { prompt: `acute kidney injury prerenal intrinsic postrenal causes pathophysiology ATN diagram, ${base}`, caption: "AKI Patofizyolojisi ve Nedenleri" },
    ],
    "Kalp Yetmezliği": [
      { prompt: `heart failure pathophysiology compensatory mechanisms neurohormonal activation RAAS diagram, ${base}`, caption: "Kalp Yetmezliği Patofizyolojisi" },
    ],
    Tüberküloz: [
      { prompt: `tuberculosis mycobacterium infection granuloma formation lung pathology diagram, ${base}`, caption: "TB Granülom Patogenezi" },
    ],
    "Karaciğer Sirozu ve Komplikasyonları": [
      { prompt: `liver cirrhosis portal hypertension complications varices ascites hepatic encephalopathy, ${base}`, caption: "Siroz Komplikasyonları" },
    ],
  };

  return topicOverrides[topic] ?? catPrompts[cat] ?? [
    { prompt: `${topic} medical diagram pathophysiology clinical presentation, ${base}`, caption: `${topic} — Klinik Özet` },
  ];
}

export function buildImageHtml(images: NoteImage[]): string {
  if (!images.length) return "";
  return `<div class="note-images-grid">${images
    .map(
      (img) =>
        `<figure class="note-image-figure">
          <img src="${img.url}" alt="${img.caption}" class="note-image" loading="lazy" />
          <figcaption class="note-image-caption">${img.caption}</figcaption>
        </figure>`
    )
    .join("")}</div>`;
}
