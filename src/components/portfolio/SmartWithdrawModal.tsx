"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TokenIcon } from "@/components/ui/TokenIcon";
import { CHAIN_NAMES } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import { displayProtocol } from "@/lib/protocols";
import { buildWithdrawPlan, type WithdrawStep } from "@/lib/withdrawPlanner";
import type { Position, Vault } from "@/lib/types";

interface SmartWithdrawModalProps {
  open: boolean;
  onClose: () => void;
  positions: Position[];
  vaults: Vault[];
  totalEarningUsd: number;
  onConfirm: (usdAmount: number) => void;
}

export function SmartWithdrawModal({
  open,
  onClose,
  positions,
  vaults,
  totalEarningUsd,
  onConfirm,
}: SmartWithdrawModalProps) {
  const [amount, setAmount] = useState<string>("");

  useEffect(() => {
    if (open) {
      setAmount(totalEarningUsd > 0 ? totalEarningUsd.toFixed(2) : "");
    } else {
      setAmount("");
    }
  }, [open, totalEarningUsd]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const numericAmount = parseFloat(amount);
  const validAmount =
    !isNaN(numericAmount) &&
    numericAmount > 0 &&
    numericAmount <= totalEarningUsd;

  // Preview the plan live as the user types. This is a pure local
  // computation — no network.
  const plan = useMemo<WithdrawStep[]>(() => {
    if (!validAmount) return [];
    return buildWithdrawPlan(positions, vaults, numericAmount);
  }, [validAmount, numericAmount, positions, vaults]);

  if (!open) return null;

  function setPercent(pct: number) {
    // MAX uses the exact full precision so validAmount's
    // `<= totalEarningUsd` check can never fail due to display
    // rounding up. Lower percents floor to 2 decimals so the input
    // stays pretty without ever exceeding the available balance.
    if (pct >= 0.999) {
      setAmount(String(totalEarningUsd));
      return;
    }
    const value = Math.floor(totalEarningUsd * pct * 100) / 100;
    setAmount(String(value));
  }

  function handleConfirm() {
    if (!validAmount) return;
    onConfirm(numericAmount);
  }

  return (
    <>
      <style>{`
        @keyframes sw-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes sw-slide-up {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .sw-backdrop { animation: sw-fade-in 0.22s ease-out both; }
        .sw-card { animation: sw-slide-up 0.28s ease-out both; }
      `}</style>

      <div
        className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sw-backdrop"
        aria-modal="true"
        role="dialog"
        onClick={onClose}
      >
        <div
          className="bg-sprout-card rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-[420px] max-h-[90dvh] overflow-y-auto p-6 pb-8 sw-card relative"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 p-1 rounded-full text-sprout-text-muted hover:text-sprout-text-primary transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>

          <div className="text-center pt-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-sprout-text-muted">
              Stop Earning
            </p>
            <h2 className="font-heading text-xl font-800 text-sprout-text-primary mt-0.5">
              How much do you want back?
            </h2>
            <p className="text-xs text-sprout-text-muted mt-1">
              We&apos;ll pull from the lowest-yielding positions first.
            </p>
          </div>

          {/* Amount input */}
          <div className="mt-6 bg-sprout-green-light/40 rounded-2xl px-4 py-4">
            <div className="flex items-baseline justify-center gap-1">
              <span className="font-heading text-3xl font-800 text-sprout-text-muted">
                $
              </span>
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 min-w-0 bg-transparent font-heading text-4xl font-800 text-sprout-text-primary outline-none placeholder:text-sprout-text-muted text-center"
              />
            </div>
          </div>

          <p className="text-center text-[11px] text-sprout-text-muted mt-2">
            Available: {formatCurrency(totalEarningUsd)} earning
          </p>

          <div className="flex items-center gap-2 mt-4">
            {[0.25, 0.5, 0.75, 1].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => setPercent(pct)}
                className="flex-1 py-2 rounded-pill text-[11px] font-bold bg-sprout-green-light text-sprout-green-dark cursor-pointer active:scale-[0.97] transition-transform"
              >
                {pct === 1 ? "MAX" : `${pct * 100}%`}
              </button>
            ))}
          </div>

          {validAmount && numericAmount > totalEarningUsd && (
            <p className="text-center text-[11px] text-sprout-red-stop font-semibold mt-3">
              Amount exceeds your earning balance.
            </p>
          )}

          {/* Plan preview */}
          {plan.length > 0 && (
            <div className="mt-5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-sprout-text-muted mb-2">
                {plan.length === 1
                  ? "We'll withdraw from"
                  : `We'll split across ${plan.length} positions`}
              </p>
              <div className="flex flex-col gap-2">
                {plan.map((step, i) => {
                  const chainName =
                    CHAIN_NAMES[step.position.chainId] ??
                    `Chain ${step.position.chainId}`;
                  return (
                    <div
                      key={`${step.position.chainId}-${step.position.asset.address}-${step.position.protocolName}-${i}`}
                      className="flex items-center gap-3 rounded-2xl bg-sprout-green-light/40 px-3 py-2"
                    >
                      <div className="relative shrink-0">
                        <TokenIcon
                          type="token"
                          identifier={step.position.asset.symbol}
                          size={30}
                        />
                        <div
                          className="absolute -bottom-1 -right-1 rounded-full border-2 border-sprout-card overflow-hidden"
                          style={{ width: 14, height: 14 }}
                        >
                          <TokenIcon
                            type="chain"
                            identifier={step.position.chainId}
                            size={14}
                          />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-sprout-text-primary truncate">
                          {displayProtocol(step.position.protocolName)}
                        </p>
                        <p className="text-[10px] text-sprout-text-muted truncate">
                          {chainName} · {step.apy.toFixed(1)}% yearly
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-sprout-text-primary">
                          {formatCurrency(step.usd)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {plan.length > 1 && (
                <p className="text-[10px] text-sprout-text-muted mt-2 text-center leading-relaxed">
                  You&apos;ll approve {plan.length} transactions back-to-back.
                </p>
              )}
            </div>
          )}

          <Button
            className="w-full mt-5"
            disabled={!validAmount || plan.length === 0}
            onClick={handleConfirm}
          >
            Withdraw {validAmount ? formatCurrency(numericAmount) : ""}
          </Button>
        </div>
      </div>
    </>
  );
}
