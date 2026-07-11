const MISTRAL_API_KEY = import.meta.env.VITE_MISTRAL_API_KEY as string;
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 75000;

// Serializing queue — prevents concurrent calls from bypassing the rate limit
let _queueTail: Promise<void> = Promise.resolve();

async function mistralCall(
  prompt: string,
  maxTokens = 8000,
  temp = 0.7,
  jsonMode = false
): Promise<string> {
  let releaseSlot!: () => void;
  const mySlot = new Promise<void>((resolve) => { releaseSlot = resolve; });

  const prevTail = _queueTail;
  _queueTail = mySlot;

  await prevTail;
  await new Promise((r) => setTimeout(r, 300));

  try {
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

    let resp = await doFetch();

    // Retry on 429 (rate limit) or 500 (transient server error)
    if (resp.status === 429 || resp.status === 500) {
      const wait = resp.status === 429 ? 8000 : 5000;
      await new Promise((r) => setTimeout(r, wait));
      resp = await doFetch();
    }

    if (!resp.ok) {
      let et = `HTTP ${resp.status}`;
      try {
        const ed = await resp.json();
        et = ed?.message || ed?.error?.message || et;
      } catch (_) {}
      throw new Error(et);
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content || content.trim().length < 5) throw new Error("Boş yanıt");
    return content.trim();
  } finally {
    releaseSlot();
  }
}

export async function mistralText(prompt: string, maxTokens = 8000, temp = 0.7): Promise<string> {
  return mistralCall(prompt, maxTokens, temp, false);
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
