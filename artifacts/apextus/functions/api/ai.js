import { handleAiRequest } from "../_shared/ai.mjs";

export function onRequest({ request, env }) {
  return handleAiRequest(request, env);
}
