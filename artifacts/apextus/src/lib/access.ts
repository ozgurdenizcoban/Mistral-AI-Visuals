import { auth } from "./firebase";

export type AccessPlan = "free" | "weekly" | "monthly" | "yearly";

export interface AccessRecord {
  uid: string;
  plan: AccessPlan;
  expiresAt: string;
  isAdmin: boolean;
  updatedAt: string;
}

async function authorizedFetch(path: string, init?: RequestInit) {
  const user = auth.currentUser;
  if (!user) throw new Error("Oturum bulunamadı");
  const token = await user.getIdToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Erişim işlemi başarısız");
  return data as AccessRecord;
}

export function getMyAccess() {
  return authorizedFetch("/api/access");
}

export function getUserAccess(uid: string) {
  return authorizedFetch(`/api/access?uid=${encodeURIComponent(uid)}`);
}

export function updateUserAccess(input: {
  uid: string;
  plan: AccessPlan;
  expiresAt?: string;
  isAdmin: boolean;
}) {
  return authorizedFetch("/api/access", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
