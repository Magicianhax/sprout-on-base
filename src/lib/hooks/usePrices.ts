"use client";

import { useEffect, useState } from "react";

// Hardcoded $1 for stablecoins — no network round trip, and correct to
// within a few basis points for our supported set.
const STABLE_PRICES: Record<string, number> = {
  USDC: 1,
  "USDC.E": 1,
  USDT: 1,
  USDT0: 1,
  DAI: 1,
  USDS: 1,
  FRAX: 1,
  LUSD: 1,
  CRVUSD: 1,
  GHO: 1,
  PYUSD: 1,
  TUSD: 1,
};

let cached: Record<string, number> | null = null;
let inflight: Promise<Record<string, number>> | null = null;

async function loadPrices(): Promise<Record<string, number>> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = fetch("/api/prices")
    .then((r) => (r.ok ? r.json() : { prices: {} }))
    .then((body: { prices?: Record<string, number> }) => {
      const merged = { ...STABLE_PRICES, ...(body.prices ?? {}) };
      cached = merged;
      inflight = null;
      return merged;
    })
    .catch(() => {
      inflight = null;
      return { ...STABLE_PRICES };
    });

  return inflight;
}

export function usePrices() {
  const [prices, setPrices] = useState<Record<string, number>>(
    () => cached ?? STABLE_PRICES
  );

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    loadPrices().then((p) => {
      if (!cancelled) setPrices(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return prices;
}

export function priceFor(
  prices: Record<string, number>,
  symbol: string
): number {
  return prices[symbol.toUpperCase()] ?? 0;
}
