const MICROBIOLOGY_ANCHORS: Record<string, string[]> = {
  "Bakteriyoloji Temelleri": [
    "bakteri hücre duvarı ve zar yapıları", "Gram boyama basamakları", "spor ve kapsül",
    "aerop-anaerop ayrımı", "üreme eğrisi", "genetik aktarım: transformasyon, transdüksiyon, konjugasyon",
    "virülans faktörleri", "sterilizasyon-dezenfeksiyon", "kültür ve identifikasyon testleri",
  ],
  "Gram Pozitif Bakteriler": [
    "Staphylococcus aureus", "Staphylococcus epidermidis", "Staphylococcus saprophyticus",
    "Streptococcus pyogenes (GAS)", "Streptococcus agalactiae (GBS)", "Streptococcus pneumoniae",
    "viridans streptokoklar", "Streptococcus gallolyticus", "Enterococcus faecalis ve faecium",
    "Bacillus anthracis", "Bacillus cereus", "Clostridium tetani", "Clostridium botulinum",
    "Clostridium perfringens", "Clostridioides difficile", "Corynebacterium diphtheriae",
    "Listeria monocytogenes", "Actinomyces israelii", "Nocardia türleri",
  ],
  "Gram Negatif Bakteriler": [
    "Neisseria meningitidis", "Neisseria gonorrhoeae", "Moraxella catarrhalis",
    "Escherichia coli patotipleri", "Klebsiella", "Proteus", "Salmonella", "Shigella", "Yersinia",
    "Vibrio cholerae", "Campylobacter jejuni", "Helicobacter pylori", "Pseudomonas aeruginosa",
    "Haemophilus influenzae", "Bordetella pertussis", "Legionella pneumophila", "Brucella",
    "Francisella tularensis", "Pasteurella multocida", "Bartonella", "Acinetobacter ve Bacteroides",
  ],
  "Mikobakteriler ve Spiroketler": [
    "Mycobacterium tuberculosis", "atipik mikobakteriler", "Mycobacterium leprae",
    "Treponema pallidum", "Borrelia burgdorferi ve relapsing fever", "Leptospira interrogans",
  ],
  "Viroloji Temelleri": [
    "viral yapı ve genom", "zarflı-zarfsız virüs farkları", "replikasyon basamakları",
    "sitopatik etkiler", "latent ve persistan enfeksiyon", "viral tanı yöntemleri", "antiviral hedefler",
  ],
  "DNA ve RNA Virüsleri": [
    "Herpesviridae: HSV-1/2, VZV, CMV, EBV, HHV-6/8", "Adenoviridae", "Papillomaviridae",
    "Polyomaviridae", "Poxviridae", "Parvovirus B19", "Hepadnaviridae",
    "Orthomyxoviridae", "Paramyxoviridae", "Picornaviridae", "Caliciviridae", "Reoviridae",
    "Flaviviridae", "Togaviridae", "Coronaviridae", "Rhabdoviridae", "Filoviridae",
    "Bunyavirales", "Arenaviridae", "Retroviridae ve HIV",
  ],
  "Mikoloji": [
    "Candida", "Cryptococcus", "Aspergillus", "Mucorales", "Pneumocystis jirovecii",
    "Histoplasma", "Blastomyces", "Coccidioides", "Sporothrix", "dermatofitler ve yüzeyel mikozlar",
  ],
  "Parazitoloji": [
    "Entamoeba", "Giardia", "Trichomonas", "Toxoplasma", "Plasmodium türleri", "Leishmania",
    "Trypanosoma", "Cryptosporidium", "Ascaris", "Enterobius", "Strongyloides", "kancalı kurtlar",
    "Trichinella", "Toxocara", "Taenia", "Echinococcus", "Diphyllobothrium", "Schistosoma ve Fasciola",
  ],
  "İmmünoloji": [
    "doğal ve adaptif bağışıklık", "kompleman", "MHC-I ve MHC-II", "T ve B hücre gelişimi",
    "immünoglobulin sınıfları", "sitokinler", "hipersensitivite tip I-IV", "immün yetmezlikler",
    "otoimmünite", "transplantasyon immünolojisi", "tümör immünolojisi",
  ],
  "Aşılar ve Antimikrobiyal Direnç": [
    "canlı ve inaktif aşılar", "toksoid, konjuge, alt birim ve mRNA aşıları", "aşı kontrendikasyonları",
    "beta-laktamazlar ve ESBL", "AmpC", "karbapenemazlar", "MRSA", "VRE",
    "hedef değişikliği, efluks ve geçirgenlik kaybı", "antibiyogram ve MİK yorumu",
  ],
};

function subjectContract(cat: string) {
  if (cat === "Anatomi") return "Her yapıyı komşulukları, fasya/boşluk ilişkileri, arter-ven-lenf drenajı, innervasyonu, varyasyonları ve lezyon kliniğiyle anlat.";
  if (cat === "Histoloji ve Embriyoloji") return "Her dokuda hücre tipleri, tabakalar, belirteçler ve elektron mikroskopisi bulgularını; embriyolojide köken, zaman çizelgesi, rotasyon/füzyon ve anomalileri kapsa.";
  if (cat === "Fizyoloji") return "Mekanizmayı hücresel düzeyden organ düzeyine kur; denklemleri, eğrileri, geri bildirimleri, normal sayısal değerleri ve deneysel değişken sonuçlarını atlama.";
  if (cat === "Biyokimya") return "Her yolakta yer, substrat-ürün, hız kısıtlayıcı enzim, kofaktör, enerji bilançosu, hormonal düzenleme, inhibitör ve kalıtsal hastalık bağlantısını ver.";
  if (cat === "Farmakoloji") return "Her ilaç sınıfında prototipler, etki mekanizması, farmakokinetik, endikasyon, doz/yol, yan etki, kontrendikasyon, etkileşim, antidot ve özel popülasyon farklarını işle.";
  if (cat === "Patoloji") return "Etiyoloji, moleküler patogenez, makroskopi, mikroskopi, immünohistokimya, genetik değişiklik, klinik davranış, evreleme ve ayırıcı tanıyı birlikte ver.";
  if (cat === "Mikrobiyoloji") return "Her etkende morfoloji/boyanma, kültür-biyokimya, virülans veya toksin, bulaş-rezervuar, hastalıklar, tanı, ilk seçenek tedavi, direnç ve korunmayı ayrı ayrı belirt.";
  if (["Pediatri", "Genel Cerrahi", "Kadın Hastalıkları ve Doğum", "Küçük Stajlar"].includes(cat)) {
    return "Yaşa/klinik duruma göre başvuru, acil yaklaşım, tanı basamakları, en iyi-kesin test, evreleme, tedavi endikasyonları, doz/işlem, takip ve komplikasyonları kapsa.";
  }
  return "Tanım ve epidemiyolojiden başlayıp mekanizma, sınıflama, klinik, tanı, ayırıcı tanı, tedavi, izlem, komplikasyon ve prognozu kılavuz mantığında eksiksiz işle.";
}

export type NoteGenerationPart = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export function getNoteCoverageContract(cat: string, topic: string, part: NoteGenerationPart) {
  const anchors = cat === "Mikrobiyoloji" ? MICROBIOLOGY_ANCHORS[topic] || [] : [];
  const focusByPart = {
    1: "Tanım, kapsam, epidemiyoloji, risk grupları ve etiyolojik çerçeveyi ayrıntılandır.",
    2: "Hücresel-moleküler mekanizmayı neden-sonuç sırasıyla ayrıntılandır.",
    3: "Sınıflamayı bütün alt tipleri kapsayan karşılaştırmalı bir sistem halinde ayrıntılandır.",
    4: "Klinik tabloları, klasik vaka örüntülerini ve ayırt ettiren bulguları ayrıntılandır.",
    5: "Belirteçleri ve tanı algoritmasını duyarlılık-özgüllük ve doğrulama mantığıyla ayrıntılandır.",
    6: "Laboratuvar, görüntüleme ve varsa skorları seçim ve yorumlama mantığıyla ayrıntılandır.",
    7: "Tedaviyi ilk seçenek, alternatif, doz/yol, direnç, kontrendikasyon ve izlemle ayrıntılandır.",
    8: "Komplikasyonları, prognozu, takip ölçütlerini ve kötü prognostik faktörleri ayrıntılandır.",
    9: "Ayırıcı tanıyı benzer durumlarla karşılaştırmalı ve vaka çözme odaklı ayrıntılandır.",
    10: "TUS spotlarını, istisnaları, sık tuzakları, aktif hatırlama sorularını ve klinik bağlantıları ayrıntılandır.",
  } as const;
  const focus = focusByPart[part];
  const anchorText = anchors.length && [3, 4, 5, 7].includes(part)
    ? `\nKONUYA ÖZEL ZORUNLU KAPSAM (${anchors.length} öğe):\n${anchors.map((item) => `- ${item}`).join("\n")}\nBu listedeki hiçbir öğeyi "vb." diyerek geçme. Her birinin adı ve ayırt ettiren en az 3 sınav bilgisi açıkça yer alsın.`
    : "";

  return `KAPSAM SÖZLEŞMESİ:
- ${subjectContract(cat)}
- ${focus}
- Bir alt başlığı 1-2 cümleyle geçme. Her önemli alt başlıkta en az bir açıklayıcı paragraf ve ardından yüksek verimli maddeler kullan.
- Benzer tabloları karşılaştır; yalnızca isim listesi verme. "Diğerleri", "ve benzerleri" veya "vb." ile kapsam daraltma.
- Güncel olmayan veya emin olunmayan ayrıntıyı uydurma; güvenilir olmayan kesin sayı/doz yazma.${anchorText}`;
}

export function getMandatoryNoteAnchors(cat: string, topic: string) {
  return cat === "Mikrobiyoloji" ? MICROBIOLOGY_ANCHORS[topic] || [] : [];
}
