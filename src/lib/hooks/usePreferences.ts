"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { UserPreferences } from "@/lib/types";
import { loadPreferences, updatePreferences as updateStore } from "@/stores/preferences";
import { DEFAULT_PREFERENCES } from "@/lib/constants";

// Module-level shared state + pub-sub so every component that calls
// usePreferences() sees updates from any other caller (e.g. Settings
// flipping dark mode should immediately re-run ThemeSync). Exposed via
// React's `useSyncExternalStore` for tear-free reads under concurrent
// rendering and React 19 strictness.

let current: UserPreferences = DEFAULT_PREFERENCES;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrateOnce() {
  if (hydrated || typeof window === "undefined") return;
  current = loadPreferences();
  hydrated = true;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): UserPreferences {
  hydrateOnce();
  return current;
}

function getServerSnapshot(): UserPreferences {
  return DEFAULT_PREFERENCES;
}

function notify() {
  for (const listener of listeners) listener();
}

export function usePreferences() {
  const preferences = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = useCallback((partial: Partial<UserPreferences>) => {
    current = updateStore(partial);
    notify();
    return current;
  }, []);

  return { preferences, update };
}
