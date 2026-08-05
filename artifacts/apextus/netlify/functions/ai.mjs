import { handleAiRequest } from "../../functions/_shared/ai.mjs";

export default function handler(request) {
  return handleAiRequest(request, {
    GEMINI_API_KEY: Netlify.env.get("GEMINI_API_KEY"),
    MISTRAL_API_KEY: Netlify.env.get("MISTRAL_API_KEY"),
    VITE_MISTRAL_API_KEY: Netlify.env.get("VITE_MISTRAL_API_KEY"),
  });
}
