const FIREBASE_API_KEY = "AIzaSyCJfMeHrFgpmssdnZtxoI64nUK-2MNUq-k";

export async function verifyFirebaseUser(request) {
  const authorization = request.headers.get("authorization") || "";
  const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!idToken) return null;

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!response.ok) return null;

  const data = await response.json();
  const user = Array.isArray(data.users) ? data.users[0] : null;
  if (!user?.localId) return null;
  return {
    uid: user.localId,
    email: typeof user.email === "string" ? user.email.toLowerCase() : "",
  };
}
