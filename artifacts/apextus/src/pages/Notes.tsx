import { useState, useEffect, useRef } from "react";
import { useApp } from "@/contexts/AppContext";
import { TREE, LINK_MAP, SR_INTERVALS } from "@/lib/data";
import { mistralCompleteText, mistralText } from "@/lib/mistral";
import { fbGetNote, fbSaveNote, fbDeleteNote } from "@/lib/firestore";
import { fetchMedicalImage, getTopicDiagramQuery } from "@/lib/imageGen";
import { getSourceGuide } from "@/lib/sourceGuides";
import { getMandatoryNoteAnchors, getNoteCoverageContract, NoteGenerationPart } from "@/lib/noteCoverage";
import { toDay, addDays } from "@/lib/utils";
import { toast } from "sonner";
import { Maximize2, X } from "lucide-react";

const noteCache: Record<string, string> = {};
const notePartCache: Record<string, string[]> = {};
const NOTE_SCHEMA_VERSION = 4;
const NOTE_PART_COUNT = 10;

function partialNoteKey(topic: string) {
  return `apextus-note-parts-v4:${topic}`;
}

function loadPartialNoteParts(topic: string) {
  if (notePartCache[topic]) return notePartCache[topic];
  try {
    const parsed = JSON.parse(sessionStorage.getItem(partialNoteKey(topic)) || "[]");
    notePartCache[topic] = Array.isArray(parsed) ? parsed.filter((part) => typeof part === "string") : [];
  } catch (_) {
    notePartCache[topic] = [];
  }
  return notePartCache[topic];
}

function savePartialNoteParts(topic: string, parts: string[]) {
  notePartCache[topic] = parts;
  try { sessionStorage.setItem(partialNoteKey(topic), JSON.stringify(parts)); } catch (_) {}
}

function clearPartialNoteParts(topic: string) {
  delete notePartCache[topic];
  try { sessionStorage.removeItem(partialNoteKey(topic)); } catch (_) {}
}

interface PreparedNote {
  html: string;
  isComplete: boolean;
  removedDiagrams: number;
}

function repairBrokenPartBoundaries(rawHtml: string) {
  return rawHtml
    .replace(
      /<!--\s*<h([2-4])-->\s*([^<\r\n]+)/gi,
      (_, level: string, title: string) =>
        `</li></ul></td></tr></tbody></table><h${level}>${title.trim()}</h${level}>`,
    )
    .replace(
      /<li\s+<h2\s*=\s*["'][^"']*["']\s*>\s*([^<\r\n]+)/gi,
      (_, title: string) =>
        `</li></ul></td></tr></tbody></table><h2>${title.trim()}</h2>`,
    );
}

function prepareNoteContent(rawHtml: string): PreparedNote {
  const stripped = repairBrokenPartBoundaries(rawHtml)
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim()
    .replace(/\\n/g, "")
    .replace(/\\t/g, " ");
  // Every major section is parsed independently. A response that stops in the
  // middle of a table/list can therefore never pull the next h2 into a narrow cell.
  const boundarySafeHtml = stripped
    .split(/(?=<h2(?:\s|>))/i)
    .filter(Boolean)
    .map((section) => new DOMParser().parseFromString(section, "text/html").body.innerHTML)
    .join("\n");
  const countTag = (tag: string, closing = false) =>
    (boundarySafeHtml.match(new RegExp(`<${closing ? "/" : ""}${tag}(?:\\s[^>]*)?>`, "gi")) || []).length;
  const hasUnclosedStructure = ["div", "table", "tbody", "tr", "ul", "ol"]
    .some((tag) => countTag(tag) > countTag(tag, true));

  const doc = new DOMParser().parseFromString(boundarySafeHtml, "text/html");
  doc.querySelectorAll("script, style, iframe, object, embed").forEach((node) => node.remove());
  let removedDiagrams = 0;
  doc.querySelectorAll<HTMLElement>(".edu-diagram").forEach((diagram) => {
    diagram.querySelectorAll<HTMLElement>("*").forEach((node) => {
      node.removeAttribute("style");
      Array.from(node.attributes).forEach((attribute) => {
        if (attribute.name.toLowerCase().startsWith("on")) node.removeAttribute(attribute.name);
      });
    });
    const title = diagram.querySelector(".ed-title")?.textContent?.trim() || "";
    const nodes = Array.from(diagram.querySelectorAll<HTMLElement>(".ed-node"));
    const hasBrokenNode = nodes.some((node) => {
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      return text.length < 5 || /^\d+[.):]?$/.test(text) || /\[[^\]]+\]/.test(text);
    });
    if (title.length < 5 || nodes.length < 2 || hasBrokenNode) {
      diagram.remove();
      removedDiagrams += 1;
    }
  });

  const headingTexts = Array.from(doc.querySelectorAll("h2"))
    .map((heading) => (heading.textContent || "").replace(/\s+/g, " ").trim());
  const headings = headingTexts.length;
  const hasClosingSections = headingTexts.some((heading) => /^11[.)\s]/.test(heading) || /Ayırıcı Tanı/i.test(heading))
    && headingTexts.some((heading) => /^12[.)\s]/.test(heading) || /TUS SPOTLARI/i.test(heading));
  const textLength = (doc.body.textContent || "").replace(/\s+/g, " ").trim().length;
  return {
    html: doc.body.innerHTML.trim(),
    isComplete: headings >= 10 && hasClosingSections && textLength >= 9000,
    removedDiagrams,
  };
}

function prepareNoteForReading(rawHtml: string) {
  const doc = new DOMParser().parseFromString(rawHtml, "text/html");
  const tables = Array.from(doc.querySelectorAll("table")).reverse();
  tables.forEach((table) => {
    table.removeAttribute("width");
    table.querySelectorAll("th, td").forEach((cell) => cell.removeAttribute("width"));

    const rows = Array.from(table.rows);
    const columnCount = Math.max(0, ...rows.map((row) => row.cells.length));
    if (columnCount > 2) {
      const headerRow = rows.find((row) => Array.from(row.cells).some((cell) => cell.tagName === "TH"));
      const headers = headerRow
        ? Array.from(headerRow.cells).map((cell, index) =>
            cell.textContent?.replace(/\s+/g, " ").trim() || `Bilgi ${index + 1}`)
        : Array.from({ length: columnCount }, (_, index) => `Bilgi ${index + 1}`);
      const grid = doc.createElement("div");
      grid.className = "note-data-grid";
      rows.filter((row) => row !== headerRow).forEach((row) => {
        const cells = Array.from(row.cells);
        if (!cells.some((cell) => cell.textContent?.trim())) return;
        const card = doc.createElement("section");
        card.className = "note-data-card";
        cells.forEach((cell, index) => {
          if (!cell.textContent?.trim()) return;
          const field = doc.createElement("div");
          field.className = "note-data-field";
          const label = doc.createElement("strong");
          label.className = "note-data-label";
          label.textContent = headers[index] || `Bilgi ${index + 1}`;
          const value = doc.createElement("div");
          value.className = "note-data-value";
          value.innerHTML = cell.innerHTML;
          field.append(label, value);
          card.appendChild(field);
        });
        grid.appendChild(card);
      });
      if (grid.childElementCount) table.replaceWith(grid);
      return;
    }
    table.classList.add("note-table-compact");
  });
  return doc.body.innerHTML;
}

function findMissingCoverageAnchors(html: string, anchors: string[]) {
  const normalize = (value: string) => value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const haystack = normalize(new DOMParser().parseFromString(html, "text/html").body.textContent || "");
  return anchors.filter((anchor) => {
    const key = normalize(anchor.split(/[:(]/)[0]);
    return key.length > 3 && !haystack.includes(key);
  });
}

function shouldAlwaysShowReferenceImages(cat: string) {
  return [
    "Anatomi",
    "Histoloji ve Embriyoloji",
    "Fizyoloji",
    "Patoloji",
    "Mikrobiyoloji",
    "Küçük Stajlar",
  ].includes(cat);
}

export default function Notes() {
  const { state, saveState, noteTarget, setNoteTarget, setCurrentPage, setQuizTarget } = useApp();
  const [selectedCat, setSelectedCat] = useState<string | null>(noteTarget?.cat ?? null);
  const [activeTopic, setActiveTopic] = useState<{ cat: string; icon: string; topic: string } | null>(noteTarget ?? null);
  const [noteHtml, setNoteHtml] = useState<string | null>(null);
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteStage, setNoteStage] = useState("Kapsam hazırlanıyor");
  const [studyAdd, setStudyAdd] = useState(1);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const noteRef = useRef<HTMLDivElement>(null);
  const activeTopicRef = useRef<{ cat: string; icon: string; topic: string } | null>(null);

  useEffect(() => { activeTopicRef.current = activeTopic; }, [activeTopic]);

  useEffect(() => {
    if (!isFullScreen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFullScreen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isFullScreen]);

  // Inject supplementary Wikipedia images. Anatomy-like subjects still need real reference visuals.
  useEffect(() => {
    if (!noteRef.current || !noteHtml || !activeTopic) return;
    const root = noteRef.current;

    const hasHtmlDiagrams = root.querySelectorAll(".edu-diagram").length > 0;
    const needsReferenceImages = shouldAlwaysShowReferenceImages(activeTopic.cat);
    if (hasHtmlDiagrams && !needsReferenceImages) return;

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

    let cancelled = false;
    const usedImageUrls = new Set<string>();
    const imageSlots = placeholders.slice(0, 2);
    placeholders.slice(2).forEach((el) => { el.style.display = "none"; });

    void (async () => {
      for (const el of imageSlots) {
        const query = el.getAttribute("data-q");
        if (!query) { el.style.display = "none"; continue; }
        el.innerHTML = `<div class="nb-img-skeleton"><span class="spin2"></span>&nbsp;Görsel yükleniyor...</div>`;
        try {
          const img = await fetchMedicalImage(query, capTopic, capCat, [...usedImageUrls]);
          if (cancelled || !noteRef.current?.contains(el)) return;
          if (img && !usedImageUrls.has(img.url)) {
            usedImageUrls.add(img.url);
            el.innerHTML = `<figure class="inline-note-img">
              <img src="${img.url}" alt="${img.caption}" loading="eager" />
              <figcaption>${img.caption}<span class="img-src"> — ${img.attribution}</span></figcaption>
            </figure>`;
          } else {
            el.style.display = "none";
          }
        } catch (_) {
          el.style.display = "none";
        }
      }
    })();

    return () => { cancelled = true; };
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
    setNoteLoading(true);
    setNoteStage("Kapsam hazırlanıyor");
    setNoteHtml(null);
    srMarkRead(topic);

    try {
      const cached = await fbGetNote(topic);
      if (cached?.html && (cached.schemaVersion || 0) >= NOTE_SCHEMA_VERSION) {
        const prepared = prepareNoteContent(cached.html);
        const cachedTextLength = new DOMParser()
          .parseFromString(prepared.html, "text/html")
          .body.textContent?.replace(/\s+/g, " ").trim().length || 0;
        if (cachedTextLength >= 2500) {
          const full = buildNoteHtml(cat, topic, curateMnemonics(prepared.html), cached.linkHtml || "");
          noteCache[topic] = full;
          setNoteHtml(full);
          setNoteLoading(false);
          return;
        }
        await fbDeleteNote(topic);
      }
    } catch (_) {}

    try {
      const stageLabels = [
        "Tanım, epidemiyoloji ve etiyoloji yazılıyor",
        "Patofizyoloji ve mekanizma yazılıyor",
        "Sınıflama ve bütün alt tipler yazılıyor",
        "Klinik bulgular ve vaka örüntüleri yazılıyor",
        "Belirteçler ve tanı algoritması yazılıyor",
        "Laboratuvar, görüntüleme ve skorlar yazılıyor",
        "Tedavi, direnç ve izlem yazılıyor",
        "Komplikasyonlar ve prognoz yazılıyor",
        "Ayırıcı tanı karşılaştırmaları yazılıyor",
        "TUS spotları ve aktif hatırlama yazılıyor",
      ];
      const completedParts = loadPartialNoteParts(topic);
      for (let index = completedParts.length; index < NOTE_PART_COUNT; index += 1) {
        const part = (index + 1) as NoteGenerationPart;
        setNoteStage(`${stageLabels[index]} (${part}/${NOTE_PART_COUNT})`);
        const generatedPart = await mistralCompleteText(buildNotePrompt(cat, topic, part), 2200, 0.18);
        completedParts.push(prepareNoteContent(cleanContent(generatedPart)).html);
        savePartialNoteParts(topic, completedParts);
      }
      let html = completedParts.join("\n");
      const missingAnchors = findMissingCoverageAnchors(html, getMandatoryNoteAnchors(cat, topic));
      if (missingAnchors.length) {
        const batches = Array.from({ length: Math.ceil(missingAnchors.length / 5) }, (_, index) =>
          missingAnchors.slice(index * 5, index * 5 + 5));
        for (let index = 0; index < batches.length; index += 1) {
          setNoteStage(`Eksik alt başlıklar tamamlanıyor (${index + 1}/${batches.length})`);
          const supplement = await mistralCompleteText(buildCoverageSupplementPrompt(cat, topic, batches[index]), 2200, 0.16);
          html += `\n${cleanContent(supplement)}`;
        }
      }
      const prepared = prepareNoteContent(html);
      const usableTextLength = new DOMParser()
        .parseFromString(prepared.html, "text/html")
        .body.textContent?.replace(/\s+/g, " ").trim().length || 0;
      if (completedParts.length < NOTE_PART_COUNT || usableTextLength < 2500) {
        throw new Error("Konu notunun kullanılabilir içeriği oluşmadı; yeniden dene.");
      }
      const cleanHtml = curateMnemonics(prepared.html);
      let cleanLink = "";
      try {
        setNoteStage("Klinik bağlantılar tamamlanıyor");
        const linkHtml = await mistralText(buildLinkPrompt(cat, topic), 3000, 0.4);
        cleanLink = `<h2>Klinik Bağlantı Notları</h2>${cleanContent(linkHtml)}`;
      } catch (_) {
        // The core note is valuable on its own. A supplemental section must
        // never make an otherwise successful note generation fail.
        toast.info("Ana konu notu hazırlandı; klinik bağlantılar daha sonra eklenebilir.");
      }
      setNoteStage("Not Firebase'e kaydediliyor");
      const savedRemotely = await fbSaveNote(topic, cleanHtml, cleanLink, [], NOTE_SCHEMA_VERSION);
      const full = buildNoteHtml(cat, topic, cleanHtml, cleanLink);
      noteCache[topic] = full;
      clearPartialNoteParts(topic);
      setNoteHtml(full);
      toast.success(savedRemotely ? `${topic} notu Firebase'e kaydedildi` : `${topic} notu bu cihazda kalıcı olarak kaydedildi`);
    } catch (e) {
      const savedParts = notePartCache[topic]?.length || 0;
      const resumeMessage = savedParts
        ? ` ${savedParts}/${NOTE_PART_COUNT} bölüm korundu; Yenile ile kaldığı yerden devam edebilirsin.`
        : "";
      toast.error("Not yüklenemedi: " + (e as Error).message + resumeMessage);
      setNoteHtml(`<div class="warn"><strong>Hazırlama geçici olarak durdu.</strong> ${(e as Error).message}${resumeMessage}</div>`);
    } finally {
      setNoteLoading(false);
      setNoteStage("Kapsam hazırlanıyor");
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

  function curateMnemonics(html: string) {
    const doc = new DOMParser().parseFromString(html, "text/html");

    doc.querySelectorAll("h2, h3").forEach((heading) => {
      heading.textContent = (heading.textContent || "")
        .replace(/\s*(ve|&)\s*mnemonik(ler)?/gi, " ve Kalıcı İpuçları")
        .replace(/mnemonik(ler)?/gi, "Kalıcı İpuçları");
    });

    doc.querySelectorAll<HTMLElement>(".mnem").forEach((block) => {
      const phrase = block.querySelector<HTMLElement>(".mnem-phrase")?.textContent?.trim() || "";
      const mappings = Array.from(block.querySelectorAll<HTMLElement>(".mnem-map li"));
      const hasReadablePhrase = phrase.length >= 4 && phrase.length <= 120 && /[a-zçğıöşü]/i.test(phrase);
      const hasExplicitMapping = mappings.length >= 3 && mappings.length <= 8
        && mappings.every((item) => /[–—:-]/.test(item.textContent || ""));

      // Legacy notes used unstructured, forced mnemonics. Only the new auditable
      // format survives so a catchy phrase can never hide an incorrect mapping.
      if (!hasReadablePhrase || !hasExplicitMapping) block.remove();
    });

    return doc.body.innerHTML.trim();
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
        <div style={{ fontFamily: "Playfair Display, serif", fontSize: "1.15rem", fontWeight: 900, color: "var(--cream)", marginBottom: 8 }}>
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
                  {noteHtml && !noteLoading && (
                    <button className="btn btn-ghost sm" onClick={() => setIsFullScreen(true)} title="Notu tam ekranda oku">
                      <Maximize2 size={14} /> Tam ekran
                    </button>
                  )}
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
                <div style={{ color: "var(--teal)", fontSize: ".78rem", marginTop: 6, fontWeight: 600 }}>
                  {noteStage}<span className="loading-dots" />
                </div>
                <div style={{ color: "var(--t2)", fontSize: ".72rem", marginTop: 4 }}>
                  10 kısa aşamada ayrıntılı TUS fasikülü hazırlanıyor; sayfa yenilense de tamamlanan bölümler korunur
                </div>
              </div>
            ) : noteHtml ? (
              <div className="card">
                <div ref={noteRef} className="nb" dangerouslySetInnerHTML={{ __html: prepareNoteForReading(noteHtml) }} />
              </div>
            ) : null}
          </div>
        )}
      </div>

      {isFullScreen && noteHtml && activeTopic && (
        <div className="topic-note-reader" role="dialog" aria-modal="true" aria-label={`${activeTopic.topic} konu notu`}>
          <header className="topic-note-reader-header">
            <div>
              <span>{activeTopic.cat}</span>
              <strong>{activeTopic.topic}</strong>
            </div>
            <button className="reader-close" onClick={() => setIsFullScreen(false)} title="Tam ekranı kapat" aria-label="Tam ekranı kapat">
              <X size={20} />
            </button>
          </header>
          <main className="topic-note-reader-scroll">
            <article className="topic-note-reader-content nb" dangerouslySetInnerHTML={{ __html: prepareNoteForReading(noteHtml) }} />
          </main>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .notes-sidebar { width: 100% !important; max-width: 100%; }
          [style*="display: flex; gap: 18px"] { flex-direction: column; }
        }
      `}</style>
    </div>
  );
}

const PROFESSIONAL_NOTE_STANDARD = `PROFESYONEL NOT STANDARDI:
- ERISILEBILIRLIK KURALI: Metin ile arka plan arasinda her zaman cok yuksek kontrast kullan. Acik zeminde koyu metin, koyu zeminde saf beyaz metin kullan. Birbirine yakin tonlari ASLA birlikte kullanma.
- HTML icinde style="color:..." veya style="background:..." yazma. Renk icin yalnizca uygulamanin hazir siniflarini kullan; yeni renk, opak metin veya soluk yazi uretme.
- Normal paragraflar, listeler, tablolar ve basliklar acik zemin uzerinde koyu metinle okunacak sekilde yazilsin. Bilgi kutularinda metin rengi mutlaka koyu olsun.
- Diyagram zemini daima acik olsun. Diyagramda siyah veya koyu genel arka plan kullanma. Oklar ve baglanti cizgileri koyu ve belirgin olsun; beyaz/acik renkli ok kullanma.
- Koyu renkli diyagram kutularinda yazi saf beyaz, sari ve acik gri kutularda yazi cok koyu olsun.
- Bu not, TUS'a hazirlanan bir hekim adayinin ana kaynak gibi kullanabilecegi derinlikte olsun.
- Konuyu once temel mekanizma, sonra klinik yansima, sonra TUS'ta sorulma bicimi seklinde anlat.
- Her baslikta "Neden onemli?", "TUS nasil sorar?", "Karistirilan nokta" mantigi bulunsun.
- Temel bilim konularinda: embriyolojik koken, histolojik ozellik, biyokimyasal yolak, reseptor/enzim, farmakolojik hedef ve patoloji baglantisini kur.
- Klinik bilim konularinda: tani algoritmasi, ayirici tani, ilk islem, en iyi test, kesin tani, tedavi basamaklari, kontrendikasyon ve komplikasyonlari belirt.
- Her notta en az 8 TUS spotu, 1 klinik vaka ornegi, 1 ayirici tani tablosu, 1 tani/tedavi algoritmasi ve 1 yanlis tuzagi bolumu olsun.
- Karar agaclari metin cizimi degil, ogrencinin takip edebilecegi iki kollu secim diyagrami gibi tasarlansin.
- Sayisal esikler, skorlar, dozlar, laboratuvar referanslari ve klasik bulgular atlanmasin.
- Gereksiz genel kultur anlatimi yapma; sinavda puan getirecek bilgiye yogunlas.`;
function buildNotePrompt(cat: string, topic: string, part: NoteGenerationPart): string {
  const sectionsByPart: Record<NoteGenerationPart, string> = {
    1: `<h2>1. Tanım, Epidemiyoloji ve Etiyoloji</h2>`,
    2: `<h2>2. Patofizyoloji</h2>`,
    3: `<h2>3. Sınıflama ve Evreleme</h2>`,
    4: `<h2>4. Klinik Bulgular</h2>`,
    5: `<h2>5. Seroloji / Belirteçler</h2><h2>6. Tanı Kriterleri ve Algoritma</h2>`,
    6: `<h2>7. Laboratuvar ve Görüntüleme</h2><h2>8. Skorlama Sistemleri</h2>`,
    7: `<h2>9. Tedavi</h2>`,
    8: `<h2>10. Komplikasyonlar ve Prognoz</h2>`,
    9: `<h2>11. Ayırıcı Tanı</h2>`,
    10: `<h2>12. TUS SPOTLARI ve KALICI İPUÇLARI</h2><h2>13. Aktif Hatırlama ve Klinik Bağlantı Özeti</h2>`,
  };
  const requiredSections = sectionsByPart[part];
  return `Sen kıdemli bir TUS akademisyeni ve ders notu editörüsün. Aşağıdaki konu için TUS'ta çıkabilecek HİÇBİR BİLGİYİ ATLAMAMAK şartıyla tam, profesyonel ve kapsamlı bir konu notu hazırla.

KONU: ${cat} — ${topic}
BU 10 AŞAMALI NOTUN ${part}. BÖLÜMÜDÜR. Yalnızca aşağıda istenen bölüm başlıklarını üret; diğer bölümlerin başlıklarını tekrar etme.
${[2, 5, 7].includes(part) ? "Bu bölümde gerçekten öğreticiyse en fazla 1 diyagram kullan." : "Bu bölümde diyagram üretme."} Ayrıntıyı okunabilir paragraf, liste ve karşılaştırma tablolarıyla ver.

${PROFESSIONAL_NOTE_STANDARD}

${getSourceGuide(cat, topic)}

${getNoteCoverageContract(cat, topic, part)}

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
- Karar agaci icin <pre>, <code>, ASCII cizim, dal karakterleri veya tek parca metin agaci kullanma. Bunun yerine asagidaki TANI / KARAR ALGORITMASI edu-diagram sablonunu kullan.
- MNEMONİK ZORUNLU DEĞİLDİR. Konu doğal ve güvenilir bir hatırlatma tekniğine uygun değilse hiç mnemonic yazma.
- Yalnızca yerleşik bir tıbbi mnemonic veya terimlerle birebir eşleşen, doğal Türkçe bir ifade kullan. Sırf baş harfler uysun diye anlamsız, absürt ya da zorlama cümle kurma.
- Mnemonic en fazla 3 tane olsun ve her biri 3-8 bilgi içersin. Baş harf, sıra ve tıbbi bilgi eşleşmesini yazmadan önce tek tek doğrula.
- Kabul edilen tek HTML biçimi: <div class="mnem verified-mnem"><strong>Akılda tut:</strong><p class="mnem-phrase">Doğal ve anlamlı ifade</p><ul class="mnem-map"><li><strong>Harf/kelime</strong> — Karşılık gelen tıbbi bilgi</li></ul></div>
- Her mnemonicten sonra neden işe yaradığını tek cümlede açıkla. Açık eşleştirme listesini kuramıyorsan mnemonic ekleme; bilgiyi normal TUS spotu olarak yaz.
- <div class="score-box"><div class="score-title">SKOR</div>...</div>

GÖRSEL DİYAGRAM KURALI:
En fazla 2 adet sade ve öğretici HTML diyagramı üret. Yalnızca algoritma veya karşılaştırma metinden daha anlaşılır olacaksa diyagram kullan; sırf renkli görünmesi için diyagram ekleme. Karar ağacı gerekiyorsa ed-split + ed-split-branch yapısıyla iki kola ayrılsın.

CSS SINIFLARI:
• ed-node ed-[renk] — kutucuk (içine ed-sub ekleyerek alt bilgi ekle)
• ed-sub — kutucuk içinde küçük alt bilgi (doz, yüzde, örnek)
• ed-wide — tam genişlik kutucuk
• ed-row — yan yana kutucuklar (paralel yollar)
• ed-arrow — dikey aşağı ok (BOŞ)  |  ed-arrow-h — yatay sağ ok (BOŞ)
• ed-lbl — ok üstündeki geçiş etiketi (neden/koşul) (BOŞ değil — içine metin yaz)
• ed-split + ed-split-branch — karar noktasından iki kola ayrılma
• ed-compare + ed-compare-col — 2-4 tipi eşit genişlikli sütunlarda karşılaştır. ed-vs kullanma; sütunların arasına VS yazısı veya ok koyma.

TİP 1 — Patofizyoloji Akışı (etiketli oklar + alt bilgi):
<div class="edu-diagram">
  <div class="ed-title">PAT0FİZYOLOJİ — [KONU ADI]</div>
  <div class="ed-flow">
    <div class="ed-node ed-red ed-wide">Tetikleyici Etken<div class="ed-sub">örn: %80 HBV, otoimmün, genetik</div></div>
    <div class="ed-arrow"></div>
    <div class="ed-lbl">aktive eder / yol açar</div>
    <div class="ed-arrow"></div>
    <div class="ed-row">
      <div class="ed-node ed-orange">Mekanizma 1<div class="ed-sub">spesifik yol</div></div>
      <div class="ed-node ed-orange">Mekanizma 2<div class="ed-sub">spesifik yol</div></div>
    </div>
    <div class="ed-arrow"></div>
    <div class="ed-node ed-gold ed-wide">Patolojik Sonuç<div class="ed-sub">sayısal eşik / biyobelirteç</div></div>
    <div class="ed-arrow"></div>
    <div class="ed-lbl">klinik yansıması</div>
    <div class="ed-arrow"></div>
    <div class="ed-row">
      <div class="ed-node ed-blue">Semptom 1<div class="ed-sub">açıklama</div></div>
      <div class="ed-node ed-blue">Semptom 2<div class="ed-sub">açıklama</div></div>
      <div class="ed-node ed-purple">Komplikasyon<div class="ed-sub">%oran / prognoz</div></div>
    </div>
  </div>
</div>

TİP 2 — Karar Ağacı / Tanı Algoritması (dallanma):
<div class="edu-diagram">
  <div class="ed-title">TANI / KARAR ALGORİTMASI</div>
  <div class="ed-flow">
    <div class="ed-node ed-gray ed-wide">Başlangıç: Klinik şüphe / başvuru</div>
    <div class="ed-arrow"></div>
    <div class="ed-node ed-gold ed-wide">Anahtar Test / Kriter<div class="ed-sub">eşik değeri belirt</div></div>
    <div class="ed-arrow"></div>
    <div class="ed-split">
      <div class="ed-split-branch">
        <div class="ed-lbl">EVET / Pozitif</div>
        <div class="ed-arrow"></div>
        <div class="ed-node ed-red">Doğrulanan Tanı<div class="ed-sub">ek doğrulayıcı test</div></div>
        <div class="ed-arrow"></div>
        <div class="ed-node ed-teal">Tedavi Başla<div class="ed-sub">1. basamak ilaç + doz</div></div>
      </div>
      <div class="ed-split-branch">
        <div class="ed-lbl">HAYIR / Negatif</div>
        <div class="ed-arrow"></div>
        <div class="ed-node ed-blue">Ayırıcı Tanı<div class="ed-sub">alternatifler</div></div>
        <div class="ed-arrow"></div>
        <div class="ed-node ed-gray">İleri Tetkik<div class="ed-sub">hangi test?</div></div>
      </div>
    </div>
  </div>
</div>

TİP 3 — Karşılaştırma (iki tip/form yan yana):
<div class="edu-diagram">
  <div class="ed-title">TİP A vs TİP B KARŞILAŞTIRMA</div>
  <div class="ed-flow">
    <div class="ed-compare">
      <div class="ed-compare-col">
        <div class="ed-node ed-red">Tip A / Form 1<div class="ed-sub">sıklık, yaş</div></div>
        <div class="ed-node ed-orange">Mekanizma<div class="ed-sub">patofizyo</div></div>
        <div class="ed-node ed-blue">Klinik Bulgular<div class="ed-sub">ayırt edici özellik</div></div>
        <div class="ed-node ed-teal">Tedavi<div class="ed-sub">ilaç + doz</div></div>
        <div class="ed-node ed-purple">Prognoz<div class="ed-sub">%mortalite</div></div>
      </div>
      <div class="ed-compare-col">
        <div class="ed-node ed-blue">Tip B / Form 2<div class="ed-sub">sıklık, yaş</div></div>
        <div class="ed-node ed-orange">Mekanizma<div class="ed-sub">patofizyo</div></div>
        <div class="ed-node ed-blue">Klinik Bulgular<div class="ed-sub">ayırt edici özellik</div></div>
        <div class="ed-node ed-teal">Tedavi<div class="ed-sub">ilaç + doz</div></div>
        <div class="ed-node ed-green">Prognoz<div class="ed-sub">%mortalite</div></div>
      </div>
    </div>
  </div>
</div>

KARŞILAŞTIRMA KURALLARI:
• Her hastalık/tip yalnızca bir ed-compare-col içinde yer alsın; üçüncü veya dördüncü seçenek yeni ve eşit bir sütun olsun.
• Bütün sütunlarda aynı bilgi sırasını kullan: Tanım → Ayırt ettiren bulgu → Tanı → Tedavi.
• Bir sütunu diğerinin altına veya ortasına yerleştirme. ed-compare içine ed-arrow, ed-arrow-h, ed-vs ya da serbest metin koyma.
• Aynı karşılaştırmada en fazla 4 sütun ve sütun başına en fazla 4 kutu kullan. Daha fazla bilgi gerekiyorsa tablo kullan.

TİP 4 — Tedavi Basamakları (başarısızlık koşullu):
<div class="edu-diagram">
  <div class="ed-title">TEDAVİ ALGORİTMASI — BASAMAKLI</div>
  <div class="ed-flow">
    <div class="ed-node ed-teal ed-wide">1. BASAMAK: [İlaç adı] [doz] [süre]<div class="ed-sub">izlem kriteri: [ne zaman değerlendir]</div></div>
    <div class="ed-arrow"></div>
    <div class="ed-lbl">Yetersiz yanıt / intolerans ise</div>
    <div class="ed-arrow"></div>
    <div class="ed-node ed-gold ed-wide">2. BASAMAK: [İlaç/doz değişikliği]<div class="ed-sub">doz artır veya alternatife geç</div></div>
    <div class="ed-arrow"></div>
    <div class="ed-lbl">Dirençli vaka / komplikasyon</div>
    <div class="ed-arrow"></div>
    <div class="ed-row">
      <div class="ed-node ed-orange">3a: Kombinasyon<div class="ed-sub">hangi ilaçlar?</div></div>
      <div class="ed-node ed-purple">3b: Uzman Yönlendir<div class="ed-sub">endikasyon</div></div>
      <div class="ed-node ed-red">ACİL: [işlem]<div class="ed-sub">hayat kurtarıcı</div></div>
    </div>
  </div>
</div>

SEMANTİK SINIFLAR: ed-red yalnızca kritik/acil | ed-orange veya ed-gold uyarı ve eşik | ed-teal veya ed-green tedavi/olumlu sonuç | ed-blue veya ed-purple klinik ve anahtar bilgi | ed-gray nötr/başlangıç. Aynı diyagramda en fazla 3 renk ailesi kullan.
ZORUNLU KURALLAR:
• ed-arrow / ed-arrow-h icleri BOS kalir (metin yazma); ed-lbl icine kisa kosul/etiket yaz.
• Karar agaci icin <div class="flowchart">, <pre>, <code>, "├", "└", "|" karakterleri ve monospace metin agaci kullanma.
• Her ed-node içine gerçek klinik değerler yaz (ilaç adı+doz, sayısal eşik, yüzde oran)
• ed-sub kullanarak her kutucuğa alt bilgi ekle — soyut etiket YAZMA ("Mekanizma" değil "ACE inhibitörü → bradikinin↑")
• Diyagram başlıkları konuya özel olsun ("PAT0FİZYOLOJİ — KALBİ YETMEZLİK" gibi)
• Patofizyoloji, sınıflama ve tedavi konumlarından yalnızca konuyu en iyi öğreten iki tanesine uygun diyagram yerleştir

BU PARÇANIN DİYAGRAM KARARI: ${[2, 5, 7].includes(part) ? "Yalnızca gerçekten öğreticiyse en fazla 1 diyagram kullan." : "Diyagram üretme; doğrudan ayrıntılı metin ve tablo yaz."}

BU AŞAMADA ÜRETİLECEK ZORUNLU BÖLÜMLER:
${requiredSections}

UZUNLUK VE DERİNLİK KURALI:
- Bu bölüm 700-1000 kelime arasında olsun; konuyu özetlemeden ayrıntılı işle.
- Her zorunlu kapsam öğesini adıyla işle ve ayırt ettiren sınav bilgilerini yaz.
- Kısa özet üretme. Bir TUS adayının başka ana kaynağa ihtiyaç duymadan tekrar yapabileceği fasikül ayrıntısında yaz.
- Yanıtı son zorunlu bölüm tamamen kapanmadan bitirme.

Şimdi başla:`;
}

function buildCoverageSupplementPrompt(cat: string, topic: string, missingAnchors: string[]) {
  return `Sen kıdemli bir TUS ders kitabı editörüsün. Aşağıdaki konu notunun kapsam denetiminde eksik kalan alt başlıkları tamamla.

DERS: ${cat}
KONU: ${topic}
EKSİK BAŞLIKLAR:
${missingAnchors.map((anchor) => `- ${anchor}`).join("\n")}

SADECE HTML döndür. <h2>14. Kapsam Tamamlama</h2> ile başla.
Her eksik öğeyi ayrı <h3> başlığında ele al. Mikrobiyal etkenlerde morfoloji/boyanma, kültür-biyokimya, virülans/toksin, bulaş, klinik hastalıklar, tanı, ilk seçenek tedavi, direnç ve korunmayı yaz.
Her başlık en az bir açıklayıcı paragraf, yüksek verimli madde listesi ve bir TUS ayırt ettirici ipucu içersin. "vb.", "diğerleri" veya yalnızca isim listesi kullanma. Diyagram ekleme. Markdown kullanma.`;
}

function buildLinkPrompt(cat: string, topic: string): string {
  return `TUS akademisyeni olarak şu konu için KLİNİK BAĞLANTI NOTLARI hazırla.
KONU: ${cat} — ${topic}

KISA FORMAT KURALI:
- Sadece klinik baglanti yaz; konu anlatimi, buyuk baslik, tablo veya karar agaci ekleme.
- Her madde 1-2 cumle olsun; yazilar kompakt, okunur ve hedefe yonelik kalsin.
- Buyuk harfle uzun cumle yazma; hastalik adini kisa tut, ayirt ettiren ipucunu net ver.

GÖREV: Bu konuyla AYNI belirti, bulgu, mekanizma, yolak, ilaç hedefi veya patolojik süreci paylaşan diğer TUS konularını listele.

SADECE HTML döndür:
<div class="tip"><strong>🔗 [PAYLAŞILAN BULGU]: </strong><ul><li><strong>Hastalık:</strong> neden aynı bulguda düşünülmeli + ayırt eden özellik</li></ul></div>

En az 4, en fazla 6 farklı paylaşımlı bulgu ver. Sadece HTML yaz:`;
}

