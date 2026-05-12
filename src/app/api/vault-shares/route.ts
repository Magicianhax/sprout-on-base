import { NextRequest, NextResponse } from "next/server";
import {
  ALCHEMY_NETWORK_BY_CHAIN,
  RPC_FETCH_TIMEOUT_MS,
} from "@/lib/constants";

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, must-revalidate",
};

function rpcUrlFor(chainId: number): string | null {
  if (!ALCHEMY_API_KEY) return null;
  const network = ALCHEMY_NETWORK_BY_CHAIN[chainId];
  if (!network) return null;
  return `https://${network}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
}

function isAddress(v: unknown): v is string {
  return typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
}

interface AlchemyTokenBalance {
  contractAddress: string;
  tokenBalance: string | null;
  error?: string | null;
}
interface AlchemyGetTokenBalancesResult {
  address: string;
  tokenBalances: AlchemyTokenBalance[];
}

// ERC4626 convertToAssets(uint256) selector.
const CONVERT_TO_ASSETS_SELECTOR = "0x07a2d13a";

function hex32(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function encodeConvertToAssets(shares: bigint): string {
  return `${CONVERT_TO_ASSETS_SELECTOR}${hex32(shares)}`;
}

interface HeldVaultEntry {
  address: string;
  shareBalance: string; // raw hex string
  underlyingAmount: string | null; // raw decimal string (base units)
}

/**
 * POST /api/vault-shares
 * body: { chainId, address, vaults: string[] }
 *
 * Returns every supplied vault the wallet holds a non-zero share
 * balance in. For each held vault we also run an ERC4626
 * `convertToAssets(shareBalance)` via eth_call so the caller gets
 * the underlying-asset amount it represents.
 *
 * usePositions uses this to build a ground-truth position list
 * directly from on-chain data instead of trusting LI.FI's /positions
 * endpoint, which mislabels protocols and double-counts multi-vault
 * holders.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!ALCHEMY_API_KEY) {
    console.error("[vault-shares] ALCHEMY_API_KEY not configured");
    return NextResponse.json(
      { message: "Server configuration error" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Invalid JSON body" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { message: "Invalid body" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const { chainId, address, vaults } = body as Record<string, unknown>;

  if (typeof chainId !== "number") {
    return NextResponse.json(
      { message: "chainId must be a number" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
  if (!isAddress(address)) {
    return NextResponse.json(
      { message: "Invalid address" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
  if (!Array.isArray(vaults) || vaults.length === 0) {
    return NextResponse.json(
      { held: [] },
      { headers: NO_STORE_HEADERS }
    );
  }
  const vaultAddresses = vaults.filter(isAddress);
  if (vaultAddresses.length === 0) {
    return NextResponse.json(
      { held: [] },
      { headers: NO_STORE_HEADERS }
    );
  }
  // Alchemy caps getTokenBalances at 1500 tokens per call. Clamp defensively.
  const safeList = vaultAddresses.slice(0, 1000);

  const rpcUrl = rpcUrlFor(chainId);
  if (!rpcUrl) {
    return NextResponse.json(
      { held: [] },
      { headers: NO_STORE_HEADERS }
    );
  }

  try {
    const balancesRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "alchemy_getTokenBalances",
        params: [address, safeList],
        id: 1,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(RPC_FETCH_TIMEOUT_MS),
    });
    if (!balancesRes.ok) {
      console.warn(`[vault-shares] http ${balancesRes.status}`);
      return NextResponse.json(
        { held: [] },
        { headers: NO_STORE_HEADERS }
      );
    }
    const json = (await balancesRes.json()) as {
      result?: AlchemyGetTokenBalancesResult;
      error?: unknown;
    };
    if (json.error || !json.result?.tokenBalances) {
      console.warn(`[vault-shares] rpc error`, json.error);
      return NextResponse.json(
        { held: [] },
        { headers: NO_STORE_HEADERS }
      );
    }

    const heldRaw: { address: string; shareBalance: bigint }[] = [];
    for (const entry of json.result.tokenBalances) {
      if (entry.error) continue;
      const hex = entry.tokenBalance ?? "0x0";
      if (!hex || hex === "0x" || hex === "0x0") continue;
      try {
        const shares = BigInt(hex);
        if (shares > BigInt(0)) {
          heldRaw.push({
            address: entry.contractAddress.toLowerCase(),
            shareBalance: shares,
          });
        }
      } catch {
        // skip malformed entries
      }
    }

    if (heldRaw.length === 0) {
      return NextResponse.json(
        { held: [] },
        { headers: NO_STORE_HEADERS }
      );
    }

    // Batch ERC4626.convertToAssets calls for every held vault.
    // One JSON-RPC batch request = one round trip regardless of
    // how many positions the user has.
    const callPayload = heldRaw.map((h, i) => ({
      jsonrpc: "2.0",
      id: i + 2,
      method: "eth_call",
      params: [
        {
          to: h.address,
          data: encodeConvertToAssets(h.shareBalance),
        },
        "latest",
      ],
    }));

    const callRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(callPayload),
      cache: "no-store",
      signal: AbortSignal.timeout(RPC_FETCH_TIMEOUT_MS),
    });

    const held: HeldVaultEntry[] = heldRaw.map((h) => ({
      address: h.address,
      shareBalance: `0x${h.shareBalance.toString(16)}`,
      underlyingAmount: null,
    }));

    if (callRes.ok) {
      try {
        const callBody = (await callRes.json()) as Array<{
          id: number;
          result?: string;
          error?: unknown;
        }>;
        if (Array.isArray(callBody)) {
          for (const entry of callBody) {
            const idx = entry.id - 2;
            if (idx < 0 || idx >= held.length) continue;
            if (entry.error || !entry.result || entry.result === "0x") continue;
            try {
              held[idx].underlyingAmount = BigInt(entry.result).toString();
            } catch {
              // leave null
            }
          }
        }
      } catch {
        // partial results are fine; callers can fall back to share balance
      }
    }

    return NextResponse.json({ held }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    console.error("[vault-shares] failed", err);
    return NextResponse.json(
      { held: [] },
      { headers: NO_STORE_HEADERS }
    );
  }
}
