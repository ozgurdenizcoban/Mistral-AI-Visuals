import { handleAccessRequest } from "../_shared/access.mjs";

export function onRequest({ request, env }) {
  return handleAccessRequest(request, env);
}
