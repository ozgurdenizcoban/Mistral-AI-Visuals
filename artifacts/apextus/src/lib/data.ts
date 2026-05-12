export interface TreeBranch {
  cat: string;
  icon: string;
  topics: string[];
}

export const TREE: TreeBranch[] = [
  {
    cat: "Kardiyoloji", icon: "🫀", topics: [
      "Kalbin Fizyolojisi", "Kardiyovasküler Sistem Muayenesi", "Kalp Hastalıklarında Belirtiler",
      "Kalp Hastalıklarında Tanı Yöntemleri", "Kalp Yetmezliği", "Hipertansiyon",
      "İskemik Kalp Hastalıkları", "Kapak Hastalıkları", "İnfektif Endokardit",
      "Kardiyomiyopatiler", "Akut Miyokardit", "Perikard Hastalıkları", "Kardiyak Tümörler",
      "Periferik Arter Hastalıkları", "Kardiyak Aritmiler", "Yaşlılarda Kalp Hastalıkları",
    ],
  },
  {
    cat: "Göğüs Hastalıkları", icon: "🫁", topics: [
      "Akciğer Hastalıklarında Semptomlar", "Akciğer Hastalıklarında Fizik Muayene",
      "Solunum Hastalıklarında Tanı Yöntemleri", "Obstrüktif Akciğer Hastalıkları",
      "Restriktif Akciğer Hastalıkları", "Mesleksel Akciğer Hastalıkları",
      "Pulmoner Tromboemboli", "Pulmoner Hipertansiyon ve Kor Pulmonale", "Tüberküloz",
      "Solunum Sisteminin Enfeksiyon Hastalıkları", "Mantarlarla Oluşan Solunum Yolu Hastalıkları",
      "Plevra Hastalıkları", "Uyku Apne / Hipoapne Sendromu", "Akciğer Kanserleri",
      "Yaşlılıkta Meydana Gelen Solunum Sistemi Değişiklikleri",
    ],
  },
  {
    cat: "Hematoloji", icon: "🩸", topics: [
      "Hematopoez", "Anemiler", "Hemolitik Anemiler", "Lökosit Hastalıkları", "Lenfomalar",
      "Miyeloproliferatif Hastalıklar", "Plazma Hücre Diskrazileri",
      "Kanama Diyatezleri ve Trombozlar", "Kan Transfüzyonu", "Hemaferez",
      "Hematopoetik Kök Hücre Nakli",
    ],
  },
  {
    cat: "Nefroloji", icon: "🫘", topics: [
      "Renal Fizyoloji ve Tübül Hastalıkları", "Sıvı ve Elektrolit Dengesi ve Bozuklukları",
      "Asit-Baz Dengesi ve Bozuklukları", "Böbrek Fonksiyonlarının Değerlendirilmesi",
      "Akut Böbrek Hasarı", "Kronik Böbrek Hastalığı", "Glomerülonefritler",
      "Sistemik Hastalıkların Böbrek Tutulumu", "İnterstisyel Nefritler", "Diğer Renal Patolojiler",
    ],
  },
  {
    cat: "Onkoloji", icon: "🎗️", topics: [
      "Genel Bilgiler", "Kanser Tedavisinde Kullanılan İlaçlar",
      "Paraneoplastik Sendromlar", "Onkolojik Aciller",
    ],
  },
  {
    cat: "Geriatri", icon: "👴", topics: [
      "Yaşa Bağlı Fizyolojik Değişiklikler", "Geriatride Sistemik Hastalıklar",
      "Geriatriye Giriş", "Kapsamlı Geriatrik Değerlendirme", "Malnütrisyon", "Sarkopeni",
      "Demans", "Deliryum", "Depresyon", "Üriner İnkontinans", "Polifarmasi",
      "Bası Yaraları", "Düşme", "Senkop", "Ortostatik Hipotansiyon", "Kırılganlık",
    ],
  },
  {
    cat: "Endokrinoloji", icon: "⚗️", topics: [
      "Hipotalamo-Hipofizer Hormonlar", "Hipotalamus ve Hipofiz Hastalıkları",
      "Tiroid Hormonları ve Hastalıkları", "Paratroid Hastalıkları ve Kalsiyum",
      "Metabolizmaz", "Metabolik Kemik Hastalıkları", "Diabetes Mellitus",
      "Adrenal Bez Hastalıkları", "Diğer Endokrin Hastalıkları",
    ],
  },
  {
    cat: "Romatoloji", icon: "🦴", topics: [
      "Romatolojiye Giriş", "Vaskülitler", "Romatoid Artrit", "Sistemik Lupus Eritematozus",
      "Seronegâtif Spondilоartropatiler", "Diğer Bağ Doku Hastalıkları", "Diğer Artritler",
    ],
  },
  {
    cat: "Hepatoloji", icon: "🟤", topics: [
      "Karaciğer Testleri ve Hiperbilirubinemiler", "Akut ve Kronik Viral Hepatitler",
      "Metabolik, Toksik ve İmmünolojik Karaciğer Hastalıkları",
      "Karaciğer Sirozu ve Komplikasyonları", "Diğer Karaciğer Hastalıkları",
    ],
  },
  {
    cat: "Gastroenteroloji", icon: "🫃", topics: [
      "Özofagus ve Mide Duodenum Hastalıkları", "Üst Gastrointestinal Sistem Kanamaları",
      "Alt Gastrointestinal Sistem Kanamaları", "İntestinal Hastalıklar",
      "Pankreas Hastalıkları", "Safra Kesesi ve Safra Yolları Hastalıkları",
    ],
  },
  {
    cat: "Enfeksiyon Hastalıkları", icon: "🦠", topics: [
      "Ateş", "Üst Solunum Yolu Enfeksiyonları", "Pnömoniler",
      "Tüberküloz ve Diğer Mikobakteri Enfeksiyonları", "Üriner Sistem Enfeksiyonları",
      "Menenjit ve Ensefalitler", "Retroviridae Enfeksiyonları",
      "İnsan İmmün Yetmezlik Virüsü 1 ve 2 (AIDS)", "Viral Hepatitler",
      "Gram Negatif Kokobasil Enfeksiyonları",
    ],
  },
];

export const soruTipleri = [
  "Tanı sorusu", "Tanısal adım sorusu", "Laboratuvar bulgusu sorusu",
  "İlk yapılacak işlem sorusu", "Fizik muayene bulgusu sorusu",
  "Patofizyoloji sorusu", "Komplikasyon sorusu", "Ayırıcı tanı sorusu",
  "Prognoz sorusu", "Kontrendikasyon sorusu",
];

export const SR_INTERVALS = [1, 3, 7, 14, 30, 60];

export const FREE_LIMITS = { quiz: 5, aiExplain: 1, notes: 1 };

export const CAT_MIGRATE: Record<string, string> = {
  Pulmoloji: "Göğüs Hastalıkları",
  Enfeksiyon: "Enfeksiyon Hastalıkları",
  "Genel Dahiliye": "Geriatri",
  "iç hastalıkları karma": "Karışık",
  Pulmonoloji: "Göğüs Hastalıkları",
};

export interface LinkEntry {
  cat: string;
  topic: string;
  note: string;
}

export const LINK_MAP: Record<string, LinkEntry[]> = {
  "Kalp Yetmezliği": [
    { cat: "Nefroloji", topic: "Kronik Böbrek Hastalığı", note: "Kardiyorenal sendrom Tip 2: kronik KY → KBH" },
    { cat: "Endokrinoloji", topic: "Tiroid Hormonları ve Hastalıkları", note: "Hipotiroidi → kardiyomiyopati + perikardiyal efüzyon" },
    { cat: "Nefroloji", topic: "Sıvı ve Elektrolit Dengesi ve Bozuklukları", note: "KY'de dilüsyonel hiponatremi kötü prognoz" },
  ],
  "İskemik Kalp Hastalıkları": [
    { cat: "Endokrinoloji", topic: "Diabetes Mellitus", note: "DM KAH riskini 2-4x artırır, silent MI sık" },
    { cat: "Nefroloji", topic: "Kronik Böbrek Hastalığı", note: "KBH kardiyovasküler ölümün en sık nedeni" },
    { cat: "Romatoloji", topic: "Romatoid Artrit", note: "RA kronik inflamasyon → erken ateroskleroz" },
  ],
  "Kardiyak Aritmiler": [
    { cat: "Nefroloji", topic: "Sıvı ve Elektrolit Dengesi ve Bozuklukları", note: "Hiperkalemi: peaked T → sinüs durması → VF" },
    { cat: "Endokrinoloji", topic: "Tiroid Hormonları ve Hastalıkları", note: "Tirotoksikoz → sinüs taşikardisi + AF" },
  ],
  "Akut Böbrek Hasarı": [
    { cat: "Kardiyoloji", topic: "Kalp Yetmezliği", note: "Kardiyorenal sendrom: KY → böbrek perfüzyonu azalır" },
    { cat: "Nefroloji", topic: "Sıvı ve Elektrolit Dengesi ve Bozuklukları", note: "AKI'nin en tehlikeli komplikasyonu hiperkalemi" },
  ],
  "Kronik Böbrek Hastalığı": [
    { cat: "Kardiyoloji", topic: "Hipertansiyon", note: "KBH hem HT nedeni hem sonucu" },
    { cat: "Hematoloji", topic: "Anemiler", note: "EPO eksikliği + demir eksikliği → normositik anemi" },
  ],
  "Diabetes Mellitus": [
    { cat: "Kardiyoloji", topic: "İskemik Kalp Hastalıkları", note: "DM en önemli KAH risk faktörü" },
    { cat: "Nefroloji", topic: "Glomerülonefritler", note: "DM → diffüz glomerüloskleroz → nefrotik sendrom" },
  ],
  "Karaciğer Sirozu ve Komplikasyonları": [
    { cat: "Nefroloji", topic: "Akut Böbrek Hasarı", note: "Hepatorenal sendrom: sirozdaki en ölümcül AKI" },
    { cat: "Hematoloji", topic: "Kanama Diyatezleri ve Trombozlar", note: "Karaciğer faktör üretemez → kanama diyatezi" },
  ],
  "Tüberküloz": [
    { cat: "Endokrinoloji", topic: "Adrenal Bez Hastalıkları", note: "TBC adrenal bez tutulumu → Addison hastalığı" },
  ],
  "Glomerülonefritler": [
    { cat: "Romatoloji", topic: "Sistemik Lupus Eritematozus", note: "Lupus nefriti: en önemli SLE organ tutulumu" },
    { cat: "Kardiyoloji", topic: "İnfektif Endokardit", note: "IE → immün kompleks birikimi → GN" },
  ],
  "Sistemik Lupus Eritematozus": [
    { cat: "Nefroloji", topic: "Glomerülonefritler", note: "Lupus nefriti: WHO sınıf I-VI" },
    { cat: "Hematoloji", topic: "Kanama Diyatezleri ve Trombozlar", note: "APS: SLE ile sık birlikte görülür" },
  ],
};

export const ADMIN_EMAILS = ["seninmail@gmail.com", "ozgurdenizzcoban@gmail.com"];

/* TUS Klinik Bilimler dahiliye soru dağılımı (100 Klinik sorudan dahiliye payı) */
export const TUS_KLINIK_WEIGHTS: Record<string, number> = {
  "Kardiyoloji": 9,
  "Göğüs Hastalıkları": 7,
  "Hematoloji": 6,
  "Nefroloji": 6,
  "Endokrinoloji": 8,
  "Gastroenteroloji": 6,
  "Hepatoloji": 5,
  "Romatoloji": 5,
  "Enfeksiyon Hastalıkları": 7,
  "Onkoloji": 4,
  "Geriatri": 3,
};
