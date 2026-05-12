"use client";

import { WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <main className="min-h-dvh bg-sprout-gradient flex flex-col items-center justify-center px-5">
      <div className="w-16 h-16 rounded-full bg-sprout-card border border-sprout-border flex items-center justify-center mb-5 shadow-subtle">
        <WifiOff size={28} strokeWidth={2.25} className="text-sprout-text-muted" />
      </div>
      <h1 className="font-heading text-2xl font-800 text-sprout-text-primary text-center">
        You&apos;re offline
      </h1>
      <p className="text-sm text-sprout-text-muted text-center mt-2 max-w-[300px] leading-relaxed">
        Sprout needs an internet connection to fetch vault rates and positions.
        Reconnect and try again.
      </p>
      <button
        type="button"
        onClick={() => {
          if (typeof window !== "undefined") window.location.reload();
        }}
        className="mt-6 rounded-button px-6 py-3 text-sm font-bold bg-gradient-to-br from-sprout-green-primary to-[#66BB6A] text-white shadow-glow cursor-pointer active:scale-[0.97] transition-transform"
      >
        Retry
      </button>
    </main>
  );
}
