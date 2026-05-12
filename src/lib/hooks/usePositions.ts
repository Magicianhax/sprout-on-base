"use client";

import { useCallback, useEffect, useState } from "react";
import type { Position, Vault } from "@/lib/types";
import { fetchPositions } from "@/lib/api/earn";
import { SUPPORTED_CHAIN_IDS } from "@/lib/constants";
import {
  ensureVaultsLoaded,
  getCachedVaults,
  onCachedVaultsChanged,
} from "@/lib/hooks/useVaults";

// Dust filter — anything under 5 cents clutters the UI and can't
// meaningfully be withdrawn (gas would dwarf the amount).
const DUST_THRESHOLD_USD = 0.05;

// Stable-symbol price lookup — mirrors usePrices' hardcoded
// list so the positions builder can compute USD values for
// on-chain LST/LRT/stable-wrapper holdings without a round
// trip through a hook.
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

let livePrices: Record<string, number> = { ...STABLE_PRICES };
let pricesFetchedAt = 0;
const PRICE_CACHE_MS = 60_000;

async function refreshPrices(): Promise<void> {
  if (Date.now() - pricesFetchedAt < PRICE_CACHE_MS) return;
  try {
    const res = await fetch("/api/prices");
    if (!res.ok) return;
    const body = (await res.json()) as { prices?: Record<string, number> };
    livePrices = { ...STABLE_PRICES, ...(body.prices ?? {}) };
    pricesFetchedAt = Date.now();
  } catch {
    // keep what we have
  }
}

function priceFor(symbol: string): number {
  return livePrices[symbol.toUpperCase()] ?? 0;
}

function baseUnitsToFloat(raw: string, decimals: number): number {
  if (!raw) return 0;
  try {
    const big = BigInt(raw);
    if (big === BigInt(0)) return 0;
    return Number(big) / Math.pow(10, decimals);
  } catch {
    return 0;
  }
}

interface HeldVaultEntry {
  address: string;
  shareBalance: string;
  underlyingAmount: string | null;
}

async function fetchHeldVaults(
  walletAddress: string,
  chainId: number,
  vaultAddresses: string[]
): Promise<HeldVaultEntry[]> {
  if (vaultAddresses.length === 0) return [];
  try {
    const res = await fetch("/api/vault-shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chainId,
        address: walletAddress,
        vaults: vaultAddresses,
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { held?: HeldVaultEntry[] };
    return data.held ?? [];
  } catch {
    return [];
  }
}

// Module-level shared cache + pub-sub so every usePositions()
// consumer sees the same state and reacts to updates from any
// caller (e.g. the withdraw flow optimistically removing a
// redeemed position).
const cache = new Map<string, Position[]>();
const inflight = new Map<string, Promise<Position[]>>();
const subscribers = new Map<string, Set<(positions: Position[]) => void>>();

// Tombstones for recently-withdrawn positions. LI.FI's /positions
// endpoint has 5-60s indexer lag after an on-chain redeem, and
// Alchemy's /api/vault-shares can also lag a block or two — both
// would resurrect a position we optimistically removed. A tombstone
// blocks reconstruction for up to TOMBSTONE_TTL_MS after the
// optimistic removal, by which point both indexers should reflect
// the zeroed balance.
//
// Keyed by `${walletLower}:${chainId}:${target}` where `target` is
// either the vaultAddress (when we have it) or an asset-address
// fallback for legacy callers.
const tombstones = new Map<string, number>();
const TOMBSTONE_TTL_MS = 120_000;

function tombstoneKey(
  address: string,
  chainId: number,
  target: string
): string {
  return `${address.toLowerCase()}:${chainId}:${target.toLowerCase()}`;
}

function isTombstoned(
  address: string,
  chainId: number,
  target: string | undefined
): boolean {
  if (!target) return false;
  const key = tombstoneKey(address, chainId, target);
  const ts = tombstones.get(key);
  if (!ts) return false;
  if (Date.now() - ts > TOMBSTONE_TTL_MS) {
    tombstones.delete(key);
    return false;
  }
  return true;
}

function clearTombstonesForVault(
  address: string,
  chainId: number,
  vaultAddress: string | undefined,
  assetAddress: string | undefined
): void {
  if (vaultAddress) {
    tombstones.delete(tombstoneKey(address, chainId, vaultAddress));
  }
  if (assetAddress) {
    tombstones.delete(tombstoneKey(address, chainId, assetAddress));
  }
}

function notify(address: string) {
  const list = cache.get(address) ?? [];
  const subs = subscribers.get(address);
  if (!subs) return;
  for (const cb of subs) cb(list);
}

function subscribe(
  address: string,
  cb: (positions: Position[]) => void
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

/**
 * LI.FI's /positions endpoint returns `protocolName` in mixed
 * casing ("yo-protocol", "morpho-v1", "Moonwell"), while the
 * vaults endpoint uses its own canonical form. We match case-
 * insensitively and use the vault cache's name as the source
 * of truth so downstream components (PositionCard, withdraw
 * flows) don't have to worry about casing drift.
 */
function findMatchingVault(
  position: Position,
  vaults: Vault[]
): Vault | null {
  const assetAddr = position.asset.address.toLowerCase();
  const proto = position.protocolName.toLowerCase();
  // Prefer an exact protocol-name match so we pick the right
  // vault when multiple protocols share an underlying on the
  // same chain (Morpho USDC vs Yo USDC on Base, etc.).
  const byProtocol = vaults.find(
    (v) =>
      v.chainId === position.chainId &&
      v.protocol.name.toLowerCase() === proto &&
      v.underlyingTokens.some((t) => t.address.toLowerCase() === assetAddr)
  );
  if (byProtocol) return byProtocol;
  // Fall back to underlying-only match. Only reliable when a
  // single vault in the cache holds that asset on that chain;
  // otherwise we leave vaultAddress unset and the withdraw
  // flow falls through to its fallback resolution path.
  const candidates = vaults.filter(
    (v) =>
      v.chainId === position.chainId &&
      v.underlyingTokens.some((t) => t.address.toLowerCase() === assetAddr)
  );
  return candidates.length === 1 ? candidates[0] : null;
}

/**
 * Decorate each LI.FI position with a `vaultAddress` pulled
 * from the shared vault cache whenever we can resolve it
 * unambiguously. Used by the withdraw flows (useWithdrawFlow
 * and useSmartWithdrawFlow's `matchVault`) to go straight to
 * the correct share-token address without re-matching.
 */
function decorateWithVaultAddresses(positions: Position[]): Position[] {
  const vaults = getCachedVaults();
  if (vaults.length === 0) return positions;
  return positions.map((p) => {
    const vault = findMatchingVault(p, vaults);
    if (!vault) return p;
    return {
      ...p,
      protocolName: vault.protocol.name,
      vaultAddress: vault.address,
    };
  });
}

/**
 * Build synthetic positions by querying on-chain wallet holdings
 * of every cached vault share token (LSTs like weETH/wstETH,
 * LRTs like ezETH, staked stables like sUSDe/sDAI, aTokens,
 * any ERC4626 wrapper LI.FI's catalog knows about). Anything
 * LI.FI's /positions endpoint didn't already report gets
 * folded into the result as a first-class position.
 *
 * This covers protocols like EtherFi where the "position" is
 * literally an ERC20 balance in the user's wallet rather than
 * a separately-tracked stake. Without this supplement those
 * users would see $0 earning even while they hold the wrapped
 * token.
 */
async function augmentWithOnChainHoldings(
  walletAddress: string,
  existing: Position[]
): Promise<Position[]> {
  const vaults = getCachedVaults();
  if (vaults.length === 0) return existing;

  await refreshPrices();

  // Bucket vaults by chain so we can batch one /api/vault-shares
  // call per chain. Each call runs getTokenBalances + batched
  // convertToAssets, same machinery the old on-chain builder
  // used, but now we only add what LI.FI missed.
  const byChain = new Map<number, Vault[]>();
  for (const v of vaults) {
    if (
      !SUPPORTED_CHAIN_IDS.includes(
        v.chainId as typeof SUPPORTED_CHAIN_IDS[number]
      )
    ) {
      continue;
    }
    const bucket = byChain.get(v.chainId);
    if (bucket) bucket.push(v);
    else byChain.set(v.chainId, [v]);
  }

  // Index what LI.FI already reported by vault address so we
  // don't double-count — LI.FI positions that have been
  // decorated with a vaultAddress win on conflicts, and any
  // share-balance we find on-chain for those just updates
  // `shareBalanceRaw` so withdraw has a cached redeem amount.
  const lifiByVault = new Map<string, number>();
  existing.forEach((p, idx) => {
    if (p.vaultAddress) {
      lifiByVault.set(p.vaultAddress.toLowerCase(), idx);
    }
  });

  const perChainHeld = await Promise.all(
    Array.from(byChain.entries()).map(async ([chainId, chainVaults]) => {
      const heldEntries = await fetchHeldVaults(
        walletAddress,
        chainId,
        chainVaults.map((v) => v.address)
      );
      return { chainId, chainVaults, heldEntries };
    })
  );

  const result: Position[] = existing.map((p) => ({ ...p }));

  for (const { chainVaults, heldEntries } of perChainHeld) {
    for (const entry of heldEntries) {
      const vault = chainVaults.find(
        (v) => v.address.toLowerCase() === entry.address.toLowerCase()
      );
      if (!vault) continue;
      const underlying = vault.underlyingTokens[0];
      if (!underlying) continue;

      const key = vault.address.toLowerCase();
      const existingIdx = lifiByVault.get(key);

      if (existingIdx !== undefined) {
        // Already on the list — just fold in the raw share
        // balance so executeVaultWithdraw doesn't have to
        // re-read it later.
        result[existingIdx] = {
          ...result[existingIdx],
          shareBalanceRaw: entry.shareBalance,
        };
        continue;
      }

      // Synthetic position — wrap the held share into a
      // Position record. Balance comes from convertToAssets
      // (falls back to raw shares if the call errored out),
      // USD comes from the underlying asset's price.
      const rawUnderlying =
        entry.underlyingAmount ??
        (() => {
          try {
            return BigInt(entry.shareBalance).toString();
          } catch {
            return "0";
          }
        })();
      const native = baseUnitsToFloat(rawUnderlying, underlying.decimals);
      if (!(native > 0)) continue;
      const usd = native * priceFor(underlying.symbol);
      if (!(usd >= DUST_THRESHOLD_USD)) continue;

      result.push({
        chainId: vault.chainId,
        protocolName: vault.protocol.name,
        asset: {
          address: underlying.address,
          name: underlying.symbol,
          symbol: underlying.symbol,
          decimals: underlying.decimals,
        },
        balanceUsd: usd.toFixed(6),
        balanceNative: native.toString(),
        vaultAddress: vault.address,
        shareBalanceRaw: entry.shareBalance,
      });
    }
  }

  // Sort by USD value desc so the biggest position shows first.
  result.sort(
    (a, b) =>
      parseFloat(b.balanceUsd || "0") - parseFloat(a.balanceUsd || "0")
  );
  return result;
}

function applyTombstones(
  address: string,
  positions: Position[]
): Position[] {
  return positions.filter((p) => {
    // Block on either vaultAddress (precise) or asset.address
    // (fallback when LI.FI position hasn't been decorated with a
    // vault match yet). Full-withdraw optimistic removal writes
    // both keys, so either hit suppresses the resurrected entry.
    if (isTombstoned(address, p.chainId, p.vaultAddress)) return false;
    if (isTombstoned(address, p.chainId, p.asset.address)) return false;
    return true;
  });
}

async function loadPositionsFromLifi(
  address: string
): Promise<Position[]> {
  // Kick the vault stream if nobody else has — we need it to
  // resolve vault addresses AND to find any LST/LRT/wrapper
  // holdings LI.FI's /positions endpoint missed. Idempotent.
  ensureVaultsLoaded();

  const data = await fetchPositions(address);
  const supported = (data.positions ?? []).filter((p) =>
    SUPPORTED_CHAIN_IDS.includes(
      p.chainId as typeof SUPPORTED_CHAIN_IDS[number]
    )
  );
  const meaningful = supported.filter((p) => {
    const usd = parseFloat(p.balanceUsd || "0");
    return Number.isFinite(usd) && usd >= DUST_THRESHOLD_USD;
  });
  const decorated = decorateWithVaultAddresses(meaningful);
  const augmented = await augmentWithOnChainHoldings(address, decorated);
  return applyTombstones(address, augmented);
}

// When a load is already running and someone asks for a fresh
// rebuild (e.g. vault stream advanced), we flip this flag so
// the inflight promise re-runs itself once it settles instead
// of starting a second concurrent build. Classic coalesce.
const staleFlags = new Set<string>();

async function loadPositions(address: string): Promise<Position[]> {
  const existing = inflight.get(address);
  if (existing) {
    staleFlags.add(address);
    return existing;
  }

  const promise = loadPositionsFromLifi(address)
    .then((result) => {
      cache.set(address, result);
      inflight.delete(address);
      notify(address);
      if (staleFlags.has(address)) {
        staleFlags.delete(address);
        void loadPositions(address);
      }
      return result;
    })
    .catch((err) => {
      inflight.delete(address);
      staleFlags.delete(address);
      throw err;
    });

  inflight.set(address, promise);
  return promise;
}

/**
 * Optimistically add a position to the cache after a successful
 * deposit. LI.FI's /positions endpoint takes 5-60s to index a new
 * deposit, and our on-chain augmentation can only find the vault
 * if it's in the cached vault list — small vaults loaded via URL
 * may never have streamed in, so we seed it here too.
 *
 * Clears any tombstone for this (wallet, chain, vault) so a user
 * who withdraws and re-deposits into the same vault within the
 * tombstone window sees their new position immediately.
 */
export function optimisticallyAddPosition(
  address: string,
  params: {
    vault: Vault;
    underlyingAmount: number;
    shareBalanceRaw?: string;
    priceUsd?: number;
  }
): void {
  const { vault, underlyingAmount, shareBalanceRaw, priceUsd } = params;
  const underlying = vault.underlyingTokens[0];
  if (!underlying) return;

  const usd = underlyingAmount * (priceUsd ?? priceFor(underlying.symbol));
  if (!(usd >= DUST_THRESHOLD_USD)) return;

  // Clear any tombstone so a re-deposit into a recently-withdrawn
  // vault doesn't get filtered back out on the next resync.
  clearTombstonesForVault(
    address,
    vault.chainId,
    vault.address,
    underlying.address
  );

  const optimistic: Position = {
    chainId: vault.chainId,
    protocolName: vault.protocol.name,
    asset: {
      address: underlying.address,
      name: underlying.symbol,
      symbol: underlying.symbol,
      decimals: underlying.decimals,
    },
    balanceUsd: usd.toFixed(6),
    balanceNative: underlyingAmount.toString(),
    vaultAddress: vault.address,
    shareBalanceRaw,
  };

  const current = cache.get(address) ?? [];
  const vaultKey = vault.address.toLowerCase();
  // Upsert — if we already show a position for this vault, prefer
  // the larger balance (covers the "deposit more into existing
  // position" flow — the UI shouldn't downgrade the number).
  const existingIdx = current.findIndex(
    (p) =>
      p.chainId === vault.chainId &&
      p.vaultAddress?.toLowerCase() === vaultKey
  );
  const next = [...current];
  if (existingIdx >= 0) {
    const existing = current[existingIdx];
    const existingUsd = parseFloat(existing.balanceUsd || "0");
    if (existingUsd >= usd) {
      // Our optimistic value is smaller than what we already show —
      // leave the existing entry alone, but refresh its
      // shareBalanceRaw if we have a newer reading.
      if (shareBalanceRaw) {
        next[existingIdx] = { ...existing, shareBalanceRaw };
      }
    } else {
      next[existingIdx] = optimistic;
    }
  } else {
    next.unshift(optimistic);
  }
  cache.set(address, next);
  notify(address);
}

// Optimistically remove a position from the cache (used by the
// withdraw flow on success — the on-chain event takes a few
// seconds for any indexer to pick up, and we don't want the UI
// to lie in the meantime). Also writes a tombstone so the next
// few rounds of invalidatePositions don't resurrect this entry
// while LI.FI and Alchemy catch up.
export function optimisticallyRemovePosition(
  address: string,
  chainId: number,
  assetAddress: string,
  protocolName: string,
  vaultAddress?: string
) {
  const current = cache.get(address);
  if (current) {
    const next = current.filter(
      (p) =>
        !(
          p.chainId === chainId &&
          p.asset.address.toLowerCase() === assetAddress.toLowerCase() &&
          p.protocolName.toLowerCase() === protocolName.toLowerCase()
        )
    );
    cache.set(address, next);
    notify(address);
  }
  // Record the tombstone even when there's no cache yet — a load
  // that completes after this call still needs to respect it.
  const now = Date.now();
  if (vaultAddress) {
    tombstones.set(tombstoneKey(address, chainId, vaultAddress), now);
  }
  tombstones.set(tombstoneKey(address, chainId, assetAddress), now);
}

// Force a fresh fetch. If a load is already running, we flag it
// stale via the coalesce machinery in `loadPositions` instead of
// starting a second parallel build.
export function invalidatePositions(address: string): Promise<Position[]> {
  if (inflight.has(address)) {
    staleFlags.add(address);
    return inflight.get(address)!;
  }
  cache.delete(address);
  return loadPositions(address);
}

// Coalesce rapid vault-stream bursts into a single re-decorate.
// New vault pages give us more cached vaults to resolve
// protocol names + vault addresses against, but we don't need
// to refetch positions — just re-decorate what's already in the
// cache. 600ms debounce keeps the burst cost near-zero.
let vaultChangeDebounce: ReturnType<typeof setTimeout> | null = null;
const VAULT_CHANGE_DEBOUNCE_MS = 600;

onCachedVaultsChanged(() => {
  if (vaultChangeDebounce) clearTimeout(vaultChangeDebounce);
  vaultChangeDebounce = setTimeout(() => {
    vaultChangeDebounce = null;
    for (const [addr, positions] of cache.entries()) {
      const decorated = decorateWithVaultAddresses(positions);
      const changed =
        decorated.length !== positions.length ||
        decorated.some(
          (p, i) =>
            p.protocolName !== positions[i]?.protocolName ||
            p.vaultAddress !== positions[i]?.vaultAddress
        );
      if (changed) {
        cache.set(addr, decorated);
        notify(addr);
      }
    }
  }, VAULT_CHANGE_DEBOUNCE_MS);
});

export function usePositions(address: string | undefined) {
  const [positions, setPositions] = useState<Position[]>(() =>
    address && cache.has(address) ? cache.get(address)! : []
  );
  const [loading, setLoading] = useState(
    () => Boolean(address) && !cache.has(address ?? "")
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }

    let cancelled = false;

    if (cache.has(address)) {
      setPositions(cache.get(address)!);
      setLoading(false);
    } else {
      setLoading(true);
      setError(null);
    }

    loadPositions(address)
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Couldn't load your positions"
        );
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    const unsub = subscribe(address, (next) => {
      if (cancelled) return;
      setPositions(next);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [address]);

  const reload = useCallback(() => {
    if (!address) return;
    setLoading(true);
    setError(null);
    invalidatePositions(address)
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Couldn't load your positions"
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [address]);

  const totalBalance = positions.reduce(
    (sum, p) => sum + parseFloat(p.balanceUsd || "0"),
    0
  );

  return { positions, loading, error, reload, totalBalance };
}
