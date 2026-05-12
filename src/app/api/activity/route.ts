import { NextRequest, NextResponse } from "next/server";
import {
  ALCHEMY_NETWORK_BY_CHAIN,
  API_FETCH_TIMEOUT_MS,
  EXPLORER_TX_URL_BY_CHAIN,
  NATIVE_SYMBOL_BY_CHAIN,
  SUPPORTED_CHAIN_IDS,
} from "@/lib/constants";
import type { ActivityGroup, WalletTransfer } from "@/lib/types";

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, must-revalidate",
};

// We fetch up to 20 transfers per chain per direction; 5 chains × 2
// directions = 10 upstream calls per request. Grouped results are
// capped to MAX_GROUPS so the response stays small.
const PER_DIRECTION_MAX = 30;
const MAX_GROUPS = 25;

// Cheap server-side spam filter. Anything that passes still gets the
// stricter client-side whitelist check in RecentActivity (known tokens
// or known vaults), but dropping obvious spam here keeps the payload
// small and classification lookups honest.
const SPAM_SYMBOL_MARKERS = [
  "http",
  "www",
  ".com",
  ".io",
  ".net",
  ".xyz",
  ".app",
  ".me",
  ".club",
  ".finance",
  ".top",
  "visit ",
  "claim ",
  "reward",
  "airdrop",
  "giveaway",
  "$ ",
  " $",
];

function looksLikeSpamSymbol(symbol: string | null): boolean {
  if (!symbol) return true;
  const trimmed = symbol.trim();
  if (!trimmed) return true;
  if (trimmed.length > 20) return true;
  const lower = trimmed.toLowerCase();
  for (const marker of SPAM_SYMBOL_MARKERS) {
    if (lower.includes(marker)) return true;
  }
  return false;
}

interface AlchemyTransfer {
  hash: string;
  from: string | null;
  to: string | null;
  value: number | null;
  asset: string | null;
  category: "external" | "internal" | "erc20" | "erc721" | "erc1155";
  rawContract: {
    address: string | null;
    decimal: string | null;
    value: string;
  };
  metadata?: {
    blockTimestamp: string;
  };
}

interface AlchemyJsonRpcResponse {
  result?: { transfers: AlchemyTransfer[] };
  error?: { message: string; code?: number };
}

async function queryAlchemy(
  chainId: number,
  direction: "from" | "to",
  address: string
): Promise<AlchemyTransfer[]> {
  const network = ALCHEMY_NETWORK_BY_CHAIN[chainId];
  if (!network) return [];

  const url = `https://${network}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
  const paramKey = direction === "from" ? "fromAddress" : "toAddress";

  const body = {
    jsonrpc: "2.0",
    method: "alchemy_getAssetTransfers",
    params: [
      {
        fromBlock: "0x0",
        toBlock: "latest",
        [paramKey]: address,
        category: ["external", "erc20"],
        withMetadata: true,
        excludeZeroValue: true,
        maxCount: `0x${PER_DIRECTION_MAX.toString(16)}`,
        order: "desc",
      },
    ],
    id: 1,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(API_FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error(
        `[activity] alchemy chain=${chainId} dir=${direction} status=${res.status}`
      );
      return [];
    }

    const data = (await res.json()) as AlchemyJsonRpcResponse;
    if (data.error) {
      console.error(
        `[activity] alchemy chain=${chainId} error: ${data.error.message}`
      );
      return [];
    }
    return data.result?.transfers ?? [];
  } catch (err) {
    console.error(
      `[activity] alchemy chain=${chainId} dir=${direction} failed`,
      err
    );
    return [];
  }
}

function normalize(
  transfer: AlchemyTransfer,
  chainId: number,
  userAddress: string
): WalletTransfer | null {
  const userLower = userAddress.toLowerCase();
  const fromLower = transfer.from?.toLowerCase() ?? "";
  const toLower = transfer.to?.toLowerCase() ?? "";

  const isOut = fromLower === userLower;
  const isIn = toLower === userLower;
  if (!isOut && !isIn) return null;

  const direction: "in" | "out" = isOut ? "out" : "in";
  const counterparty = isOut ? transfer.to : transfer.from;
  if (!counterparty) return null;

  const tsIso = transfer.metadata?.blockTimestamp;
  const timestamp = tsIso ? Math.floor(new Date(tsIso).getTime() / 1000) : 0;
  if (!timestamp) return null;

  const isNative = transfer.category === "external";

  // Spam filter — skip tokens whose symbol looks like an airdrop.
  // Native transfers don't have a symbol from Alchemy so they're exempt.
  if (!isNative && looksLikeSpamSymbol(transfer.asset)) {
    return null;
  }

  const decimals = isNative
    ? 18
    : parseInt(transfer.rawContract.decimal ?? "0x12", 16);

  // `rawContract.value` is a hex-encoded raw base-unit amount.
  let amount = "0";
  try {
    amount = BigInt(transfer.rawContract.value || "0x0").toString();
  } catch {
    return null;
  }
  if (amount === "0") return null;

  const tokenAddress = isNative ? null : transfer.rawContract.address;
  const symbol =
    transfer.asset ?? (isNative ? NATIVE_SYMBOL_BY_CHAIN[chainId] : null) ?? "?";

  return {
    hash: transfer.hash,
    chainId,
    direction,
    token: { address: tokenAddress, symbol, decimals },
    amount,
    counterparty,
    timestamp,
  };
}

function groupByHash(
  transfers: WalletTransfer[]
): ActivityGroup[] {
  const groups = new Map<string, ActivityGroup>();
  // Also dedupe transfer rows — a single transfer event can show up in
  // both from/to queries for self-transfers, or across categories.
  const seen = new Set<string>();

  for (const t of transfers) {
    const dedupKey = `${t.chainId}-${t.hash}-${t.direction}-${t.token.address ?? "native"}-${t.amount}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const groupKey = `${t.chainId}-${t.hash}`;
    let g = groups.get(groupKey);
    if (!g) {
      g = {
        id: groupKey,
        chainId: t.chainId,
        hash: t.hash,
        timestamp: t.timestamp,
        explorerUrl: `${EXPLORER_TX_URL_BY_CHAIN[t.chainId] ?? ""}${t.hash}`,
        transfers: [],
      };
      groups.set(groupKey, g);
    }
    g.transfers.push(t);
  }

  return Array.from(groups.values()).sort(
    (a, b) => b.timestamp - a.timestamp
  );
}

export async function GET(request: NextRequest) {
  if (!ALCHEMY_API_KEY) {
    console.error("[activity] ALCHEMY_API_KEY not configured");
    return NextResponse.json(
      { message: "Server configuration error" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  const address = request.nextUrl.searchParams.get("address");
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json(
      { message: "Invalid or missing address" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const normalizedAddr = address.toLowerCase();

  // Fire all chain × direction queries in parallel.
  const jobs: Promise<WalletTransfer[]>[] = [];
  for (const chainId of SUPPORTED_CHAIN_IDS) {
    for (const direction of ["from", "to"] as const) {
      jobs.push(
        queryAlchemy(chainId, direction, normalizedAddr).then((raw) =>
          raw
            .map((t) => normalize(t, chainId, normalizedAddr))
            .filter((t): t is WalletTransfer => t !== null)
        )
      );
    }
  }

  const allTransfers = (await Promise.all(jobs)).flat();
  const groups = groupByHash(allTransfers).slice(0, MAX_GROUPS);

  return NextResponse.json({ data: groups }, { headers: NO_STORE_HEADERS });
}
