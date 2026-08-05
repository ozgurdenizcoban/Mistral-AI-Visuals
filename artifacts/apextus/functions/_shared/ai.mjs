import { verifyFirebaseUser } from "./firebase-auth.mjs";

const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function callGemini({ prompt, maxTokens, temperature, jsonMode }, env) {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini anahtarı tanımlı değil");
  const response = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        ...(jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`Gemini HTTP ${response.status}: ${detail.slice(0, 240)}`);
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  const content = (data.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("").trim();
  if (!content) throw new Error("Gemini boş yanıt verdi");
  return { content, usage: data.usageMetadata || null };
}

async function callMistral({ prompt, maxTokens, temperature, jsonMode }, env) {
  const key = env.MISTRAL_API_KEY || env.VITE_MISTRAL_API_KEY;
  if (!key) throw new Error("Mistral yedek anahtarı tanımlı değil");
  const response = await fetch(MISTRAL_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "mistral-large-latest",
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!response.ok) throw new Error(`Mistral HTTP ${response.status}`);
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim() || "";
  if (!content) throw new Error("Mistral boş yanıt verdi");
  return { content, usage: data.usage || null };
}

export async function handleAiRequest(request, env) {
  if (request.method !== "POST") return json(405, { error: "Yalnızca POST desteklenir" });
  if (!(await verifyFirebaseUser(request))) return json(401, { error: "Geçersiz oturum" });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: "Geçersiz JSON" }); }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt || prompt.length > 120000) return json(400, { error: "Geçersiz istem" });
  const input = {
    prompt,
    maxTokens: Math.max(128, Math.min(Number(body.maxTokens) || 8000, 12000)),
    temperature: Math.max(0, Math.min(Number(body.temperature) || 0.7, 1.5)),
    jsonMode: Boolean(body.jsonMode),
  };

  try {
    const result = await callGemini(input, env);
    return json(200, { ...result, provider: "gemini" });
  } catch (geminiError) {
    console.warn("Gemini failed; using Mistral fallback", geminiError.message);
    try {
      const result = await callMistral(input, env);
      return json(200, { ...result, provider: "mistral" });
    } catch (mistralError) {
      console.error("Both AI providers failed", mistralError.message);
      return json(503, { error: "AI servisleri geçici olarak kullanılamıyor" });
    }
  }
}
