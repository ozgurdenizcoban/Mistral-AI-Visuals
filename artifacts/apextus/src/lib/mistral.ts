const MISTRAL_API_KEY = import.meta.env.VITE_MISTRAL_API_KEY as string;
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 180000;

// Serializing queue — prevents concurrent calls from bypassing the rate limit
let _queueTail: Promise<void> = Promise.resolve();

async function mistralCall(
  prompt: string,
  maxTokens = 8000,
  temp = 0.7,
  jsonMode = false,
  requireComplete = false,
): Promise<string> {
  let releaseSlot!: () => void;
  const mySlot = new Promise<void>((resolve) => { releaseSlot = resolve; });

  const prevTail = _queueTail;
  _queueTail = mySlot;

  await prevTail;
  await new Promise((r) => setTimeout(r, 300));

  try {
    if (!MISTRAL_API_KEY?.trim()) {
      throw new Error("AI bağlantı anahtarı eksik. Site yöneticisine bildir.");
    }

    const body: Record<string, unknown> = {
      model: "mistral-large-latest",
      messages: [{ role: "user", content: prompt }],
      max_tokens: Math.min(maxTokens, 16000),
      temperature: temp,
    };

    if (jsonMode) {
      body.response_format = { type: "json_object" };
    }

    async function doFetch() {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        return await fetch(MISTRAL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${MISTRAL_API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      } finally {
        window.clearTimeout(timer);
      }
    }

    let resp: Response;
    try {
      resp = await doFetch();
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        throw new Error("AI yanıtı zaman aşımına uğradı. Lütfen yeniden dene.");
      }
      throw new Error("AI servisine bağlanılamadı. İnternet bağlantını kontrol edip yeniden dene.");
    }

    // Retry once when the provider is busy or temporarily unavailable.
    if ([408, 429, 500, 502, 503, 504].includes(resp.status)) {
      const retryAfter = Number(resp.headers.get("retry-after") || "0");
      const wait = retryAfter > 0 ? Math.min(retryAfter * 1000, 15000) : (resp.status === 429 ? 8000 : 4000);
      await new Promise((r) => setTimeout(r, wait));
      resp = await doFetch();
    }

    if (!resp.ok) {
      let et = `HTTP ${resp.status}`;
      try {
        const ed = await resp.json();
        et = ed?.message || ed?.error?.message || et;
      } catch (_) {}
      if (resp.status === 401 || resp.status === 403) et = "AI erişim anahtarı geçersiz veya yetkisiz.";
      if (resp.status === 402) et = "Mistral kullanım bakiyesi yetersiz.";
      if (resp.status === 429) et = "AI kullanım sınırına ulaşıldı. Bir dakika sonra yeniden dene.";
      throw new Error(et);
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content || content.trim().length < 5) throw new Error("Boş yanıt");
    if (requireComplete && data?.choices?.[0]?.finish_reason === "length") {
      throw new Error("AI yanıtı yarıda kaldı. Not eksik kaydedilmedi; lütfen yeniden dene.");
    }
    return content.trim();
  } finally {
    releaseSlot();
  }
}

export async function mistralText(prompt: string, maxTokens = 8000, temp = 0.7): Promise<string> {
  return mistralCall(prompt, maxTokens, temp, false);
}

export async function mistralCompleteText(prompt: string, maxTokens = 16000, temp = 0.35): Promise<string> {
  return mistralCall(prompt, maxTokens, temp, false, true);
}

export async function mistralJSON(prompt: string, maxTokens = 8000, temp = 0.7): Promise<string> {
  return mistralCall(prompt, maxTokens, temp, true);
}

export function parseJSON(raw: string): unknown {
  if (!raw) throw new Error("Boş yanıt");
  let s = raw.trim();
  try { return JSON.parse(s); } catch (_) {}
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try { return JSON.parse(s); } catch (_) {}
  const i1 = s.indexOf("{");
  const i2 = s.lastIndexOf("}");
  if (i1 >= 0 && i2 > i1) {
    try { return JSON.parse(s.slice(i1, i2 + 1)); } catch (_) {}
  }
  throw new Error("JSON parse başarısız");
}
