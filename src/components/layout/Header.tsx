"use client";

import { useRouter } from "next/navigation";
import { usePrivy } from "@/lib/wallet";
import { usePreferences } from "@/lib/hooks/usePreferences";

function initialFor(email?: string, address?: string): string {
  if (email) return email.charAt(0).toUpperCase();
  if (address) return address.charAt(2).toUpperCase();
  return "S";
}

// Deterministic gradient seeded by the wallet address so every user
// gets their own avatar color without ever leaking identity.
function gradientFor(seed?: string): string {
  if (!seed) {
    return "linear-gradient(135deg, #81C784 0%, #4CAF50 100%)";
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `linear-gradient(135deg, hsl(${hue}, 55%, 68%) 0%, hsl(${(hue + 30) % 360}, 60%, 48%) 100%)`;
}

export function Header() {
  const router = useRouter();
  const { user } = usePrivy();
  const { preferences, update } = usePreferences();

  const isPro = preferences.mode === "pro";
  const email = user?.email?.address;
  const address = user?.wallet?.address;
  const initial = initialFor(email, address);
  const gradient = gradientFor(address);

  function toggleMode() {
    update({ mode: isPro ? "lite" : "pro" });
  }

  return (
    <>
      <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-40 flex justify-between items-center px-5 pt-4 pb-3 bg-sprout-card/80 backdrop-blur-md border-b border-sprout-border/50">
        <button
          type="button"
          onClick={() => router.push("/home")}
          className="font-heading text-xl font-800 text-sprout-green-dark cursor-pointer leading-none"
          aria-label="Home"
        >
          sprout
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMode}
            className="relative flex items-center bg-sprout-card border border-sprout-border rounded-pill p-0.5 shadow-subtle cursor-pointer"
            aria-label={`Switch to ${isPro ? "Lite" : "Pro"} mode`}
          >
            <span
              className={`px-2.5 py-0.5 rounded-pill text-[11px] font-bold transition-colors ${
                !isPro ? "bg-sprout-green-primary text-white" : "text-sprout-text-muted"
              }`}
            >
              LITE
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-pill text-[11px] font-bold transition-colors ${
                isPro ? "bg-sprout-green-primary text-white" : "text-sprout-text-muted"
              }`}
            >
              PRO
            </span>
          </button>

          <button
            type="button"
            onClick={() => router.push("/settings")}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-subtle border-2 border-sprout-card cursor-pointer"
            style={{ background: gradient }}
            aria-label="Account settings"
          >
            {initial}
          </button>
        </div>
      </header>
      {/* Spacer so content inside each page flows below the fixed header
          without every page needing its own top padding. */}
      <div className="h-[64px]" aria-hidden="true" />
    </>
  );
}
