"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("[sprout] route error", error);
  }, [error]);

  return (
    <main className="min-h-dvh bg-sprout-gradient flex flex-col items-center justify-center px-5">
      <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mb-4">
        <AlertTriangle size={28} strokeWidth={2.5} className="text-amber-600" />
      </div>
      <h1 className="font-heading text-2xl font-800 text-sprout-text-primary text-center">
        Something went sideways
      </h1>
      <p className="text-sm text-sprout-text-muted text-center mt-2 max-w-[320px] leading-relaxed">
        We hit an unexpected error rendering this page. Your funds are safe —
        this is a UI-only hiccup.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex items-center gap-2 rounded-button px-6 py-3 text-sm font-bold bg-gradient-to-br from-sprout-green-primary to-[#66BB6A] text-white shadow-glow cursor-pointer active:scale-[0.97] transition-transform"
      >
        <RefreshCw size={14} strokeWidth={2.5} />
        Try again
      </button>
      {error.digest && (
        <p className="mt-6 text-[10px] font-mono text-sprout-text-muted">
          ref: {error.digest}
        </p>
      )}
    </main>
  );
}
