"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Vault, SortBy } from "@/lib/types";
import { fetchVaultsStreaming } from "@/lib/api/earn";
import { parseTvl, getRiskLevel } from "@/lib/format";
import { VAULT_MAX_PAGES, VAULT_PAGE_SIZE } from "@/lib/constants";

interface UseVaultsOptions {
  chainIds?: number[];
  sortBy?: SortBy;
  riskLevel?: "low" | "medium" | "high";
  token?: string;
}

// Shared stream state keyed by fetch scope (asset token only — chain,
// sort, and risk are client-side so they don't belong in the key).
// Components subscribe via useVaults() and see cumulative updates as
// each API page lands.
interface StreamState {
  vaults: Vault[];
  done: boolean;
  error: Error | null;
}

const EMPTY_STATE: StreamState = { vaults: [], done: false, error: null };

const streams = new Map<string, StreamState>();
const inflight = new Map<string, Promise<Vault[]>>();
const subscribers = new Map<string, Set<(s: StreamState) => void>>();

function keyOf(token?: string): string {
  return token ?? "__all__";
}

/**
 * Kick the full (unfiltered) vault stream without needing to
 * subscribe as a component. Used by usePositions so it can build
 * positions from on-chain share balances even on pages that never
 * mount useVaults directly (e.g. /portfolio).
 */
export function ensureVaultsLoaded(): void {
  startStream(undefined);
}

/**
 * Read-only accessor for the shared vault cache used by other
 * hooks that need to cross-reference vault metadata (e.g.
 * usePositions remapping LI.FI's mis-labelled protocolName).
 * Returns a merged, de-duped list across all stream keys.
 */
export function getCachedVaults(): Vault[] {
  const seen = new Set<string>();
  const out: Vault[] = [];
  for (const state of streams.values()) {
    for (const v of state.vaults) {
      const key = `${v.chainId}-${v.address.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}

/**
 * Forcibly add a set of vaults to the cache under a dedicated
 * "seeded" stream key. Used by the deposit flow so a vault the
 * user just deposited into is guaranteed to be probed by the
 * positions builder's augmentWithOnChainHoldings path even if it
 * sat on page 8 of the TVL-sorted stream and never paged in.
 *
 * Seeded vaults persist for the whole session — we never evict
 * them. Invalidating the catalog streams (invalidateAllVaults)
 * clears the network-backed streams but leaves seeded vaults
 * alone, so a post-deposit refresh doesn't drop the user's fresh
 * position.
 */
const SEEDED_KEY = "__seeded__";
export function seedVaultsIntoCache(vaults: Vault[]): void {
  if (vaults.length === 0) return;
  const existing = streams.get(SEEDED_KEY)?.vaults ?? [];
  const byKey = new Map<string, Vault>();
  for (const v of existing) {
    byKey.set(`${v.chainId}-${v.address.toLowerCase()}`, v);
  }
  let changed = false;
  for (const v of vaults) {
    const key = `${v.chainId}-${v.address.toLowerCase()}`;
    if (!byKey.has(key)) {
      byKey.set(key, v);
      changed = true;
    }
  }
  if (!changed) return;
  setState(SEEDED_KEY, {
    vaults: Array.from(byKey.values()),
    done: true,
    error: null,
  });
}

/**
 * Clear every vault stream and any inflight fetch, then re-kick a
 * fresh stream for every key that had active subscribers. Used by
 * the app-wide refresh flow so the vault grid immediately reloads
 * from the API instead of waiting for a remount.
 */
export function invalidateAllVaults(): void {
  const activeKeys = Array.from(subscribers.keys()).filter(
    (k) => (subscribers.get(k)?.size ?? 0) > 0
  );
  // Preserve seeded vaults across a full invalidation — those came
  // from the user's own deposits and must stick around so the
  // positions builder keeps probing their share balances.
  const preservedSeeded = streams.get(SEEDED_KEY);
  streams.clear();
  inflight.clear();
  if (preservedSeeded) {
    streams.set(SEEDED_KEY, preservedSeeded);
  }
  for (const [key, subs] of subscribers.entries()) {
    if (key === SEEDED_KEY) continue;
    for (const cb of subs) cb(EMPTY_STATE);
  }
  for (const key of activeKeys) {
    if (key === SEEDED_KEY) continue;
    // "__all__" was stored as undefined token; restore it.
    const token = key === "__all__" ? undefined : key;
    startStream(token);
  }
}

// Cross-module listeners that get called on every vault stream
// update. Used by usePositions to re-run protocol-name remapping
// as pages of vaults stream in.
const globalListeners = new Set<() => void>();

export function onCachedVaultsChanged(cb: () => void): () => void {
  globalListeners.add(cb);
  return () => {
    globalListeners.delete(cb);
  };
}

function setState(key: string, state: StreamState) {
  streams.set(key, state);
  const subs = subscribers.get(key);
  if (subs) {
    for (const cb of subs) cb(state);
  }
  for (const cb of globalListeners) cb();
}

function startStream(token: string | undefined) {
  const key = keyOf(token);
  const existing = streams.get(key);
  if (existing?.done && !existing.error) return;
  if (inflight.has(key)) return;

  setState(key, { vaults: existing?.vaults ?? [], done: false, error: null });

  const promise = fetchVaultsStreaming(
    { pageSize: VAULT_PAGE_SIZE, maxPages: VAULT_MAX_PAGES, asset: token },
    (cumulative) => {
      setState(key, { vaults: cumulative, done: false, error: null });
    }
  )
    .then((final) => {
      setState(key, { vaults: final, done: true, error: null });
      inflight.delete(key);
      return final;
    })
    .catch((err) => {
      const error = err instanceof Error ? err : new Error(String(err));
      setState(key, {
        vaults: streams.get(key)?.vaults ?? [],
        done: true,
        error,
      });
      inflight.delete(key);
      throw error;
    });

  inflight.set(key, promise);
}

function subscribe(token: string | undefined, cb: (s: StreamState) => void): () => void {
  const key = keyOf(token);
  let subs = subscribers.get(key);
  if (!subs) {
    subs = new Set();
    subscribers.set(key, subs);
  }
  subs.add(cb);
  return () => {
    subs!.delete(cb);
  };
}

export function useVaults(options: UseVaultsOptions = {}) {
  const { chainIds, sortBy = "tvl", riskLevel, token } = options;

  const [state, setLocalState] = useState<StreamState>(
    () => streams.get(keyOf(token)) ?? EMPTY_STATE
  );

  useEffect(() => {
    // Sync to the latest value on mount in case another instance
    // already advanced the stream.
    setLocalState(streams.get(keyOf(token)) ?? EMPTY_STATE);
    const unsub = subscribe(token, setLocalState);
    startStream(token);
    return unsub;
  }, [token]);

  const vaults = useMemo(() => {
    let result = state.vaults;

    if (chainIds && chainIds.length > 0) {
      const set = new Set(chainIds);
      result = result.filter((v) => set.has(v.chainId));
    }

    if (riskLevel) {
      result = result.filter((v) => getRiskLevel(v.tags) === riskLevel);
    }

    const sorted = [...result];
    if (sortBy === "apy") {
      sorted.sort((a, b) => b.analytics.apy.total - a.analytics.apy.total);
    } else {
      sorted.sort(
        (a, b) => parseTvl(b.analytics.tvl.usd) - parseTvl(a.analytics.tvl.usd)
      );
    }
    return sorted;
  }, [state.vaults, chainIds, riskLevel, sortBy]);

  const loading = state.vaults.length === 0 && !state.done && !state.error;
  const loadingMore = state.vaults.length > 0 && !state.done && !state.error;
  const error = state.error?.message ?? null;

  const reload = useCallback(() => {
    const key = keyOf(token);
    streams.delete(key);
    inflight.delete(key);
    setLocalState(EMPTY_STATE);
    startStream(token);
  }, [token]);

  return { vaults, loading, loadingMore, error, reload };
}
