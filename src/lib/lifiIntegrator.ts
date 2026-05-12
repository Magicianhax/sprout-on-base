import { LIFI_API_BASE } from "@/lib/constants";

// Resolve the integrator name associated with our LI.FI API key by
// hitting /v1/keys/test once and caching the result in the server
// process. The integrator name must match what's configured in the
// LI.FI Partner Portal for fee-share routing to work — hardcoding
// the wrong value (e.g. "sprout" when the portal has "sprout_app")
// silently drops the fee without any error. Looking it up from the
// key removes that footgun.

let cached: string | null = null;
let inflight: Promise<string | null> | null = null;

interface KeysTestResponse {
  user?: {
    name?: string;
  };
}

async function fetchIntegrator(apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(`${LIFI_API_BASE}/v1/keys/test`, {
      headers: { "x-lifi-api-key": apiKey },
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[lifi-integrator] /keys/test http ${res.status}`);
      return null;
    }
    const body = (await res.json()) as KeysTestResponse;
    const name = body.user?.name;
    return typeof name === "string" && name.length > 0 ? name : null;
  } catch (err) {
    console.warn("[lifi-integrator] lookup failed", err);
    return null;
  }
}

/**
 * Return the integrator name tied to `process.env.LIFI_API_KEY`.
 * Cached after the first successful resolve. Returns null if the
 * key is missing or the upstream lookup fails — callers should
 * treat null as "don't tag requests with an integrator" rather
 * than inventing a fallback.
 */
export async function getLifiIntegrator(): Promise<string | null> {
  if (cached) return cached;
  const apiKey = process.env.LIFI_API_KEY;
  if (!apiKey) return null;
  if (!inflight) {
    inflight = fetchIntegrator(apiKey).then((name) => {
      if (name) cached = name;
      inflight = null;
      return name;
    });
  }
  return inflight;
}
