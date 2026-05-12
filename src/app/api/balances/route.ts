import { NextRequest, NextResponse } from "next/server";
import {
  ALCHEMY_NETWORK_BY_CHAIN,
  RPC_FETCH_TIMEOUT_MS,
  TOKEN_ADDRESSES,
  TOKEN_DECIMALS,
} from "@/lib/constants";

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;

// Alchemy's alchemy_getTokenBalances lets us fetch every ERC20 balance
// for a wallet on a chain in one request instead of looping per-token
// eth_calls. Native balance still needs a separate eth_getBalance.
function alchemyRpcFor(chainId: number): string | null {
  if (!ALCHEMY_API_KEY) return null;
  const network = ALCHEMY_NETWORK_BY_CHAIN[chainId];
  if (!network) return null;
  return `https://${network}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, must-revalidate",
};

interface BalanceResult {
  symbol: string;
  chainId: number;
  balanceFormatted: number;
}

function hexToDecimal(hex: string | null | undefined, decimals: number): number {
  if (!hex) return 0;
  const clean = hex.replace(/^0x/, "");
  if (!clean) return 0;
  try {
    const raw = BigInt("0x" + clean);
    if (raw === BigInt(0)) return 0;
    // Keep this simple: divide via Number for display-grade precision.
    // Wallets shouldn't need 18-decimal precision on the UI anyway.
    return Number(raw) / Math.pow(10, decimals);
  } catch {
    return 0;
  }
}

async function alchemyRpc<T>(
  rpcUrl: string,
  method: string,
  params: unknown[]
): Promise<T | null> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
      cache: "no-store",
      signal: AbortSignal.timeout(RPC_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[balances] ${method} http ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { result?: T; error?: unknown };
    if (json.error) {
      console.warn(`[balances] ${method} rpc error`, json.error);
      return null;
    }
    return (json.result ?? null) as T | null;
  } catch (err) {
    console.warn(`[balances] ${method} failed`, err);
    return null;
  }
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

/**
 * Fetch every tracked balance for one chain in at most two RPC calls.
 * Returns BalanceResult[] with only non-zero entries — the merger at
 * the top level sorts everything by value afterwards.
 */
async function fetchChainBalances(
  chainId: number,
  address: string
): Promise<BalanceResult[]> {
  const rpcUrl = alchemyRpcFor(chainId);
  if (!rpcUrl) return [];

  // Split the tokens this chain cares about into native + erc20.
  const erc20s: Array<{ symbol: string; address: string; decimals: number }> = [];
  const natives: Array<{ symbol: string; decimals: number }> = [];

  for (const [symbol, chainMap] of Object.entries(TOKEN_ADDRESSES)) {
    const tokenAddress = chainMap[chainId];
    if (!tokenAddress) continue;
    const decimals = TOKEN_DECIMALS[symbol] ?? 18;
    if (tokenAddress === ZERO_ADDRESS) {
      natives.push({ symbol, decimals });
    } else {
      erc20s.push({ symbol, address: tokenAddress, decimals });
    }
  }

  const out: BalanceResult[] = [];

  // ERC20s — one batched request for the whole chain.
  if (erc20s.length > 0) {
    const result = await alchemyRpc<AlchemyGetTokenBalancesResult>(
      rpcUrl,
      "alchemy_getTokenBalances",
      [address, erc20s.map((t) => t.address)]
    );
    if (result?.tokenBalances) {
      for (const entry of result.tokenBalances) {
        if (entry.error) continue;
        const match = erc20s.find(
          (t) => t.address.toLowerCase() === entry.contractAddress.toLowerCase()
        );
        if (!match) continue;
        const value = hexToDecimal(entry.tokenBalance, match.decimals);
        if (value > 0) {
          out.push({ symbol: match.symbol, chainId, balanceFormatted: value });
        }
      }
    }
  }

  // Native — one eth_getBalance per chain. Use the symbol listed in
  // TOKEN_ADDRESSES (ETH for 1/8453/42161/10, POL for 137).
  for (const native of natives) {
    const hex = await alchemyRpc<string>(rpcUrl, "eth_getBalance", [
      address,
      "latest",
    ]);
    const value = hexToDecimal(hex, native.decimals);
    if (value > 0) {
      out.push({
        symbol: native.symbol,
        chainId,
        balanceFormatted: value,
      });
    }
  }

  return out;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!ALCHEMY_API_KEY) {
    console.error("[balances] ALCHEMY_API_KEY not configured");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  const address = request.nextUrl.searchParams.get("address");
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json(
      { error: "Invalid address" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  // Fan out per chain in parallel.
  const chainIds = new Set<number>();
  for (const chainMap of Object.values(TOKEN_ADDRESSES)) {
    for (const chainIdStr of Object.keys(chainMap)) {
      chainIds.add(Number(chainIdStr));
    }
  }

  const perChain = await Promise.all(
    Array.from(chainIds).map((chainId) => fetchChainBalances(chainId, address))
  );

  const balances = perChain
    .flat()
    .map(({ symbol, chainId, balanceFormatted }) => ({
      symbol,
      chainId,
      balance: balanceFormatted.toString(),
      balanceFormatted,
    }))
    .sort((a, b) => b.balanceFormatted - a.balanceFormatted);

  return NextResponse.json(
    { balances },
    { headers: NO_STORE_HEADERS }
  );
}
