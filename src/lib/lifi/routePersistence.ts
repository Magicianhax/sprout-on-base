"use client";

import type { Route, RouteExtended } from "@lifi/sdk";

// Session-scoped storage for in-flight LI.FI routes. The SDK's
// executeRoute is resumable — if the user refreshes mid-bridge we can
// call resumeRoute with the latest route object and pick up where we
// left off (the SDK re-polls /status and re-prompts the wallet for
// the outstanding step).
//
// Keys are scoped by wallet + vault + source chain so a multi-source
// deposit can park several routes in parallel, and a logout-relogin
// with a different wallet can't accidentally resume someone else's
// route.

const PREFIX = "sprout:lifi-route:";

function keyFor(params: {
  walletAddress: string;
  vaultChainId: number;
  vaultAddress: string;
  sourceChainId: number;
}): string {
  const { walletAddress, vaultChainId, vaultAddress, sourceChainId } = params;
  return `${PREFIX}${walletAddress.toLowerCase()}:${vaultChainId}:${vaultAddress.toLowerCase()}:${sourceChainId}`;
}

export function saveRoute(
  params: {
    walletAddress: string;
    vaultChainId: number;
    vaultAddress: string;
    sourceChainId: number;
  },
  route: Route | RouteExtended
): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(keyFor(params), JSON.stringify(route));
  } catch {
    // QuotaExceeded or storage disabled — not fatal, resume just
    // won't work for this route.
  }
}

export function loadRoute(params: {
  walletAddress: string;
  vaultChainId: number;
  vaultAddress: string;
  sourceChainId: number;
}): RouteExtended | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(keyFor(params));
    if (!raw) return null;
    return JSON.parse(raw) as RouteExtended;
  } catch {
    return null;
  }
}

export function clearRoute(params: {
  walletAddress: string;
  vaultChainId: number;
  vaultAddress: string;
  sourceChainId: number;
}): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(keyFor(params));
  } catch {
    // ignore
  }
}

/**
 * List all saved routes belonging to a given wallet. Used on hook
 * mount to detect resumable deposits so the UI can offer "Continue
 * where you left off" instead of starting from scratch.
 */
export function listRoutesForWallet(walletAddress: string): RouteExtended[] {
  if (typeof window === "undefined") return [];
  const addr = walletAddress.toLowerCase();
  const result: RouteExtended[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (!k || !k.startsWith(PREFIX)) continue;
    // Second segment of the key is the wallet address.
    if (!k.startsWith(`${PREFIX}${addr}:`)) continue;
    try {
      const raw = sessionStorage.getItem(k);
      if (raw) result.push(JSON.parse(raw) as RouteExtended);
    } catch {
      // skip malformed
    }
  }
  return result;
}
