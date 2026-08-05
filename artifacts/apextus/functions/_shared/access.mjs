import { verifyFirebaseUser } from "./firebase-auth.mjs";

const DEFAULT_ADMIN_EMAILS = ["ozgurdenizzcoban@gmail.com"];
const VALID_PLANS = new Set(["free", "weekly", "monthly", "yearly"]);

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function adminEmails(env) {
  const configured = String(env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_ADMIN_EMAILS, ...configured]);
}

async function ensureSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS user_access (
      uid TEXT PRIMARY KEY,
      plan TEXT NOT NULL DEFAULT 'free',
      expires_at TEXT,
      is_admin INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    )
  `).run();
}

async function getAccess(db, uid) {
  return db.prepare(
    "SELECT uid, plan, expires_at, is_admin, updated_at, updated_by FROM user_access WHERE uid = ?",
  ).bind(uid).first();
}

function publicAccess(uid, row, baseAdmin = false) {
  const expiresAt = row?.expires_at || "";
  const expired = Boolean(expiresAt) && Date.parse(expiresAt) <= Date.now();
  return {
    uid,
    plan: expired ? "free" : (row?.plan || "free"),
    expiresAt: expired ? "" : expiresAt,
    isAdmin: baseAdmin || Boolean(row?.is_admin),
    updatedAt: row?.updated_at || "",
  };
}

function calculateExpiry(plan, explicitExpiry) {
  if (plan === "free") return null;
  if (typeof explicitExpiry === "string" && explicitExpiry.trim()) {
    const parsed = new Date(explicitExpiry);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const expiry = new Date();
  if (plan === "weekly") expiry.setUTCDate(expiry.getUTCDate() + 7);
  if (plan === "monthly") expiry.setUTCMonth(expiry.getUTCMonth() + 1);
  if (plan === "yearly") expiry.setUTCFullYear(expiry.getUTCFullYear() + 1);
  return expiry.toISOString();
}

export async function handleAccessRequest(request, env) {
  if (!env.ACCESS_DB) return json(503, { error: "Erişim veritabanı bağlı değil" });
  const caller = await verifyFirebaseUser(request);
  if (!caller) return json(401, { error: "Geçersiz oturum" });

  await ensureSchema(env.ACCESS_DB);
  const callerRow = await getAccess(env.ACCESS_DB, caller.uid);
  const callerIsBaseAdmin = adminEmails(env).has(caller.email);
  const callerAccess = publicAccess(caller.uid, callerRow, callerIsBaseAdmin);

  if (request.method === "GET") {
    const url = new URL(request.url);
    const requestedUid = (url.searchParams.get("uid") || caller.uid).trim();
    if (requestedUid !== caller.uid && !callerAccess.isAdmin) {
      return json(403, { error: "Bu işlem için admin yetkisi gerekir" });
    }
    const row = requestedUid === caller.uid ? callerRow : await getAccess(env.ACCESS_DB, requestedUid);
    return json(200, publicAccess(requestedUid, row, false));
  }

  if (request.method !== "POST") return json(405, { error: "Desteklenmeyen yöntem" });
  if (!callerAccess.isAdmin) return json(403, { error: "Bu işlem için admin yetkisi gerekir" });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Geçersiz JSON" });
  }

  const uid = typeof body.uid === "string" ? body.uid.trim() : "";
  const plan = typeof body.plan === "string" ? body.plan.trim() : "free";
  if (!uid || uid.length > 128) return json(400, { error: "Geçerli bir UID girin" });
  if (!VALID_PLANS.has(plan)) return json(400, { error: "Geçersiz plan" });

  const existing = await getAccess(env.ACCESS_DB, uid);
  const isAdmin = typeof body.isAdmin === "boolean" ? body.isAdmin : Boolean(existing?.is_admin);
  const expiresAt = calculateExpiry(plan, body.expiresAt);
  const now = new Date().toISOString();

  await env.ACCESS_DB.prepare(`
    INSERT INTO user_access (uid, plan, expires_at, is_admin, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(uid) DO UPDATE SET
      plan = excluded.plan,
      expires_at = excluded.expires_at,
      is_admin = excluded.is_admin,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `).bind(uid, plan, expiresAt, isAdmin ? 1 : 0, now, caller.uid).run();

  const saved = await getAccess(env.ACCESS_DB, uid);
  return json(200, publicAccess(uid, saved, false));
}
