import { useState, useEffect, useRef } from "react";
import { useApp } from "@/contexts/AppContext";
import { TREE, LINK_MAP, SR_INTERVALS, FREE_LIMITS } from "@/lib/data";
import { mistralText } from "@/lib/mistral";
import { fbGetNote, fbSaveNote, fbDeleteNote } from "@/lib/firestore";
import { fetchMedicalImage, getTopicDiagramQuery } from "@/lib/imageGen";
import { toDay, addDays } from "@/lib/utils";
import { toast } from "sonner";

const noteCache: Record<string, string> = {};

export default function Notes() {
  const { state, saveState, isPro, checkLimit, noteTarget, setNoteTarget, setCurrentPage, setQuizTarget } = useApp();
  const [selectedCat, setSelectedCat] = useState<string | null>(noteTarget?.cat ?? null);
  const [activeTopic, setActiveTopic] = useState<{ cat: string; icon: string; topic: string } | null>(noteTarget ?? null);
  const [noteHtml, setNoteHtml] = useState<string | null>(null);
  const [noteLoading, setNoteLoading] = useState(false);
  const [studyAdd, setStudyAdd] = useState(1);

  const noteRef = useRef<HTMLDivElement>(null);

  // Inject supplementary Wikipedia images (only for old notes without HTML diagrams).
  useEffect(() => {
    if (!noteRef.current || !noteHtml || !activeTopic) return;
    const root = noteRef.current;

    // New notes have inline edu-diagram elements — no external images needed
    if (root.querySelectorAll(".edu-diagram").length > 0) return;

    // Collect explicit placeholders added by the Mistral prompt (new notes)
    let placeholders = Array.from(root.querySelectorAll<HTMLElement>(".nb-img[data-q]"));

    // Always inject additional diagram slots (old/cached notes have none;
    // new notes benefit from extras positioned at known anatomical h2s)
    if (placeholders.length === 0) {
      const h2s = Array.from(root.querySelectorAll<HTMLElement>("h2"));

      // Keyword-based slots (works when h2 text contains the keyword)
      const kwTargets: { kw: string; suffix: string }[] = [
        { kw: "patofizyoloji", suffix: "anatomy physiology labeled diagram" },
        { kw: "laboratuvar",   suffix: "anatomy labeled scheme" },
        { kw: "tedavi",        suffix: "mechanism pharmacology diagram" },
      ];
      let injected = 0;
      for (const { kw, suffix } of kwTargets) {
        const h2 = h2s.find(h => (h.textContent || "").toLowerCase().includes(kw));
        if (h2) {
          const div = document.createElement("div");
          div.className = "nb-img";
          div.setAttribute("data-q", getTopicDiagramQuery(activeTopic.topic, activeTopic.cat, suffix));
          h2.insertAdjacentElement("afterend", div);
          placeholders.push(div);
          injected++;
        }
      }

      // Fallback: if keyword matching found nothing, inject 3 diagrams at h2 indices
      // so diagrams always appear regardless of heading text content
      if (injected === 0 && h2s.length >= 2) {
        const positions = [
          Math.min(1, h2s.length - 1),                              // 2nd heading
          Math.min(Math.floor(h2s.length / 2), h2s.length - 1),    // middle
          Math.min(h2s.length - 1, h2s.length - 1),                 // last heading
        ];
        const suffixes = [
          "anatomy labeled diagram",
          "pathophysiology mechanism scheme",
          "treatment pharmacology diagram",
        ];
        const seen = new Set<number>();
        positions.forEach((idx, i) => {
          if (seen.has(idx)) return;
          seen.add(idx);
          const div = document.createElement("div");
          div.className = "nb-img";
          div.setAttribute("data-q", getTopicDiagramQuery(activeTopic.topic, activeTopic.cat, suffixes[i]));
          h2s[idx].insertAdjacentElement("afterend", div);
          placeholders.push(div);
        });
      }

      // Last resort: append 1 diagram to root if still empty
      if (placeholders.length === 0) {
        const div = document.createElement("div");
        div.className = "nb-img";
        div.setAttribute("data-q", getTopicDiagramQuery(activeTopic.topic, activeTopic.cat, "anatomy labeled diagram"));
        root.insertAdjacentElement("afterbegin", div);
        placeholders.push(div);
      }
    }

    if (!placeholders.length) return;

    // Capture topic/cat at effect time so async callbacks stay correct
    const capTopic = activeTopic.topic;
    const capCat = activeTopic.cat;

    placeholders.forEach(async (el) => {
      const query = el.getAttribute("data-q");
      if (!query) { el.style.display = "none"; return; }
      el.innerHTML = `<div class="nb-img-skeleton"><span class="spin2"></span>&nbsp;Görsel yükleniyor...</div>`;
      try {
        const img = await fetchMedicalImage(query, capTopic, capCat);
        if (!noteRef.current?.contains(el)) return;
        if (img) {
          el.innerHTML = `<figure class="inline-note-img">
            <img src="${img.url}" alt="${img.caption}" loading="eager" />
            <figcaption>${img.caption}<span class="img-src"> — Wikipedia</span></figcaption>
          </figure>`;
        } else {
          el.style.display = "none";
        }
      } catch (_) {
        el.style.display = "none";
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteHtml]);

  useEffect(() => {
    if (noteTarget) {
      setSelectedCat(noteTarget.cat);
      setActiveTopic(noteTarget);
      setNoteTarget(null);
    }
  }, [noteTarget, setNoteTarget]);

  useEffect(() => {
    if (activeTopic) {
      loadNote(activeTopic.cat, activeTopic.icon, activeTopic.topic);
    }
  }, [activeTopic?.topic]);

  function srMarkRead(topic: string) {
    const s = { ...state };
    s.sr = { ...s.sr };
    const cur = s.sr[topic] || { level: 0, studyCount: 0 };
    const newCount = (cur.studyCount || 0) + 1;
    const level = Math.min((cur.level || 0) + 1, SR_INTERVALS.length - 1);
    const nextDate = addDays(SR_INTERVALS[level]);
    s.sr[topic] = { level, studyCount: newCount, nextDate };
    saveState(s);
  }

  async function loadNote(cat: string, icon: string, topic: string) {
    if (noteCache[topic]) {
      setNoteHtml(noteCache[topic]);
      return;
    }
    if (!checkLimit("notes")) {
      toast.error(`Ücretsiz planın ${FREE_LIMITS.notes} not hakkı bitti!`);
      setCurrentPage("pricing");
      return;
    }
    setNoteLoading(true);
    setNoteHtml(null);
    srMarkRead(topic);

    try {
      const cached = await fbGetNote(topic);
      if (cached?.html) {
        const full = buildNoteHtml(cat, topic, cached.html, cached.linkHtml || "");
        noteCache[topic] = full;
        setNoteHtml(full);
        setNoteLoading(false);
        return;
      }
    } catch (_) {}

    try {
      const [html, linkHtml] = await Promise.all([
        mistralText(buildNotePrompt(cat, topic), 24000, 0.35),
        mistralText(buildLinkPrompt(cat, topic), 5000, 0.4),
      ]);
      const cleanHtml = cleanContent(html);
      const cleanLink = `<h2>Klinik Bağlantı Notları</h2>${cleanContent(linkHtml)}`;
      const full = buildNoteHtml(cat, topic, cleanHtml, cleanLink);
      noteCache[topic] = full;
      setNoteHtml(full);

      if (!isPro()) {
        const ns = { ...state, noteCount: (state.noteCount || 0) + 1 };
        saveState(ns);
      }
      toast.success(`${topic} notu yüklendi`);
      fbSaveNote(topic, cleanHtml, cleanLink, []).catch(() => {});
    } catch (e) {
      toast.error("Not yüklenemedi: " + (e as Error).message);
      setNoteHtml(`<div style="color:var(--ac)">Yükleme hatası: ${(e as Error).message}</div>`);
    } finally {
      setNoteLoading(false);
    }
  }

  function buildNoteHtml(cat: string, topic: string, html: string, linkHtml: string) {
    const links = LINK_MAP[topic] || [];
    const linkBoxHtml = links.length
      ? `<div class="link-box"><div class="link-box-hdr">🔗 Bağlantı Haritası — İlgili Konular (${links.length})</div>${links
          .map(
            (lk) =>
              `<div class="link-item" data-topic="${lk.topic}"><div style="flex:1"><div style="display:flex;align-items:center;gap:7px;margin-bottom:3px"><span class="link-item-cat">${lk.cat}</span><strong style="font-size:.8rem;color:var(--text)">${lk.topic}</strong></div><div class="link-item-txt">${lk.note}</div></div><span style="color:var(--purple);font-size:.85rem;margin-left:6px">→</span></div>`
          )
          .join("")}</div>`
      : "";
    return `${html}<hr style="border-color:var(--line);margin:24px 0">${linkHtml}${linkBoxHtml}`;
  }

  function cleanContent(s: string) {
    return s
      .replace(/^```(?:html)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim()
      .replace(/\\n/g, "")
      .replace(/\\t/g, " ");
  }

  async function refreshNote(cat: string, icon: string, topic: string) {
    delete noteCache[topic];
    await fbDeleteNote(topic);
    await loadNote(cat, icon, topic);
  }

  function adjustStudyCount(delta: number) {
    if (!activeTopic) return;
    const topic = activeTopic.topic;
    const n = Math.max(1, Math.min(99, studyAdd));
    const s = { ...state };
    s.sr = { ...s.sr };
    if (!s.sr[topic]) s.sr[topic] = { level: 0, studyCount: 0 };
    const cur = s.sr[topic].studyCount || 0;
    s.sr[topic] = { ...s.sr[topic], studyCount: Math.max(0, cur + delta * n) };
    saveState(s);
    delete noteCache[topic];
    toast.success(`${n} çalışma ${delta > 0 ? "eklendi" : "çıkarıldı"} (toplam: ${s.sr[topic].studyCount})`);
  }

  const branch = selectedCat ? TREE.find((b) => b.cat === selectedCat) : null;
  const studyCount = activeTopic ? (state.sr?.[activeTopic.topic]?.studyCount || 0) : 0;

  return (
    <div style={{ display: "flex", gap: 18, minHeight: "70vh" }}>
      {/* Sidebar */}
      <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }} className="notes-sidebar">
        <div style={{ fontFamily: "Playfair Display, serif", fontSize: "1.15rem", fontWeight: 900, color: "var(--cream)", marginBottom: 6 }}>
          Konu Notları
        </div>

        {TREE.map((b) => (
          <div key={b.cat}>
            <button
              onClick={() => setSelectedCat(selectedCat === b.cat ? null : b.cat)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "7px 10px", borderRadius: 9, border: "none", cursor: "pointer",
                background: selectedCat === b.cat ? "rgba(232,83,74,.1)" : "transparent",
                color: selectedCat === b.cat ? "var(--ac)" : "var(--t2)",
                fontFamily: "Syne, sans-serif", fontSize: ".78rem", fontWeight: 700,
                transition: "all .12s", textAlign: "left",
              }}
            >
              <span>{b.icon}</span>
              <span style={{ flex: 1 }}>{b.cat}</span>
              <span style={{ fontSize: ".6rem", color: "var(--t3)" }}>{selectedCat === b.cat ? "▾" : "▸"}</span>
            </button>

            {selectedCat === b.cat && (
              <div style={{ paddingLeft: 12, display: "flex", flexDirection: "column", gap: 2, marginBottom: 4 }}>
                {b.topics.map((t) => {
                  const sc = state.sr?.[t]?.studyCount || 0;
                  const isActive = activeTopic?.topic === t;
                  return (
                    <button
                      key={t}
                      onClick={() => { setActiveTopic({ cat: b.cat, icon: b.icon, topic: t }); setSelectedCat(b.cat); }}
                      style={{
                        padding: "5px 9px", borderRadius: 7, border: "none", cursor: "pointer",
                        background: isActive ? "rgba(45,212,191,.1)" : "transparent",
                        color: isActive ? "var(--teal)" : "var(--t2)",
                        fontFamily: "Syne, sans-serif", fontSize: ".73rem", fontWeight: isActive ? 700 : 400,
                        textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between",
                        gap: 6, transition: "all .1s",
                      }}
                    >
                      <span style={{ flex: 1, lineHeight: 1.4 }}>{t}</span>
                      {sc > 0 && (
                        <span style={{ fontSize: ".58rem", background: "var(--td)", color: "var(--teal)", padding: "1px 5px", borderRadius: 8, fontWeight: 700, flexShrink: 0 }}>
                          {sc}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!activeTopic ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, color: "var(--t2)", textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: 14 }}>📚</div>
            <div style={{ fontFamily: "Playfair Display, serif", fontSize: "1.2rem", fontWeight: 700, color: "var(--cream)", marginBottom: 8 }}>Konu Seç</div>
            <div style={{ fontSize: ".82rem" }}>Sol menüden bir kategori ve konu seçerek detaylı TUS notuna ulaşabilirsin.</div>
          </div>
        ) : (
          <div>
            {/* Topic header */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontFamily: "Playfair Display, serif", fontSize: "1.4rem", fontWeight: 900, color: "var(--cream)", lineHeight: 1.2 }}>
                    {activeTopic.topic}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
                    <span className="tag tag-red">{activeTopic.cat}</span>
                    <span className="tag tag-teal">TUS Odaklı</span>
                    <span className="tag tag-purple">🔗 Bağlantı Haritası</span>
                    {noteLoading && <span className="tag tag-gold">Hazırlanıyor...</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  <button className="btn btn-ghost sm" onClick={() => refreshNote(activeTopic.cat, activeTopic.icon, activeTopic.topic)} disabled={noteLoading}>
                    ↺ Yenile
                  </button>
                  <button className="btn btn-teal sm" onClick={() => { setQuizTarget({ cat: activeTopic.cat, topic: activeTopic.topic }); setCurrentPage("quiz"); }}>
                    📋 Quiz
                  </button>
                  <button className="btn btn-gold sm" onClick={() => setCurrentPage("review")}>⏰ Tekrar</button>
                </div>
              </div>

              {/* Study bar */}
              <div className="study-bar" style={{ marginTop: 12 }}>
                <div className="study-bar-count">{studyCount}</div>
                <div className="study-bar-label">
                  <strong>Çalışma Sayısı</strong>
                  Bu konuyu toplam kaç kez çalıştın
                </div>
                <input className="study-add-inp" type="number" min={1} max={99} value={studyAdd} onChange={(e) => setStudyAdd(parseInt(e.target.value) || 1)} />
                <button className="btn btn-teal sm" onClick={() => adjustStudyCount(1)}>+ Ekle</button>
                <button className="btn btn-ghost sm" onClick={() => adjustStudyCount(-1)}>− Çıkar</button>
              </div>
            </div>

            {/* Note content */}
            {noteLoading ? (
              <div className="loading-screen">
                <div className="loading-orb">📚</div>
                <div className="loading-title">{activeTopic.topic}</div>
                <div style={{ color: "var(--t2)", fontSize: ".8rem", marginTop: 6 }}>
                  Detaylı TUS notu + bağlantı haritası hazırlanıyor<span className="loading-dots" />
                </div>
              </div>
            ) : noteHtml ? (
              <div className="card">
                <div ref={noteRef} className="nb" dangerouslySetInnerHTML={{ __html: noteHtml }} />
              </div>
            ) : null}
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .notes-sidebar { width: 100% !important; max-width: 100%; }
          [style*="display: flex; gap: 18px"] { flex-direction: column; }
        }
      `}</style>
    </div>
  );
}

function buildNotePrompt(cat: string, topic: string): string {
  return `Sen kıdemli bir dahiliye akademisyenisin ve TUS sınavı uzmanısın. Aşağıdaki konu için TUS'ta çıkabilecek HİÇBİR BİLGİYİ ATLAMAMAK şartıyla tam ve kapsamlı bir konu notu hazırla.

KONU: ${cat} — ${topic}

KESİN KURAL — ATLANAMAZ BİLGİLER:
• Tam ilaç dozları (mg, yol, sıklık)
• Spesifik tanı kriterleri (sayısal eşiklerle — Child-Pugh, MELD, Wells, CURB-65 vb.)
• Sayısal eşik değerleri (INR >1.5 gibi — sayıyı yaz)
• Biyopsi/patoloji bulguları
• TUS'ta sık çıkan klasik vaka tanımları ve tetikleyici faktörler
• Tüm skorlama sistemleri (parametreler + kesim değerleri)

ÇIKTI KURALLARI:
- SADECE HTML döndür. <html>/<head>/<body> etiketi YAZMA.
- Markdown kullanma. Her ilaç için: ETKİN MADDE + doz + yol + sıklık.
- <h2>Ana Başlık</h2> | <h3>Alt Başlık</h3> | <p>paragraf</p>
- <ul><li>madde</li></ul> | <table> tablolar için
- <div class="tip"><strong>TUS SPOT:</strong> ...</div>
- <div class="warn"><strong>DİKKAT:</strong> ...</div>
- <div class="algo"><strong>ALGORİTMA:</strong> Adım 1 → Adım 2 → Adım 3 (tanı/tedavi akış diyagramı)</div>
- <div class="flowchart"><strong>KARAR AĞACI:</strong><br/>⬤ Başlangıç koşulu<br/>├─ [EVET] → sonuç<br/>└─ [HAYIR] → alternatif</div>
- <div class="mnem"><strong>🧠 MNEM:</strong> ...</div>
- <div class="score-box"><div class="score-title">SKOR</div>...</div>

GÖRSEL DİYAGRAM KURALI (ZORUNLU — EN ÖNEMLİ KURAL):
Her konuda 2–3 adet RENKLI HTML diyagramı üret. Dış görsel KULLANMA — saf HTML/CSS. Oklar <div class="ed-arrow"></div> şeklinde yazılır (içi BOŞ bırakılır).

TİP 1 — Patofizyoloji Akış Şeması:
<div class="edu-diagram">
  <div class="ed-title">PAT0FİZYOLOJİ</div>
  <div class="ed-flow">
    <div class="ed-node ed-red">Primer Etken</div>
    <div class="ed-arrow"></div>
    <div class="ed-row">
      <div class="ed-node ed-orange">Mekanizma A</div>
      <div class="ed-node ed-orange">Mekanizma B</div>
    </div>
    <div class="ed-arrow"></div>
    <div class="ed-node ed-gold">Patolojik Sonuç</div>
    <div class="ed-arrow"></div>
    <div class="ed-row">
      <div class="ed-node ed-blue">Semptom 1</div>
      <div class="ed-node ed-blue">Semptom 2</div>
      <div class="ed-node ed-purple">Komplikasyon</div>
    </div>
  </div>
</div>

TİP 2 — Sınıflama / Karşılaştırma:
<div class="edu-diagram">
  <div class="ed-title">SINIFLANDIRMA</div>
  <div class="ed-flow">
    <div class="ed-node ed-gray">Ana Başlık</div>
    <div class="ed-arrow"></div>
    <div class="ed-row">
      <div class="ed-node ed-red">Tip 1<br/><small style="font-weight:400;opacity:.85">özellik</small></div>
      <div class="ed-node ed-teal">Tip 2<br/><small style="font-weight:400;opacity:.85">özellik</small></div>
      <div class="ed-node ed-blue">Tip 3<br/><small style="font-weight:400;opacity:.85">özellik</small></div>
    </div>
  </div>
</div>

TİP 3 — Tedavi Algoritması (Basamaklı):
<div class="edu-diagram">
  <div class="ed-title">TEDAVİ ALGORİTMASI</div>
  <div class="ed-flow">
    <div class="ed-node ed-gold">1. Basamak: İlk İlaç / Yaklaşım</div>
    <div class="ed-arrow"></div>
    <div class="ed-node ed-orange">Yetersiz Yanıt / Kontrendikasyon</div>
    <div class="ed-arrow"></div>
    <div class="ed-node ed-teal">2. Basamak: Alternatif / Ek İlaç</div>
    <div class="ed-arrow"></div>
    <div class="ed-row">
      <div class="ed-node ed-blue">3a: Kombinasyon</div>
      <div class="ed-node ed-purple">3b: Özel Durum / Acil</div>
    </div>
  </div>
</div>

RENK KODLARI: ed-red=kritik/etken | ed-orange=mekanizma/uyarı | ed-gold=bulgu/tanı | ed-teal=tedavi/çözüm | ed-blue=klinik belirti | ed-purple=komplikasyon/acil | ed-green=iyi prognoz | ed-gray=nötr/genel
KURALLAR: ed-arrow MUTLAKA BOŞ (<div class="ed-arrow"></div>), Türkçe etiketler, gerçek ilaç/hastalık adları, 5–10 kutucuk/diyagram
DİYAGRAMLARI: Patofizyoloji h2'sinden → hemen sonra | Sınıflama h2'sinden → hemen sonra | Tedavi h2'sinden → hemen sonra

ZORUNLU BÖLÜMLER:
<h2>1. Tanım, Epidemiyoloji ve Etiyoloji</h2>
<h2>2. Patofizyoloji</h2>
<h2>3. Sınıflama ve Evreleme</h2>
<h2>4. Klinik Bulgular</h2>
<h2>5. Seroloji / Belirteçler (varsa)</h2>
<h2>6. Tanı Kriterleri ve Algoritma</h2>
<h2>7. Laboratuvar ve Görüntüleme</h2>
<h2>8. Skorlama Sistemleri</h2>
<h2>9. Tedavi</h2>
<h2>10. Komplikasyonlar ve Prognoz</h2>
<h2>11. Ayırıcı Tanı</h2>
<h2>12. TUS SPOTLARI ve MNEMONİKLER</h2>
<h2>13. KLİNİK BAĞLANTI NOTLARI</h2>

Şimdi başla:`;
}

function buildLinkPrompt(cat: string, topic: string): string {
  return `Dahiliye uzmanı olarak şu konu için KLİNİK BAĞLANTI NOTLARI hazırla.
KONU: ${cat} — ${topic}

GÖREV: Bu konuyla AYNI belirti/bulgu/mekanizmayı PAYLAŞAN diğer dahiliye hastalıklarını listele.

SADECE HTML döndür:
<div class="tip"><strong>🔗 [PAYLAŞILAN BULGU]: </strong><ul><li><strong>Hastalık:</strong> neden aynı bulguda düşünülmeli + ayırt eden özellik</li></ul></div>

En az 4, en fazla 6 farklı paylaşımlı bulgu ver. Sadece HTML yaz:`;
}
