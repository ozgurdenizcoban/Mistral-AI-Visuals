export interface NoteImage {
  url: string;
  caption: string;
}

/* ── Wikipedia article → thumbnail ──────────────────────────── */
async function fetchWikiImage(articleTitle: string): Promise<NoteImage | null> {
  try {
    const params = new URLSearchParams({
      action: "query",
      titles: articleTitle,
      prop: "pageimages",
      piprop: "thumbnail|original",
      pithumbsize: "800",
      pilicense: "any",
      format: "json",
      origin: "*",
    });
    const resp = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const pages = Object.values(data?.query?.pages || {}) as Record<string, unknown>[];
    const page = pages[0] as { thumbnail?: { source?: string }; original?: { source?: string } } | undefined;
    if (!page) return null;
    const src = page.thumbnail?.source || page.original?.source;
    if (!src) return null;
    // request 800-px version from Wikimedia thumb server
    const large = src.replace(/\/\d+px-/, "/800px-");
    return { url: large, caption: articleTitle };
  } catch (_) {
    return null;
  }
}

/* ── Wikimedia Commons full-text search (fallback) ──────────── */
async function searchCommonsImage(query: string): Promise<NoteImage | null> {
  try {
    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: query,
      gsrnamespace: "6",
      gsrlimit: "20",
      prop: "imageinfo",
      iiprop: "url|mime|size",
      iiurlwidth: "800",
      format: "json",
      origin: "*",
    });
    const resp = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const pages = Object.values(data?.query?.pages || {}) as Record<string, unknown>[];
    for (const p of pages) {
      const page = p as { imageinfo?: { mime?: string; thumburl?: string; url?: string; thumbwidth?: number; width?: number }[]; title?: string };
      const ii = page.imageinfo?.[0];
      if (!ii) continue;
      const mime = ii.mime || "";
      if (!mime.includes("jpeg") && !mime.includes("png")) continue;
      const w = ii.thumbwidth || ii.width || 0;
      if (w < 300) continue;
      const src = ii.thumburl || ii.url;
      if (!src) continue;
      const cap = String(page.title || "").replace("File:", "").replace(/_/g, " ").replace(/\.[^.]+$/, "");
      return { url: src, caption: cap };
    }
    return null;
  } catch (_) {
    return null;
  }
}

/* ── Wikipedia article search → best image ──────────────────── */
async function searchWikiArticleImage(query: string): Promise<NoteImage | null> {
  try {
    const params = new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: query,
      srnamespace: "0",
      srlimit: "5",
      format: "json",
      origin: "*",
    });
    const resp = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
      signal: AbortSignal.timeout(7000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const results = (data?.query?.search || []) as { title: string }[];
    for (const r of results.slice(0, 3)) {
      const img = await fetchWikiImage(r.title);
      if (img) return { ...img, caption: r.title };
    }
    return null;
  } catch (_) {
    return null;
  }
}

/** Fetch the best medical image for an English search query.
 *  1st: Wikipedia article search  2nd: Wikimedia Commons full-text */
export async function fetchMedicalImage(query: string): Promise<NoteImage | null> {
  const wiki = await searchWikiArticleImage(query);
  if (wiki) return wiki;
  return searchCommonsImage(query);
}

/* ── Per-topic Wikipedia article & Commons query map ───────── */
interface TopicMedia {
  articles: string[];  // Wikipedia article titles → thumbnail
  query: string;       // Commons fallback search query
}

const TOPIC_MAP: Record<string, TopicMedia> = {
  // Kardiyoloji
  "Kalbin Fizyolojisi":                   { articles: ["Heart", "Cardiac cycle"], query: "heart anatomy diagram" },
  "Kardiyovasküler Sistem Muayenesi":      { articles: ["Cardiovascular examination"], query: "cardiovascular examination auscultation" },
  "Kalp Hastalıklarında Belirtiler":       { articles: ["Heart failure signs and symptoms"], query: "heart disease symptoms diagram" },
  "Kalp Hastalıklarında Tanı Yöntemleri": { articles: ["Echocardiography", "Electrocardiography"], query: "ECG electrocardiogram medical" },
  "Kalp Yetmezliği":                       { articles: ["Heart failure"], query: "heart failure pathophysiology" },
  "Hipertansiyon":                          { articles: ["Hypertension"], query: "hypertension pathophysiology diagram" },
  "İskemik Kalp Hastalıkları":             { articles: ["Coronary artery disease", "Myocardial infarction"], query: "coronary artery disease atherosclerosis" },
  "Kapak Hastalıkları":                    { articles: ["Valvular heart disease", "Mitral valve stenosis"], query: "heart valve anatomy pathology" },
  "İnfektif Endokardit":                   { articles: ["Infective endocarditis"], query: "infective endocarditis vegetation pathology" },
  "Kardiyomiyopatiler":                    { articles: ["Cardiomyopathy", "Hypertrophic cardiomyopathy"], query: "cardiomyopathy heart muscle" },
  "Akut Miyokardit":                        { articles: ["Myocarditis"], query: "myocarditis inflammation heart" },
  "Perikard Hastalıkları":                 { articles: ["Pericarditis", "Cardiac tamponade"], query: "pericarditis pericardial effusion" },
  "Kardiyak Aritmiler":                    { articles: ["Cardiac arrhythmia", "Atrial fibrillation"], query: "cardiac arrhythmia ECG rhythm" },
  "Periferik Arter Hastalıkları":          { articles: ["Peripheral artery disease"], query: "peripheral artery disease anatomy" },
  "Kardiyak Tümörler":                     { articles: ["Cardiac tumor", "Myxoma"], query: "cardiac tumor myxoma echocardiogram" },
  "Yaşlılarda Kalp Hastalıkları":          { articles: ["Heart failure", "Aortic stenosis"], query: "elderly heart disease aging" },
  // Göğüs
  "Akciğer Hastalıklarında Semptomlar":   { articles: ["Dyspnea", "Cough"], query: "lung symptoms respiratory" },
  "Akciğer Hastalıklarında Fizik Muayene": { articles: ["Lung auscultation"], query: "chest auscultation percussion lung exam" },
  "Solunum Hastalıklarında Tanı Yöntemleri": { articles: ["Spirometry", "Chest X-ray"], query: "spirometry lung function test" },
  "Obstrüktif Akciğer Hastalıkları":      { articles: ["Chronic obstructive pulmonary disease", "Asthma"], query: "COPD obstructive lung disease spirometry" },
  "Restriktif Akciğer Hastalıkları":       { articles: ["Restrictive lung disease", "Pulmonary fibrosis"], query: "restrictive lung disease fibrosis" },
  "Mesleksel Akciğer Hastalıkları":        { articles: ["Pneumoconiosis", "Asbestosis"], query: "occupational lung disease pneumoconiosis" },
  "Pulmoner Tromboemboli":                 { articles: ["Pulmonary embolism"], query: "pulmonary embolism pathophysiology DVT" },
  "Pulmoner Hipertansiyon ve Kor Pulmonale": { articles: ["Pulmonary hypertension", "Cor pulmonale"], query: "pulmonary hypertension pathophysiology" },
  "Tüberküloz":                             { articles: ["Tuberculosis"], query: "tuberculosis lung pathology granuloma" },
  "Solunum Sisteminin Enfeksiyon Hastalıkları": { articles: ["Pneumonia", "Community-acquired pneumonia"], query: "pneumonia lung consolidation radiology" },
  "Mantarlarla Oluşan Solunum Yolu Hastalıkları": { articles: ["Aspergillosis", "Histoplasmosis"], query: "fungal lung infection aspergillosis" },
  "Plevra Hastalıkları":                   { articles: ["Pleural effusion", "Pneumothorax"], query: "pleural effusion pneumothorax chest" },
  "Uyku Apne / Hipoapne Sendromu":         { articles: ["Sleep apnea", "Obstructive sleep apnea"], query: "sleep apnea polysomnography airway" },
  "Akciğer Kanserleri":                    { articles: ["Lung cancer", "Non-small-cell lung carcinoma"], query: "lung cancer pathology radiology" },
  "Yaşlılıkta Meydana Gelen Solunum Sistemi Değişiklikleri": { articles: ["Lung", "Aging"], query: "aging lung physiological changes" },
  // Hematoloji
  "Hematopoez":                            { articles: ["Haematopoiesis"], query: "hematopoiesis bone marrow diagram" },
  "Anemiler":                              { articles: ["Anemia", "Iron-deficiency anemia"], query: "anemia blood smear peripheral film" },
  "Hemolitik Anemiler":                    { articles: ["Hemolytic anemia", "Sickle cell disease"], query: "hemolytic anemia sickle cell blood smear" },
  "Lökosit Hastalıkları":                  { articles: ["Leukemia", "Acute myeloid leukemia"], query: "leukemia blood smear bone marrow" },
  "Lenfomalar":                             { articles: ["Lymphoma", "Hodgkin lymphoma"], query: "lymphoma pathology Reed Sternberg" },
  "Miyeloproliferatif Hastalıklar":         { articles: ["Myeloproliferative neoplasm", "Polycythemia vera"], query: "myeloproliferative disease bone marrow" },
  "Plazma Hücre Diskrazileri":             { articles: ["Multiple myeloma", "Plasma cell"], query: "multiple myeloma plasma cell pathology" },
  "Kanama Diyatezleri ve Trombozlar":      { articles: ["Coagulation", "Thrombosis"], query: "coagulation cascade diagram bleeding" },
  "Kan Transfüzyonu":                      { articles: ["Blood transfusion"], query: "blood transfusion ABO blood group" },
  "Hemaferez":                             { articles: ["Apheresis"], query: "apheresis plasmapheresis blood" },
  "Hematopoetik Kök Hücre Nakli":          { articles: ["Hematopoietic stem cell transplantation"], query: "stem cell transplant bone marrow" },
  // Nefroloji
  "Renal Fizyoloji ve Tübül Hastalıkları": { articles: ["Nephron", "Kidney"], query: "nephron anatomy diagram tubule" },
  "Sıvı ve Elektrolit Dengesi ve Bozuklukları": { articles: ["Electrolyte", "Hyponatremia"], query: "fluid electrolyte balance sodium potassium" },
  "Asit-Baz Dengesi ve Bozuklukları":      { articles: ["Acid–base homeostasis", "Metabolic acidosis"], query: "acid base balance pH diagram" },
  "Böbrek Fonksiyonlarının Değerlendirilmesi": { articles: ["Glomerular filtration rate", "Creatinine"], query: "kidney function GFR creatinine" },
  "Akut Böbrek Hasarı":                    { articles: ["Acute kidney injury"], query: "acute kidney injury pathophysiology ATN" },
  "Kronik Böbrek Hastalığı":               { articles: ["Chronic kidney disease"], query: "chronic kidney disease GFR stages" },
  "Glomerülonefritler":                    { articles: ["Glomerulonephritis", "IgA nephropathy"], query: "glomerulonephritis pathology kidney biopsy" },
  "Sistemik Hastalıkların Böbrek Tutulumu": { articles: ["Diabetic nephropathy", "Lupus nephritis"], query: "diabetic nephropathy kidney pathology" },
  "İnterstisyel Nefritler":                { articles: ["Interstitial nephritis"], query: "interstitial nephritis tubular inflammation" },
  "Diğer Renal Patolojiler":               { articles: ["Polycystic kidney disease", "Kidney stone"], query: "kidney disease polycystic renal stone" },
  // Onkoloji
  "Genel Bilgiler":                        { articles: ["Cancer", "Oncology"], query: "cancer cell cycle hallmarks tumor biology" },
  "Kanser Tedavisinde Kullanılan İlaçlar": { articles: ["Chemotherapy", "Targeted therapy"], query: "chemotherapy mechanism action cancer drugs" },
  "Paraneoplastik Sendromlar":             { articles: ["Paraneoplastic syndrome"], query: "paraneoplastic syndrome cancer" },
  "Onkolojik Aciller":                     { articles: ["Tumor lysis syndrome", "Superior vena cava syndrome"], query: "oncologic emergency tumor lysis" },
  // Geriatri
  "Yaşa Bağlı Fizyolojik Değişiklikler":  { articles: ["Aging", "Senescence"], query: "aging physiological changes organ" },
  "Geriatriye Giriş":                      { articles: ["Geriatrics"], query: "geriatrics elderly assessment" },
  "Kapsamlı Geriatrik Değerlendirme":      { articles: ["Comprehensive geriatric assessment"], query: "geriatric assessment frailty" },
  "Malnütrisyon":                          { articles: ["Malnutrition"], query: "malnutrition nutritional assessment elderly" },
  "Sarkopeni":                             { articles: ["Sarcopenia"], query: "sarcopenia muscle loss elderly" },
  "Demans":                                { articles: ["Dementia", "Alzheimer's disease"], query: "dementia Alzheimer brain pathology" },
  "Deliryum":                              { articles: ["Delirium"], query: "delirium confusion acute brain" },
  "Depresyon":                             { articles: ["Major depressive disorder"], query: "depression neuroscience brain" },
  "Üriner İnkontinans":                    { articles: ["Urinary incontinence"], query: "urinary incontinence bladder anatomy" },
  "Polifarmasi":                           { articles: ["Polypharmacy"], query: "polypharmacy drug interaction elderly" },
  "Bası Yaraları":                         { articles: ["Pressure ulcer"], query: "pressure ulcer wound staging" },
  "Düşme":                                 { articles: ["Falls in older adults"], query: "falls elderly risk assessment" },
  "Senkop":                                { articles: ["Syncope (medicine)"], query: "syncope pathophysiology diagnosis" },
  "Ortostatik Hipotansiyon":               { articles: ["Orthostatic hypotension"], query: "orthostatic hypotension blood pressure" },
  "Kırılganlık":                           { articles: ["Frailty syndrome"], query: "frailty elderly phenotype" },
  "Geriatride Sistemik Hastalıklar":       { articles: ["Geriatrics"], query: "geriatric systemic disease elderly" },
  // Endokrinoloji
  "Hipotalamo-Hipofizer Hormonlar":        { articles: ["Hypothalamic–pituitary–adrenal axis", "Pituitary gland"], query: "hypothalamic pituitary axis hormones" },
  "Hipotalamus ve Hipofiz Hastalıkları":   { articles: ["Pituitary adenoma", "Hypopituitarism"], query: "pituitary gland disease adenoma" },
  "Tiroid Hormonları ve Hastalıkları":     { articles: ["Thyroid", "Hypothyroidism", "Hyperthyroidism"], query: "thyroid gland disease pathology" },
  "Paratroid Hastalıkları ve Kalsiyum":    { articles: ["Hyperparathyroidism", "Parathyroid gland"], query: "parathyroid calcium metabolism" },
  "Metabolizmaz":                          { articles: ["Metabolic syndrome"], query: "metabolic syndrome obesity insulin" },
  "Metabolik Kemik Hastalıkları":          { articles: ["Osteoporosis", "Paget's disease of bone"], query: "osteoporosis bone density pathology" },
  "Diabetes Mellitus":                     { articles: ["Diabetes mellitus", "Diabetes mellitus type 2"], query: "diabetes mellitus pathophysiology insulin" },
  "Adrenal Bez Hastalıkları":             { articles: ["Addison's disease", "Cushing's syndrome", "Adrenal gland"], query: "adrenal gland disease cortisol" },
  "Diğer Endokrin Hastalıkları":           { articles: ["Multiple endocrine neoplasia", "Carcinoid tumor"], query: "endocrine neoplasia tumor" },
  // Romatoloji
  "Romatolojiye Giriş":                    { articles: ["Rheumatology"], query: "rheumatology joint inflammation autoimmune" },
  "Vaskülitler":                           { articles: ["Vasculitis"], query: "vasculitis pathology blood vessel inflammation" },
  "Romatoid Artrit":                       { articles: ["Rheumatoid arthritis"], query: "rheumatoid arthritis joint pathology" },
  "Sistemik Lupus Eritematozus":           { articles: ["Systemic lupus erythematosus"], query: "lupus erythematosus butterfly rash ANA" },
  "Seronegâtif Spondilоartropatiler":      { articles: ["Spondyloarthropathy", "Ankylosing spondylitis"], query: "ankylosing spondylitis spine bamboo" },
  "Diğer Bağ Doku Hastalıkları":          { articles: ["Sjögren syndrome", "Systemic sclerosis"], query: "connective tissue disease scleroderma" },
  "Diğer Artritler":                       { articles: ["Gout", "Pseudogout"], query: "gout uric acid crystal arthritis" },
  // Hepatoloji
  "Karaciğer Testleri ve Hiperbilirubinemiler": { articles: ["Liver function tests", "Jaundice"], query: "liver function tests bilirubin jaundice" },
  "Akut ve Kronik Viral Hepatitler":       { articles: ["Hepatitis B", "Hepatitis C", "Hepatitis"], query: "viral hepatitis liver pathology" },
  "Metabolik, Toksik ve İmmünolojik Karaciğer Hastalıkları": { articles: ["Non-alcoholic fatty liver disease", "Autoimmune hepatitis"], query: "fatty liver NASH alcoholic hepatitis" },
  "Karaciğer Sirozu ve Komplikasyonları": { articles: ["Liver cirrhosis", "Portal hypertension"], query: "liver cirrhosis portal hypertension complications" },
  "Diğer Karaciğer Hastalıkları":          { articles: ["Hepatocellular carcinoma", "Wilson's disease"], query: "liver disease hepatocellular carcinoma" },
  // Gastroenteroloji
  "Özofagus Hastalıkları":                 { articles: ["Gastroesophageal reflux disease", "Esophageal cancer"], query: "esophagus disease GERD pathology" },
  "Mide Hastalıkları":                     { articles: ["Peptic ulcer disease", "Gastritis"], query: "peptic ulcer gastritis H pylori" },
  "İnce Barsak Hastalıkları":             { articles: ["Crohn's disease", "Coeliac disease"], query: "small bowel Crohn celiac disease" },
  "İnflamatuvar Barsak Hastalıkları":      { articles: ["Inflammatory bowel disease", "Ulcerative colitis"], query: "inflammatory bowel disease colitis Crohn" },
  "Kolorektal Hastalıklar":                { articles: ["Colorectal cancer", "Diverticular disease"], query: "colorectal cancer colon pathology" },
  "Pankreatit ve Pankreas Hastalıkları":   { articles: ["Pancreatitis", "Pancreatic cancer"], query: "pancreatitis pancreas anatomy pathology" },
  "Akut Batın Hastalıkları":               { articles: ["Acute abdomen", "Appendicitis"], query: "acute abdomen appendicitis surgical" },
  // Enfeksiyon
  "Antibiyotikler":                        { articles: ["Antibiotic", "Beta-lactam antibiotic"], query: "antibiotic mechanism action bacteria" },
  "Ateş":                                  { articles: ["Fever", "Fever of unknown origin"], query: "fever pathophysiology thermoregulation" },
  "Sepsisler":                             { articles: ["Sepsis"], query: "sepsis pathophysiology inflammatory" },
  "HIV Enfeksiyonu":                       { articles: ["HIV/AIDS", "HIV"], query: "HIV AIDS pathophysiology CD4 cells" },
  "Tropikal Hastalıklar":                  { articles: ["Malaria", "Dengue fever"], query: "tropical disease malaria dengue" },
  "Parazit Hastalıkları":                  { articles: ["Parasitic disease"], query: "parasitic disease helminth protozoa" },
  "Fırsatçı Enfeksiyonlar":               { articles: ["Opportunistic infection", "Pneumocystis pneumonia"], query: "opportunistic infection immunocompromised" },
  "Viral Hepatitler":                      { articles: ["Hepatitis A", "Hepatitis E"], query: "viral hepatitis liver virus" },
};

/* ── Category fallback when topic not mapped ─────────────────── */
const CAT_FALLBACK: Record<string, TopicMedia> = {
  "Kardiyoloji":         { articles: ["Heart"], query: "cardiology heart anatomy" },
  "Göğüs Hastalıkları": { articles: ["Lung"], query: "lung pulmonology anatomy" },
  "Hematoloji":          { articles: ["Haematopoiesis"], query: "hematology blood cells bone marrow" },
  "Nefroloji":           { articles: ["Kidney", "Nephron"], query: "kidney nephron anatomy" },
  "Onkoloji":            { articles: ["Cancer"], query: "oncology tumor cancer cell" },
  "Geriatri":            { articles: ["Geriatrics"], query: "geriatrics elderly aging" },
  "Endokrinoloji":       { articles: ["Endocrine system"], query: "endocrine system hormones gland" },
  "Romatoloji":          { articles: ["Rheumatoid arthritis"], query: "rheumatology joint autoimmune" },
  "Hepatoloji":          { articles: ["Liver"], query: "liver anatomy hepatology" },
  "Gastroenteroloji":    { articles: ["Gastrointestinal tract"], query: "gastrointestinal anatomy diagram" },
  "Enfeksiyon Hastalıkları": { articles: ["Infection"], query: "infectious disease pathogen immunity" },
};

/* ── Public API ─────────────────────────────────────────────── */

/** Fetch up to 2 Wikipedia images for a note topic.
 *  Only attempts fetch for topics explicitly in TOPIC_MAP — no generic fallbacks. */
export async function generateNoteImages(cat: string, topic: string): Promise<NoteImage[]> {
  const media = TOPIC_MAP[topic]; // CAT_FALLBACK intentionally NOT used for notes
  if (!media) return [];

  const results: NoteImage[] = [];

  // Try Wikipedia article thumbnails first
  for (const article of media.articles) {
    if (results.length >= 2) break;
    const img = await fetchWikiImage(article);
    if (img) results.push(img);
  }

  // Commons search fallback
  if (results.length < 1) {
    const img = await searchCommonsImage(media.query);
    if (img) results.push(img);
  }

  return results;
}

/** Return a single Wikipedia image for a quiz question topic.
 *  Only returns an image if the topic is explicitly in TOPIC_MAP — no generic fallbacks. */
export async function getQuizImage(tags: string[]): Promise<NoteImage | null> {
  const topic = tags?.[0] || "";
  const media = TOPIC_MAP[topic];
  if (!media) return null;

  // Try up to 2 articles for the best result
  for (const article of media.articles.slice(0, 2)) {
    const img = await fetchWikiImage(article);
    if (img) return img;
  }
  return searchCommonsImage(media.query);
}

/** Build img-grid HTML for embedding in note innerHTML */
export function buildImageHtml(images: NoteImage[]): string {
  if (!images.length) return "";
  return `<div class="note-images-grid">${images
    .map(
      (img) =>
        `<figure class="note-image-figure">
          <img src="${img.url}" alt="${img.caption}" class="note-image" loading="lazy" />
          <figcaption class="note-image-caption">📖 ${img.caption} — Wikipedia / Wikimedia Commons</figcaption>
        </figure>`
    )
    .join("")}</div>`;
}
