const MISTRAL_API_KEY = import.meta.env.VITE_MISTRAL_API_KEY as string;
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

let lastCall = 0;
const RATE_LIMIT_MS = 1000;

async function mistralCall(
  prompt: string,
  maxTokens = 8000,
  temp = 0.7,
  jsonMode = false
): Promise<string> {
  const now = Date.now();
  const wait = RATE_LIMIT_MS - (now - lastCall);
  if (lastCall > 0 && wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();

  const model = maxTokens > 16000 ? "mistral-large-latest" : "mistral-large-latest";

  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: Math.min(maxTokens, 32000),
    temperature: temp,
  };

  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  async function doFetch() {
    return fetch(MISTRAL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
  }

  let resp = await doFetch();

  if (!resp.ok) {
    if (resp.status === 429) {
      await new Promise((r) => setTimeout(r, 3000));
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
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || content.trim().length < 5) throw new Error("Boş yanıt");

  return content.trim();
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
  try {
    return JSON.parse(s);
  } catch (_) {}
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try {
    return JSON.parse(s);
  } catch (_) {}
  const i1 = s.indexOf("{");
  const i2 = s.lastIndexOf("}");
  if (i1 >= 0 && i2 > i1) {
    try {
      return JSON.parse(s.slice(i1, i2 + 1));
    } catch (_) {}
  }
  throw new Error("JSON parse başarısız");
}
