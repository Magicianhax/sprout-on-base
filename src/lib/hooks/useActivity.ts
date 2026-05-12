"use client";

import { useCallback, useEffect, useState } from "react";
import type { ActivityGroup, ActivityResponse } from "@/lib/types";

// Shared activity feed — same pub-sub pattern as usePositions / useVaults
// so every subscriber gets live updates when any caller reloads.
const cache = new Map<string, ActivityGroup[]>();
const inflight = new Map<string, Promise<ActivityGroup[]>>();
const subscribers = new Map<string, Set<(records: ActivityGroup[]) => void>>();

function notify(address: string) {
  const list = cache.get(address) ?? [];
  const subs = subscribers.get(address);
  if (!subs) return;
  for (const cb of subs) cb(list);
}

function subscribe(
  address: string,
  cb: (records: ActivityGroup[]) => void
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

async function loadActivity(address: string): Promise<ActivityGroup[]> {
  const existing = inflight.get(address);
  if (existing) return existing;

  const promise = fetch(`/api/activity?address=${address}`, { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) throw new Error(`Activity error: ${res.status}`);
      const body = (await res.json()) as ActivityResponse;
      const records = Array.isArray(body.data) ? body.data : [];
      cache.set(address, records);
      inflight.delete(address);
      notify(address);
      return records;
    })
    .catch((err) => {
      inflight.delete(address);
      throw err;
    });

  inflight.set(address, promise);
  return promise;
}

export function invalidateActivity(address: string): Promise<ActivityGroup[]> {
  cache.delete(address);
  inflight.delete(address);
  return loadActivity(address);
}

export function useActivity(address: string | undefined) {
  const [records, setRecords] = useState<ActivityGroup[]>(() =>
    address && cache.has(address) ? cache.get(address)! : []
  );
  const [loading, setLoading] = useState(
    () => Boolean(address) && !cache.has(address ?? "")
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    // Show cached data instantly — fresh fetch fills in over the top
    // via the subscribe callback.
    if (cache.has(address)) {
      setRecords(cache.get(address)!);
      setLoading(false);
    } else {
      setLoading(true);
      setError(null);
    }

    // Always kick a fresh fetch on mount so any post-tx navigation
    // reflects the latest state (Alchemy indexer lag ~5–15s).
    loadActivity(address)
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Couldn't load activity");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    const unsub = subscribe(address, (next) => {
      if (cancelled) return;
      setRecords(next);
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
    invalidateActivity(address)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Couldn't load activity");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [address]);

  return { records, loading, error, reload };
}
