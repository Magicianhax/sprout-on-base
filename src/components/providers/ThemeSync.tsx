"use client";

import { useEffect, useState } from "react";
import { usePreferences } from "@/lib/hooks/usePreferences";

// Applies the dark-mode class to <html> based on stored preferences.
// The initial class is set synchronously by /theme-init.js in the head
// so the first paint matches. This component only handles runtime
// changes (e.g. toggling the setting in Settings).
export function ThemeSync() {
  const { preferences } = usePreferences();
  const [hydrated, setHydrated] = useState(false);

  // Mark hydrated after the first commit so we don't clobber the class
  // that theme-init.js already set while preferences are still loading
  // from localStorage.
  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    if (preferences.darkMode) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [preferences.darkMode, hydrated]);

  return null;
}
