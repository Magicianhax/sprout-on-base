import { NextRequest, NextResponse } from "next/server";
import { API_FETCH_TIMEOUT_MS, LIFI_API_BASE } from "@/lib/constants";

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

  const apiPath = pathSegments.map((seg) => encodeURIComponent(seg)).join("/");
  const query = request.nextUrl.searchParams.toString();
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
    // Read the body once as text — we forward it verbatim. The SDK
    // already shapes its own JSON payloads; we don't need to inspect
    // or mutate them here.
    init.body = await request.text();
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
