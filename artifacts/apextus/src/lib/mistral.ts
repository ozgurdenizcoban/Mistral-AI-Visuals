const MISTRAL_API_KEY = import.meta.env.VITE_MISTRAL_API_KEY as string;
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

// Proper serializing queue — prevents concurrent calls from bypassing the rate limit
let _queueTail: Promise<void> = Promise.resolve();

async function mistralCall(
  prompt: string,
  maxTokens = 8000,
  temp = 0.7,
  jsonMode = false
): Promise<string> {
  // Reserve a slot in the queue
  let releaseSlot!: () => void;
  const mySlot = new Promise<void>((resolve) => { releaseSlot = resolve; });

  // Wait for previous call to finish, then enforce 1.1s gap
  const prevTail = _queueTail;
  _queueTail = mySlot;

  await prevTail;
  await new Promise((r) => setTimeout(r, 1100));

  try {
    const body: Record<string, unknown> = {
      model: "mistral-large-latest",
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

    // Retry once on 429 with longer backoff
    if (resp.status === 429) {
      await new Promise((r) => setTimeout(r, 8000));
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
