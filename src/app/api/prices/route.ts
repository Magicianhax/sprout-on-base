import { NextResponse } from "next/server";

// Minimal price proxy — CoinGecko's free `simple/price` endpoint for the
// handful of non-stable tokens we support. Stables are flat-priced at $1
// client-side so we never hit the network for them. Cached for 60s via
// Next's fetch caching.

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,matic-network,wrapped-bitcoin&vs_currencies=usd";

export async function GET() {
  try {
    const res = await fetch(COINGECKO_URL, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[prices] coingecko ${res.status}`);
      return NextResponse.json({ prices: {} }, { status: 200 });
    }
    const data = (await res.json()) as Record<string, { usd?: number }>;
    const prices: Record<string, number> = {};
    if (typeof data.ethereum?.usd === "number") {
      prices.ETH = data.ethereum.usd;
      prices.WETH = data.ethereum.usd;
    }
    if (typeof data["matic-network"]?.usd === "number") {
      prices.POL = data["matic-network"].usd;
      prices.MATIC = data["matic-network"].usd;
    }
    if (typeof data["wrapped-bitcoin"]?.usd === "number") {
      prices.WBTC = data["wrapped-bitcoin"].usd;
    }
    return NextResponse.json({ prices });
  } catch (err) {
    console.error("[prices] failed", err);
    return NextResponse.json({ prices: {} }, { status: 200 });
  }
}
