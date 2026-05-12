"use client";
import { useCallback, useEffect, useState } from "react";

export interface TokenBalance {
  symbol: string;
  chainId: number;
  balance: string;
  balanceFormatted: number;
}

// Module-level shared cache + pub-sub — matches usePositions /
// useActivity / useVaults. Consumers always see fresh data after
// any caller invalidates.
const cache = new Map<string, TokenBalance[]>();
const inflight = new Map<string, Promise<TokenBalance[]>>();
const subscribers = new Map<string, Set<(balances: TokenBalance[]) => void>>();

function notify(address: string) {
  const list = cache.get(address) ?? [];
  const subs = subscribers.get(address);
  if (!subs) return;
  for (const cb of subs) cb(list);
}

function subscribe(
  address: string,
  cb: (balances: TokenBalance[]) => void
): () => void {
  let subs = subscribers.get(address);
  if (!subs) {
    subs = new Set();
    subscribers.set(address, subs);
  }
  subs.add(cb);
  return () => {
    subs!.delete(cb);
  };
}

async function loadBalances(address: string): Promise<TokenBalance[]> {
  const existing = inflight.get(address);
  if (existing) return existing;

  const promise = fetch(`/api/balances?address=${address}`, { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : { balances: [] }))
    .then((data: { balances?: TokenBalance[] }) => {
      const balances = data.balances ?? [];
      cache.set(address, balances);
      inflight.delete(address);
      notify(address);
      return balances;
    })
    .catch(() => {
      inflight.delete(address);
      const fallback = cache.get(address) ?? [];
      return fallback;
    });

  inflight.set(address, promise);
  return promise;
}

export function invalidateBalances(address: string): Promise<TokenBalance[]> {
  cache.delete(address);
  inflight.delete(address);
  return loadBalances(address);
}

export function useBalances(address: string | undefined) {
  const [balances, setBalances] = useState<TokenBalance[]>(() =>
    address && cache.has(address) ? cache.get(address)! : []
  );
  const [loading, setLoading] = useState(
    () => Boolean(address) && !cache.has(address ?? "")
  );

  useEffect(() => {
    if (!address) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    // Show cached data instantly; fresh fetch fills in over the top.
    if (cache.has(address)) {
      setBalances(cache.get(address)!);
      setLoading(false);
    } else {
      setLoading(true);
    }

    loadBalances(address).finally(() => {
      if (cancelled) return;
      setLoading(false);
    });

    const unsub = subscribe(address, (next) => {
      if (cancelled) return;
      setBalances(next);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [address]);

  const reload = useCallback(() => {
    if (!address) return;
    setLoading(true);
    invalidateBalances(address).finally(() => {
      setLoading(false);
    });
  }, [address]);

  return { balances, loading, reload };
}
