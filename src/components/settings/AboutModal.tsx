"use client";

import { X } from "lucide-react";
import { SproutLogo } from "@/components/ui/SproutLogo";

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

export function AboutModal({ open, onClose }: AboutModalProps) {
  if (!open) return null;

  return (
    <>
      <style>{`
        @keyframes about-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes about-slide-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .about-backdrop { animation: about-fade-in 0.22s ease-out both; }
        .about-card { animation: about-slide-up 0.28s ease-out both; }
      `}</style>

      <div
        className="fixed inset-0 z-50 flex items-center justify-center px-5 bg-black/50 backdrop-blur-sm about-backdrop"
        aria-modal="true"
        role="dialog"
        onClick={onClose}
      >
        <div
          className="bg-sprout-card rounded-3xl shadow-2xl w-full max-w-[380px] p-7 about-card relative"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 p-1 rounded-full text-sprout-text-muted hover:text-sprout-text-primary transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>

          {/* Logo */}
          <div className="flex flex-col items-center text-center">
            <SproutLogo
              size={64}
              decorative
              className="mb-3 shadow-subtle rounded-[14px]"
            />
            <h2 className="font-heading text-2xl font-800 text-sprout-green-dark">
              sprout
            </h2>
            <p className="text-sm text-sprout-text-secondary mt-1.5 leading-relaxed">
              Your money, growing every day.
            </p>
          </div>

          {/* What it is */}
          <div className="mt-6 space-y-4">
            <p className="text-sm text-sprout-text-secondary leading-relaxed">
              Sprout is a savings app that happens to be DeFi. One-tap deposits
              into audited yield vaults across Ethereum, Base, Arbitrum,
              Optimism and Polygon — no jargon required.
            </p>

            <div className="rounded-2xl bg-sprout-green-light/60 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-sprout-green-dark mb-2">
                Built with
              </p>
              <ul className="text-xs text-sprout-text-primary space-y-1.5">
                <li>
                  <span className="font-semibold">LI.FI Earn</span> — vault
                  discovery, analytics, and portfolio tracking
                </li>
                <li>
                  <span className="font-semibold">LI.FI Composer</span> —
                  one-click cross-chain deposits and withdrawals
                </li>
                <li>
                  <span className="font-semibold">Privy</span> — social login
                  and embedded wallets
                </li>
                <li>
                  <span className="font-semibold">Next.js + Tailwind</span>{" "}
                  — the app you&apos;re using right now
                </li>
              </ul>
            </div>

            <p className="text-[11px] text-sprout-text-muted text-center leading-relaxed">
              Submitted to the DeFi Mullet Hackathon
              <br />
              <span className="text-sprout-text-muted">
                UX Challenge Track · 2026
              </span>
            </p>
          </div>

          <button
            onClick={onClose}
            className="mt-6 w-full rounded-button py-3 text-sm font-bold bg-gradient-to-br from-sprout-green-primary to-[#66BB6A] text-white shadow-glow transition-all duration-150 active:scale-[0.97] cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </>
  );
}
