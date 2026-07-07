const PHYSIOLOGY_SOURCE_NAME = "Tip Akademisi / Dr. Mekanizma Fizyoloji konu kitabı";

const PHYSIOLOGY_GUIDES: Record<string, string[]> = {
  "Hücre Fizyolojisi ve Membran Potansiyeli": [
    "Kaynak bölümleri: Hücre; hücre zarı, transport proteinleri, madde transportu, veziküler transport, organeller, çekirdek, hücre döngüsü.",
    "Endositoz tiplerini ayır: mikropinositoz, makropinositoz, fagositoz, reseptör aracılı endositoz; klatrin, adaptin, kaveolin, flottilin, dynamin GTPaz ve aktin bağımlılığı özellikle vurgulansın.",
    "Membran potansiyeli anlatımında iyon gradyanları, Na/K ATPaz, elektrokimyasal sürükleyici güç, eşik ve aksiyon potansiyeli mantığı birlikte kurulsun.",
  ],
  "Kas Fizyolojisi": [
    "Kaynak bölümü: Sinir doku ve kas doku.",
    "İskelet, düz ve kalp kasını; uyarılma-kasılma eşleşmesi, Ca düzeni, troponin/tropomiyozin ve otonom kontrol farklarıyla karşılaştır.",
    "TUS sorularında kas lifi tipi, motor ünite, nöromusküler kavşak ve kasılma enerji kaynakları klinik vaka içinde sorgulansın.",
  ],
  "Sinir Sistemi Fizyolojisi": [
    "Kaynak bölümleri: Sinir doku ve kas doku; Sinir sistemi.",
    "Glia hücreleri, astrosit-GFAP, oligodendrosit/Schwann farkı, mikroglia kökeni, ependim ve kan-beyin bariyeri yüksek verimli karşılaştırma olarak verilsin.",
    "Serebellum, bazal ganglion, duyu yolları, motor yollar ve refleks arkları fonksiyon-defisit ilişkisiyle anlatılsın.",
  ],
  "Kardiyovasküler Fizyoloji": [
    "Kaynak bölümü: Kardiyovasküler sistem.",
    "Kalp döngüsü, kapak olayları, basınç-hacim ilişkisi, preload/afterload/kontraktilite ve otonom düzenleme birlikte işlenir.",
    "EKG, kalp sesleri, damar direnci, kan basıncı regülasyonu ve şok tipleri TUS tarzı ayırıcı tanı sorularına çevrilsin.",
  ],
  "Solunum Fizyolojisi": [
    "Kaynak bölümü: Solunum sistemi.",
    "Ventilasyon, perfüzyon, V/Q oranı, difüzyon, oksijen-hemoglobin eğrisi, CO2 taşınması ve solunum kontrolü çekirdek omurga olsun.",
    "Restriktif-obstrüktif patern, hipoksemi mekanizmaları ve asit-baz bağlantısı vaka içinde sorgulansın.",
  ],
  "Böbrek Fizyolojisi": [
    "Kaynak bölümü: Üriner sistem.",
    "Nefron segmentlerini su/NaCl geçirgenliği, ADH etkisi, Henle kulbu, vaza rekta ve ters akım mekanizmasıyla anlat.",
    "ADH yokluğunda dilüe idrar, ADH varlığında konsantre idrar, idrar ozmolalitesi ve medüller gradyan özellikle görsel algoritmayla verilsin.",
  ],
  "Gastrointestinal Fizyoloji": [
    "Kaynak bölümü: Sindirim sistemi.",
    "Motilite, sekresyon, emilim, safra-pankreas fonksiyonları ve enterik sinir sistemi sıralı mekanizma olarak anlatılsın.",
    "Sorularda hormonlar, emilim yerleri, sekretuar/ozmotik ishal ve malabsorpsiyon ayırıcı tanısı öne çıkarılsın.",
  ],
  "Endokrin ve Üreme Fizyolojisi": [
    "Kaynak bölümleri: Endokrin sistemi; Genital sistem ve embriyoloji.",
    "Hipotalamus-hipofiz aksları, geri bildirim döngüleri, hormon reseptörleri ve hedef organ etkileri sistematik işlenir.",
    "Üreme fizyolojisinde ovaryan/uterin siklus, gebelik hormonları, serviks-endometrium değişimleri ve klinik korelasyonlar birlikte verilsin.",
  ],
  "Kan Fizyolojisi": [
    "Kaynak bağlantısı: Dokular bölümündeki kan doku ve lenfatik sistem.",
    "Eritrosit, lökosit, trombosit, hemostaz, koagülasyon-fibrinoliz ve kan grupları tablo ile karşılaştırılsın.",
    "Sorular hemostaz basamakları, pıhtılaşma testleri ve hücre kökenleri üzerinden ayırıcı tanı kurdurmalı.",
  ],
  "Asit-Baz ve Sıvı-Elektrolit Fizyolojisi": [
    "Kaynak bağlantısı: Solunum sistemi ve Üriner sistem bölümlerinin ortak fizyoloji mantığı.",
    "Bikarbonat tamponu, ventilatuvar kompansasyon, renal H atılımı, amonyagenez, anyon açığı ve elektrolit bozuklukları birlikte anlatılsın.",
    "TUS sorularında kan gazı yorumlama, kompansasyon beklenen/yetersiz ayrımı ve klinik senaryo üzerinden bozukluk tipi sordurulsun.",
  ],
};

export function getSourceGuide(cat: string, topics: string | string[]): string {
  if (cat !== "Fizyoloji") return "";

  const selectedTopics = Array.isArray(topics) ? topics : [topics];
  const matched = selectedTopics.flatMap((topic) => {
    const guide = PHYSIOLOGY_GUIDES[topic];
    if (!guide) return [];
    return [`KONU: ${topic}`, ...guide.map((line) => `- ${line}`)];
  });

  if (!matched.length) {
    matched.push(
      "Fizyoloji genelinde kaynak bölüm sırası: Hücre, Dokular, Sinir/Kas, Kardiyovasküler, Genital/Embriyoloji, Solunum, Endokrin, Sinir, Sindirim, Üriner sistem.",
      "- Konu anlatımı kaynak kitabın mekanizma odaklı kısa ama yoğun stiline uygun olsun.",
    );
  }

  return `KAYNAK ÖNCELİĞİ:
Bu fizyoloji içeriğinde ana kaynak olarak ${PHYSIOLOGY_SOURCE_NAME} esas alınacak.
Kaynağı birebir kopyalama; bilgiyi özgün TUS konu anlatımı ve TUS soru diline dönüştür.
Kaynakla çelişen genel ifadelerden kaçın; emin olmadığın sayısal/değer bilgisini uydurma.
${matched.join("\n")}`;
}
