import { NextRequest, NextResponse } from "next/server";

// Base Notifications proxy. Forwards a notify request to base.dev's
// /api/v1/notifications/send endpoint with our server-only API key
// attached. Validates every client-supplied field before forwarding
// so a hostile client can't blast oversized payloads, target arbitrary
// addresses outside the EVM address shape, or spoof an external URL
// via target_path.
//
// Authentication: BASE_API_KEY is generated at
//   dashboard.base.org > your project > Settings > API Key
// Server-only — never expose to the client.
//
// Delivery: Base only delivers to wallets that have pinned this app
// in Base App and have notifications enabled there. The client-side
// usePreferences.notificationsEnabled toggle controls whether Sprout
// sends in the first place; Base controls delivery.

const BASE_API_KEY = process.env.BASE_API_KEY;
const BASE_NOTIFY_ENDPOINT =
  "https://dashboard.base.org/api/v1/notifications/send";

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

// Base's documented limits — fail fast with a clear error rather than
// punting to Base's 400.
const MAX_TITLE = 30;
const MAX_MESSAGE = 200;
const MAX_TARGET_PATH = 500;
const MAX_ADDRESSES = 1000;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, must-revalidate",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface NotifyBody {
  walletAddresses: string[];
  title: string;
  message: string;
  targetPath?: string;
}

function parseBody(raw: unknown): NotifyBody | { error: string } {
  if (!raw || typeof raw !== "object") {
    return { error: "Invalid request body." };
  }
  const b = raw as Record<string, unknown>;

  const addresses = b.walletAddresses;
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return { error: "walletAddresses must be a non-empty array." };
  }
  if (addresses.length > MAX_ADDRESSES) {
    return { error: `walletAddresses exceeds ${MAX_ADDRESSES} entries.` };
  }
  for (const a of addresses) {
    if (typeof a !== "string" || !ADDRESS_REGEX.test(a)) {
      return { error: "walletAddresses must all be 0x-prefixed 40-hex addresses." };
    }
  }

  const title = b.title;
  if (typeof title !== "string" || title.length === 0 || title.length > MAX_TITLE) {
    return { error: `title must be a non-empty string up to ${MAX_TITLE} chars.` };
  }

  const message = b.message;
  if (
    typeof message !== "string" ||
    message.length === 0 ||
    message.length > MAX_MESSAGE
  ) {
    return { error: `message must be a non-empty string up to ${MAX_MESSAGE} chars.` };
  }

  const tp = b.targetPath;
  let targetPath: string | undefined;
  if (tp !== undefined && tp !== null) {
    if (typeof tp !== "string" || !tp.startsWith("/") || tp.length > MAX_TARGET_PATH) {
      return {
        error: `targetPath must start with "/" and be at most ${MAX_TARGET_PATH} chars.`,
      };
    }
    targetPath = tp;
  }

  return {
    walletAddresses: addresses as string[],
    title,
    message,
    targetPath,
  };
}

function resolveAppUrl(request: NextRequest): string {
  // Prefer an explicit env override (so preview deployments can match
  // the production app_url Base has on file), fall back to the request
  // origin. Base verifies the app_url against the registered project,
  // so this must match the URL whose base:app_id meta tag was used to
  // claim the listing.
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    request.nextUrl.origin
  );
}

export async function POST(request: NextRequest) {
  if (!BASE_API_KEY) {
    console.error("[notify] BASE_API_KEY not configured");
    return NextResponse.json(
      { message: "Notifications are not configured on the server." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Body must be valid JSON." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const parsed = parseBody(raw);
  if ("error" in parsed) {
    return NextResponse.json(
      { message: parsed.error },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const appUrl = resolveAppUrl(request);
  const payload: Record<string, unknown> = {
    app_url: appUrl,
    wallet_addresses: parsed.walletAddresses,
    title: parsed.title,
    message: parsed.message,
  };
  if (parsed.targetPath) {
    payload.target_path = parsed.targetPath;
  }

  try {
    const upstream = await fetch(BASE_NOTIFY_ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": BASE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
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
    console.error("[notify] base notifications send failed", err);
    return NextResponse.json(
      { message: "Failed to deliver notification." },
      { status: 502, headers: NO_STORE_HEADERS }
    );
  }
}
