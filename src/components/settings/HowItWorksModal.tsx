"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { SproutLogo } from "@/components/ui/SproutLogo";

interface HowItWorksModalProps {
  open: boolean;
  onClose: () => void;
}

interface Item {
  q: string;
  a: string;
}

const ITEMS: Item[] = [
  {
    q: "What is Sprout?",
    a: "A savings app that puts your crypto to work in audited DeFi yield protocols. Think high-yield savings, built on blockchain rails — non-custodial and transparent.",
  },
  {
    q: "How do you earn yield?",
    a: "Your deposit goes into audited lending or yield vaults (Morpho, Aave, Euler, Pendle, and more). Borrowers pay interest to use your capital, and you receive a share of it automatically.",
  },
  {
    q: "Is my money safe?",
    a: "Sprout never holds your funds — only your wallet can move them. We use audited, battle-tested protocols. That said, DeFi carries smart-contract risk, so only deposit what you can afford to lose.",
  },
  {
    q: "What is APY?",
    a: "Annual Percentage Yield. It's the rate you'd earn in a year if the current conditions held. APY is variable — it goes up and down with demand for loans on each protocol.",
  },
  {
    q: "Can I withdraw anytime?",
    a: "Yes. Tap 'Withdraw' or 'Stop Earning' on any position and you'll receive your tokens back in a single transaction. There are no lockups.",
  },
  {
    q: "What are the fees?",
    a: "Sprout charges zero platform fees. You only pay network gas for each on-chain transaction — typically a few cents on Base.",
  },
  {
    q: "Lite vs Pro mode?",
    a: "Lite mode is optimized for minimum clicks — we pick the highest-TVL Base vault for each token automatically. Pro mode unlocks the full Base vault explorer with filters, APY sorting, manual token choice, and partial withdrawals.",
  },
];

export function HowItWorksModal({ open, onClose }: HowItWorksModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <style>{`
        @keyframes hiw-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes hiw-slide-up {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hiw-backdrop { animation: hiw-fade-in 0.22s ease-out both; }
        .hiw-card { animation: hiw-slide-up 0.28s ease-out both; }
      `}</style>

      <div
        className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm hiw-backdrop"
        aria-modal="true"
        role="dialog"
        onClick={onClose}
      >
        <div
          className="bg-sprout-card rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-[420px] max-h-[85dvh] overflow-y-auto p-6 pb-8 hiw-card relative"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 p-1 rounded-full text-sprout-text-muted hover:text-sprout-text-primary transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>

          <div className="text-center pt-1 mb-5">
            <SproutLogo
              size={56}
              decorative
              className="mx-auto mb-3 shadow-subtle rounded-xl"
            />
            <h2 className="font-heading text-xl font-800 text-sprout-text-primary">
              How Sprout works
            </h2>
            <p className="text-xs text-sprout-text-muted mt-1">
              The short version — no jargon.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {ITEMS.map((item) => (
              <div
                key={item.q}
                className="rounded-2xl bg-sprout-green-light/40 px-4 py-3"
              >
                <p className="text-sm font-bold text-sprout-text-primary">
                  {item.q}
                </p>
                <p className="text-xs text-sprout-text-secondary mt-1.5 leading-relaxed">
                  {item.a}
                </p>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-5 w-full rounded-button py-3 text-sm font-bold bg-gradient-to-br from-sprout-green-primary to-[#66BB6A] text-white shadow-glow cursor-pointer active:scale-[0.97] transition-transform"
          >
            Got it
          </button>
        </div>
      </div>
    </>
  );
}
