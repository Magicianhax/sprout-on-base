import { NextRequest, NextResponse } from "next/server";
import {
  API_FETCH_TIMEOUT_MS,
  LIFI_API_BASE,
  MAX_SLIPPAGE,
} from "@/lib/constants";
import { getLifiIntegrator } from "@/lib/lifiIntegrator";

// Catch-all LI.FI API proxy. The @lifi/sdk on the client is configured
// with `apiUrl: '${origin}/api/lifi/v1'`, so every LI.FI API call the
// SDK makes — quote, routes, status, tools, chains, tokens, keys — lands
// here. This keeps LIFI_API_KEY server-side while letting the SDK
// authenticate against the integrator's rate limit + fee-share.
//
// Path allowlist is intentionally narrow: we only forward the endpoints
// the SDK actually hits during normal deposit/withdraw execution. Any
// other path returns 404, which is the SSRF mitigation — a wide-open
// proxy to li.quest could be leveraged to probe unrelated endpoints
// and eat rate-limit budget.
//
// Attribution scrub: every request has `integrator`, `fee`, and
// `referrer` stripped from the inbound query AND POST body, then
// rewritten with the server-resolved integrator name + 0.0025 fee.
// `slippage` is clamped to MAX_SLIPPAGE. A hostile client can't bypass
// our 25 bps attribution by crafting fetches in the browser console.

const LIFI_API_KEY = process.env.LIFI_API_KEY;

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, must-revalidate",
};

// Every segment must match one of these. The SDK's routes are prefixed
// with `v1/`; any deeper segments are permitted (e.g. `v1/chains/137`).
const PATH_ALLOWLIST: readonly RegExp[] = [
  /^v1\/quote$/,
  /^v1\/quote\/toAmount$/,
  /^v1\/quote\/contractCalls$/,
  /^v1\/advanced\/routes$/,
  /^v1\/advanced\/stepTransaction$/,
  /^v1\/status$/,
  /^v1\/tools$/,
  /^v1\/connections$/,
  /^v1\/chains(\/\d+)?$/,
  /^v1\/token$/,
  /^v1\/tokens$/,
  /^v1\/keys\/test$/,
  /^v1\/gas\/suggestion\/\d+$/,
  /^v1\/gas\/prices$/,
] as const;

function isAllowedPath(path: string): boolean {
  return PATH_ALLOWLIST.some((re) => re.test(path));
}

// Attribution + safety keys the client must NEVER control.
const SERVER_CONTROLLED_KEYS = new Set([
  "integrator",
  "fee",
  "referrer",
]);

const SERVER_FEE = "0.0025";

function clampSlippageString(raw: string | null): string | null {
  if (raw === null) return null;
  const v = parseFloat(raw);
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.min(v, MAX_SLIPPAGE).toString();
}

function buildOutgoingQuery(
  request: NextRequest,
  integrator: string | null
): string {
  const out = new URLSearchParams();
  for (const [k, v] of request.nextUrl.searchParams.entries()) {
    if (SERVER_CONTROLLED_KEYS.has(k)) continue;
    if (k === "slippage") {
      const clamped = clampSlippageString(v);
      if (clamped !== null) out.append(k, clamped);
      continue;
    }
    out.append(k, v);
  }
  if (integrator) out.set("integrator", integrator);
  out.set("fee", SERVER_FEE);
  return out.toString();
}

// Scrub a POST body the same way as the query: drop client-supplied
// attribution keys and re-inject our server-controlled values. The SDK
// only ever sends JSON bodies; non-JSON bodies are passed through.
function scrubJsonBody(text: string, integrator: string | null): string {
  if (!text) return text;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return text;
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return text;
  }
  const obj = json as Record<string, unknown>;
  for (const key of SERVER_CONTROLLED_KEYS) delete obj[key];
  obj.fee = Number(SERVER_FEE);
  if (integrator) obj.integrator = integrator;

  if (obj.options && typeof obj.options === "object" && !Array.isArray(obj.options)) {
    const opts = obj.options as Record<string, unknown>;
    for (const key of SERVER_CONTROLLED_KEYS) delete opts[key];
    opts.fee = Number(SERVER_FEE);
    if (integrator) opts.integrator = integrator;
    if (typeof opts.slippage === "number" && opts.slippage > 0) {
      opts.slippage = Math.min(opts.slippage, MAX_SLIPPAGE);
    }
  }
  return JSON.stringify(obj);
}

async function forward(
  request: NextRequest,
  pathSegments: string[],
  method: "GET" | "POST"
): Promise<NextResponse> {
  if (!LIFI_API_KEY) {
    console.error("[lifi proxy] LIFI_API_KEY not configured");
    return NextResponse.json(
      { message: "Server configuration error" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  const joinedPath = pathSegments.join("/");
  if (!isAllowedPath(joinedPath)) {
    return NextResponse.json(
      { message: "Not found" },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  // Resolve the registered integrator on every request — getLifiIntegrator()
  // is cached after the first successful resolve, so this is a single
  // upstream call per cold start, not per request.
  const integrator = await getLifiIntegrator();

  const apiPath = pathSegments.map((seg) => encodeURIComponent(seg)).join("/");
  const query = buildOutgoingQuery(request, integrator);
  const upstreamUrl = `${LIFI_API_BASE}/${apiPath}${query ? `?${query}` : ""}`;

  const init: RequestInit = {
    method,
    headers: {
      "x-lifi-api-key": LIFI_API_KEY,
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(API_FETCH_TIMEOUT_MS),
  };

  if (method === "POST") {
    const raw = await request.text();
    init.body = scrubJsonBody(raw, integrator);
  }

  try {
    const upstream = await fetch(upstreamUrl, init);
    const bodyText = await upstream.text();
    return new NextResponse(bodyText, {
      status: upstream.status,
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (err) {
    console.error(`[lifi proxy] network error (${joinedPath})`, err);
    return NextResponse.json(
      { message: "Network error contacting LI.FI" },
      { status: 502, headers: NO_STORE_HEADERS }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return forward(request, path, "GET");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return forward(request, path, "POST");
}
