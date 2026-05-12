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
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

// Matches a checksumless EVM address. Same shape the API proxy
// allowlists enforce — kept identical so address handling is uniform
// across the client and server boundaries.
const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

export interface Session {
  address: `0x${string}`;
  signedAt: number;
}

export function loadSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const s = parsed as { address?: unknown; signedAt?: unknown };
    if (typeof s.address !== "string" || !ADDRESS_REGEX.test(s.address)) {
      return null;
    }
    if (typeof s.signedAt !== "number" || !Number.isFinite(s.signedAt)) {
      return null;
    }
    if (Date.now() - s.signedAt > SESSION_TTL_MS) return null;
    return { address: s.address as `0x${string}`, signedAt: s.signedAt };
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
