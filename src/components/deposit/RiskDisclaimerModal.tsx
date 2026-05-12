"use client";

import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

interface RiskDisclaimerModalProps {
  open: boolean;
  onAccept: () => void;
  onClose: () => void;
}

export function RiskDisclaimerModal({
  open,
  onAccept,
  onClose,
}: RiskDisclaimerModalProps) {
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
        @keyframes rd-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes rd-slide-up {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .rd-backdrop { animation: rd-fade-in 0.22s ease-out both; }
        .rd-card { animation: rd-slide-up 0.28s ease-out both; }
      `}</style>

      <div
        className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm rd-backdrop"
        aria-modal="true"
        role="dialog"
        onClick={onClose}
      >
        <div
          className="bg-sprout-card rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-[420px] p-6 pb-8 rd-card relative"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 p-1 rounded-full text-sprout-text-muted hover:text-sprout-text-primary transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>

          <div className="flex flex-col items-center text-center pt-1">
            <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mb-3">
              <AlertTriangle
                size={24}
                strokeWidth={2.5}
                className="text-amber-600"
              />
            </div>
            <h2 className="font-heading text-xl font-800 text-sprout-text-primary">
              Before you deposit
            </h2>
            <p className="text-xs text-sprout-text-muted mt-1">
              A few important things to know.
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-3 text-sm text-sprout-text-secondary leading-relaxed">
            <div className="rounded-2xl bg-sprout-green-light/50 px-4 py-3">
              <p className="font-semibold text-sprout-text-primary mb-1">
                Your funds stay yours
              </p>
              <p className="text-xs">
                Sprout is non-custodial. Only your wallet can move your
                deposit. We never take custody.
              </p>
            </div>
            <div className="rounded-2xl bg-sprout-green-light/50 px-4 py-3">
              <p className="font-semibold text-sprout-text-primary mb-1">
                Yields can change
              </p>
              <p className="text-xs">
                APY rates are variable and not guaranteed. They fluctuate
                with market conditions on each protocol.
              </p>
            </div>
            <div className="rounded-2xl bg-amber-50 px-4 py-3">
              <p className="font-semibold text-amber-900 mb-1">
                Smart contract risk
              </p>
              <p className="text-xs text-amber-800">
                You&apos;re depositing into third-party DeFi protocols
                (Morpho, Aave, Euler, etc.). While these are audited and
                battle-tested, a smart contract exploit could result in
                partial or total loss. Only deposit what you can afford to
                lose.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onAccept}
            className="mt-6 w-full rounded-button py-3.5 text-base font-bold bg-gradient-to-br from-sprout-green-primary to-[#66BB6A] text-white shadow-glow transition-all duration-150 active:scale-[0.97] cursor-pointer"
          >
            I understand, let me earn
          </button>

          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full py-2 text-xs font-semibold text-sprout-text-muted hover:text-sprout-text-primary transition-colors cursor-pointer"
          >
            Not now
          </button>
        </div>
      </div>
    </>
  );
}
