// Client-side session marker for "the user has signed a SIWE message
// from this address in the last 24h". This is not a real server-side
// session — every on-chain action requires a fresh wallet signature
// anyway, so the SIWE step exists primarily to:
//   1. Confirm the user controls the connected wallet (anti-spoofing
//      for analytics / Base.dev attribution).
//   2. Give AuthGuard a "logged in" state that survives page refresh
//      without re-prompting the user to sign on every load.
//
// If sprout-base later grows a backend that issues real JWTs, this
// gets replaced with the server's verifyMessage + httpOnly cookie.

const KEY = "sprout_base_session_v1";
const TTL_MS = 24 * 60 * 60 * 1000;

export interface Session {
  address: `0x${string}`;
  signedAt: number;
}

export function loadSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (!s.address || typeof s.signedAt !== "number") return null;
    if (Date.now() - s.signedAt > TTL_MS) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // localStorage can fail in private mode or with quota issues —
    // the user just won't get the "remember me" benefit.
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // see saveSession
  }
}
