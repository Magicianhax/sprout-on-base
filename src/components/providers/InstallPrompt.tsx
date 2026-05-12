"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

// Minimal shape of the beforeinstallprompt event — the spec isn't in
// the lib.dom types yet, so we type it ourselves.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "sprout_install_dismissed_at";
const DISMISS_COOLDOWN_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Respect a recent dismissal
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? "0");
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS) return;

    function handler(e: Event) {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
      setEvent(null);
    }
  }

  function handleDismiss() {
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  }

  if (!visible || !event) return null;

  return (
    <div
      className="fixed bottom-[118px] left-1/2 -translate-x-1/2 w-full max-w-[480px] z-[55] flex justify-center px-5 pointer-events-none"
      aria-live="polite"
    >
      <div className="pointer-events-auto w-full max-w-[420px] flex items-center gap-3 bg-sprout-card border border-sprout-border rounded-2xl px-4 py-3 shadow-card">
        <div className="w-9 h-9 rounded-full bg-sprout-green-light flex items-center justify-center text-sprout-green-dark shrink-0">
          <Download size={16} strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-sprout-text-primary leading-tight">
            Install Sprout
          </p>
          <p className="text-[11px] text-sprout-text-muted leading-tight">
            Add to your home screen for one-tap access.
          </p>
        </div>
        <button
          type="button"
          onClick={handleInstall}
          className="shrink-0 rounded-pill px-3 py-1.5 text-xs font-bold bg-sprout-green-primary text-white cursor-pointer active:scale-[0.97] transition-transform"
        >
          Install
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 p-1 text-sprout-text-muted hover:text-sprout-text-primary cursor-pointer"
          aria-label="Dismiss install prompt"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
