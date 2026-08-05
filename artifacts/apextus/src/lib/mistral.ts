import { auth } from "@/lib/firebase";

const AI_URL = "/.netlify/functions/ai";
const REQUEST_TIMEOUT_MS = 240000;

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
    const body: Record<string, unknown> = {
      prompt,
      maxTokens: Math.min(maxTokens, 12000),
      temperature: temp,
      jsonMode,
    };

    async function doFetch(requestBody: Record<string, unknown>) {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const user = auth.currentUser;
        if (!user) throw new Error("AI kullanmak için giriş yapmalısınız.");
        const idToken = await user.getIdToken();
        return await fetch(AI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      } finally {
        window.clearTimeout(timer);
      }
    }

    async function request(requestBody: Record<string, unknown>) {
      let resp: Response;
      try {
        resp = await doFetch(requestBody);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          throw new Error("AI yanıtı zaman aşımına uğradı. Tamamlanan bölümler korundu; Yenile ile devam et.");
        }
        throw new Error("AI servisine bağlanılamadı. İnternet bağlantını kontrol edip yeniden dene.");
      }

      // Retry once when the provider is busy or temporarily unavailable.
      if ([408, 429, 500, 502, 503, 504].includes(resp.status)) {
        const retryAfter = Number(resp.headers.get("retry-after") || "0");
        const wait = retryAfter > 0 ? Math.min(retryAfter * 1000, 15000) : (resp.status === 429 ? 8000 : 4000);
        await new Promise((r) => setTimeout(r, wait));
        resp = await doFetch(requestBody);
      }

      if (!resp.ok) {
        let et = `HTTP ${resp.status}`;
        try {
          const ed = await resp.json();
          et = ed?.message || ed?.error?.message || et;
        } catch (_) {}
        if (resp.status === 401 || resp.status === 403) et = "AI erişimi için oturumunuzu yenileyin.";
        if (resp.status === 402) et = "AI kullanım bakiyesi yetersiz.";
        if (resp.status === 429) et = "AI kullanım sınırına ulaşıldı. Bir dakika sonra yeniden dene.";
        throw new Error(et);
      }
      return resp.json();
    }

    const data = await request(body);
    const content = data?.content?.trim() || "";
    if (content.length < 5) throw new Error("Boş yanıt");

    // A bounded note part is still useful when the provider reaches its token
    // ceiling. DOMParser closes any unfinished HTML before the part is shown.
    // Do not spend additional requests trying to make the model emit a stop token.
    void requireComplete;
    return content;
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
