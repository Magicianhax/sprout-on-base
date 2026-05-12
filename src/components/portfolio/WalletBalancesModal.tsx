"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { TokenIcon } from "@/components/ui/TokenIcon";
import { CHAIN_NAMES } from "@/lib/constants";
import type { TokenBalance } from "@/lib/hooks/useBalances";

interface WalletBalancesModalProps {
  open: boolean;
  onClose: () => void;
  balances: TokenBalance[];
}

function formatBal(n: number): string {
  if (n === 0) return "0.00";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.0001) return n.toFixed(4);
  return n.toFixed(6);
}

export function WalletBalancesModal({
  open,
  onClose,
  balances,
}: WalletBalancesModalProps) {
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function handleStartEarning(balance: TokenBalance) {
    onClose();
    router.push(`/deposit?token=${balance.symbol}&chainId=${balance.chainId}`);
  }

  return (
    <>
      <style>{`
        @keyframes wallet-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes wallet-slide-up {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .wallet-backdrop { animation: wallet-fade-in 0.22s ease-out both; }
        .wallet-card { animation: wallet-slide-up 0.28s ease-out both; }
      `}</style>

      <div
        className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm wallet-backdrop"
        aria-modal="true"
        role="dialog"
        onClick={onClose}
      >
        <div
          className="bg-sprout-card rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-[420px] max-h-[85dvh] overflow-y-auto p-6 pb-8 wallet-card relative"
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
            <h2 className="font-heading text-xl font-800 text-sprout-text-primary">
              Your Tokens
            </h2>
            <p className="text-xs text-sprout-text-muted mt-1">
              Idle tokens in your wallet. Tap any to put them to work.
            </p>
          </div>

          {balances.length === 0 ? (
            <div className="text-center text-sm text-sprout-text-muted py-8">
              Your wallet is empty. Use Receive to fund it.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {balances.map((balance) => {
                const chainName =
                  CHAIN_NAMES[balance.chainId] ?? `Chain ${balance.chainId}`;
                return (
                  <button
                    key={`${balance.chainId}-${balance.symbol}`}
                    type="button"
                    onClick={() => handleStartEarning(balance)}
                    className="flex items-center gap-3 bg-sprout-green-light/40 rounded-2xl px-4 py-3 cursor-pointer transition-transform active:scale-[0.99]"
                  >
                    <div className="relative shrink-0">
                      <TokenIcon
                        type="token"
                        identifier={balance.symbol}
                        size={40}
                      />
                      <div
                        className="absolute -bottom-1 -right-1 rounded-full border-2 border-sprout-card overflow-hidden"
                        style={{ width: 18, height: 18 }}
                      >
                        <TokenIcon
                          type="chain"
                          identifier={balance.chainId}
                          size={18}
                        />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-semibold text-sprout-text-primary">
                        {balance.symbol}
                      </p>
                      <p className="text-[11px] text-sprout-text-muted">
                        {chainName}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-sprout-text-primary">
                        {formatBal(balance.balanceFormatted)} {balance.symbol}
                      </p>
                      <p className="text-[11px] text-sprout-green-dark font-semibold">
                        Tap to earn →
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
