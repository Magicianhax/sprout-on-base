"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { TokenIcon } from "@/components/ui/TokenIcon";
import { Button } from "@/components/ui/Button";
import {
  CHAIN_NAMES,
  SUPPORTED_CHAIN_IDS,
  TOKEN_ADDRESSES,
} from "@/lib/constants";
import { displayProtocol } from "@/lib/protocols";
import type { Position } from "@/lib/types";

const CHAIN_SHORT_NAMES: Record<number, string> = {
  1: "Ethereum",
  8453: "Base",
  42161: "Arbitrum",
  10: "Optimism",
  137: "Polygon",
};

function chainLabel(chainId: number): string {
  return (
    CHAIN_SHORT_NAMES[chainId] ?? CHAIN_NAMES[chainId] ?? `Chain ${chainId}`
  );
}

/**
 * All output tokens configured on a given chain — derived from
 * TOKEN_ADDRESSES so we stay in sync with whatever the rest of
 * the app knows how to route. Guaranteed stable order.
 */
function tokensOnChain(chainId: number): string[] {
  const out: string[] = [];
  for (const [symbol, chainMap] of Object.entries(TOKEN_ADDRESSES)) {
    if (chainMap[chainId]) out.push(symbol);
  }
  return out;
}

interface PartialWithdrawModalProps {
  open: boolean;
  position: Position | null;
  onClose: () => void;
  onConfirm: (
    position: Position,
    amount: number,
    destinationChainId: number,
    outputTokenSymbol: string
  ) => void;
}

export function PartialWithdrawModal({
  open,
  position,
  onClose,
  onConfirm,
}: PartialWithdrawModalProps) {
  const [amount, setAmount] = useState("");
  const [destinationChainId, setDestinationChainId] = useState<number>(
    position?.chainId ?? 8453
  );
  const [outputSymbol, setOutputSymbol] = useState<string>(
    position?.asset.symbol ?? "USDC"
  );
  const [chainOpen, setChainOpen] = useState(false);
  const [tokenOpen, setTokenOpen] = useState(false);
  const chainRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<HTMLDivElement>(null);

  const maxAmount = useMemo(() => {
    if (!position) return 0;
    const n = parseFloat(position.balanceNative);
    return Number.isFinite(n) ? n : 0;
  }, [position]);

  // Chains worth showing as exit destinations — we need at least
  // USDC configured there as a fallback target token.
  const destinationChains = useMemo(
    () =>
      (SUPPORTED_CHAIN_IDS as readonly number[]).filter(
        (id) => !!TOKEN_ADDRESSES["USDC"]?.[id]
      ),
    []
  );

  // Output tokens available on the currently selected chain.
  // Recomputed whenever the chain changes so the token dropdown
  // can't offer an asset that doesn't exist there.
  const outputTokens = useMemo(
    () => tokensOnChain(destinationChainId),
    [destinationChainId]
  );

  // If the previously selected output token isn't on the new
  // chain, snap back to a sensible default — the position's own
  // asset if possible, else USDC, else the first available.
  useEffect(() => {
    if (outputTokens.length === 0) return;
    if (outputTokens.includes(outputSymbol)) return;
    const preferred = position?.asset.symbol;
    if (preferred && outputTokens.includes(preferred)) {
      setOutputSymbol(preferred);
    } else if (outputTokens.includes("USDC")) {
      setOutputSymbol("USDC");
    } else {
      setOutputSymbol(outputTokens[0]);
    }
  }, [outputTokens, outputSymbol, position]);

  useEffect(() => {
    if (open && position) {
      setAmount(String(maxAmount));
      // Default destination: the vault's own chain + underlying.
      // Zero bridge cost and the most common case — user can
      // switch from either dropdown.
      setDestinationChainId(position.chainId);
      setOutputSymbol(position.asset.symbol);
      setChainOpen(false);
      setTokenOpen(false);
    }
    if (!open) {
      setAmount("");
    }
  }, [open, position, maxAmount]);

  // Close dropdowns on outside click.
  useEffect(() => {
    if (!chainOpen && !tokenOpen) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (chainRef.current && !chainRef.current.contains(target)) {
        setChainOpen(false);
      }
      if (tokenRef.current && !tokenRef.current.contains(target)) {
        setTokenOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [chainOpen, tokenOpen]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !position) return null;

  const numericAmount = parseFloat(amount);
  const validAmount =
    !isNaN(numericAmount) && numericAmount > 0 && numericAmount <= maxAmount;
  const chainName = chainLabel(position.chainId);
  const isFullWithdrawal = numericAmount >= maxAmount * 0.9999;
  const isCrossChainExit = destinationChainId !== position.chainId;
  const isDifferentToken =
    outputSymbol.toUpperCase() !== position.asset.symbol.toUpperCase();
  const isCustomExit = isCrossChainExit || isDifferentToken;
  // Partial withdrawals have to stay on the vault's own chain +
  // asset — the executor rejects anything else because LI.FI
  // routes work in `fromAmount` units of the share token.
  const partialCustomBlocked = !isFullWithdrawal && isCustomExit;

  function setPercent(pct: number) {
    const value = Number((maxAmount * pct).toFixed(6));
    setAmount(String(value));
  }

  function handleConfirm() {
    if (!validAmount || !position) return;
    if (partialCustomBlocked) return;
    onConfirm(position, numericAmount, destinationChainId, outputSymbol);
  }

  return (
    <>
      <style>{`
        @keyframes pw-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pw-slide-up {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .pw-backdrop { animation: pw-fade-in 0.22s ease-out both; }
        .pw-card { animation: pw-slide-up 0.28s ease-out both; }
      `}</style>

      <div
        className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm pw-backdrop"
        aria-modal="true"
        role="dialog"
        onClick={onClose}
      >
        <div
          className="bg-sprout-card rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-[420px] p-6 pb-8 pw-card relative"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 p-1 rounded-full text-sprout-text-muted hover:text-sprout-text-primary transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-3 pt-1 mb-5">
            <div className="relative shrink-0">
              <TokenIcon type="token" identifier={position.asset.symbol} size={42} />
              <div
                className="absolute -bottom-1 -right-1 rounded-full border-2 border-sprout-card overflow-hidden"
                style={{ width: 18, height: 18 }}
              >
                <TokenIcon type="chain" identifier={position.chainId} size={18} />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-heading text-base font-700 text-sprout-text-primary">
                Withdraw {position.asset.symbol}
              </p>
              <p className="text-[11px] text-sprout-text-muted truncate">
                {displayProtocol(position.protocolName)} · {chainName}
              </p>
            </div>
          </div>

          {/* Amount input */}
          <div className="bg-sprout-green-light/40 rounded-2xl px-4 py-3">
            <div className="flex items-baseline justify-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 min-w-0 bg-transparent text-3xl font-heading font-bold text-sprout-text-primary outline-none placeholder:text-sprout-text-muted text-center"
              />
            </div>
            <p className="text-center text-xs text-sprout-text-muted mt-1">
              {position.asset.symbol}
            </p>
          </div>

          <p className="text-center text-[11px] text-sprout-text-muted mt-2">
            Balance: {maxAmount.toFixed(6)} {position.asset.symbol}
          </p>

          {/* Presets */}
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

          {numericAmount > maxAmount && (
            <p className="text-center text-[11px] text-sprout-red-stop font-semibold mt-3">
              Amount exceeds your position balance.
            </p>
          )}

          {/* Destination pickers: chain + output token.
              Same-chain + same-asset keeps the fast direct
              ERC4626 redeem path. Anything else routes through
              LI.FI swap/bridge. Partial withdrawals are locked
              to the default combo — the executor rejects cross-
              chain partials because LI.FI routes work in
              fromAmount units of the share token. */}
          {/* Raise z so the open dropdown panels paint above the
              Withdraw button rendered below. Static elements
              don't participate in z-index, so without this the
              button's DOM order wins and hides the menus. */}
          <div className="mt-5 grid grid-cols-2 gap-2 relative z-20">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-sprout-text-muted mb-1.5">
                Receive on
              </p>
              <div className="relative" ref={chainRef}>
                <button
                  type="button"
                  onClick={() => {
                    setChainOpen((v) => !v);
                    setTokenOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-sprout-green-light/50 hover:bg-sprout-green-light/70 rounded-xl text-xs font-bold text-sprout-text-primary cursor-pointer transition-colors"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <TokenIcon
                      type="chain"
                      identifier={destinationChainId}
                      size={16}
                    />
                    <span className="truncate">
                      {chainLabel(destinationChainId)}
                    </span>
                  </span>
                  <ChevronDown
                    size={14}
                    className={`text-sprout-text-muted shrink-0 transition-transform ${
                      chainOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {chainOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-sprout-card border border-sprout-border rounded-xl shadow-card p-1 z-10">
                    {destinationChains.map((cid) => {
                      const active = cid === destinationChainId;
                      return (
                        <button
                          key={cid}
                          type="button"
                          onClick={() => {
                            setDestinationChainId(cid);
                            setChainOpen(false);
                          }}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-semibold text-left cursor-pointer transition-colors ${
                            active
                              ? "bg-sprout-green-light text-sprout-green-dark"
                              : "text-sprout-text-primary hover:bg-sprout-green-light/60"
                          }`}
                        >
                          <TokenIcon type="chain" identifier={cid} size={16} />
                          {chainLabel(cid)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-sprout-text-muted mb-1.5">
                As token
              </p>
              <div className="relative" ref={tokenRef}>
                <button
                  type="button"
                  onClick={() => {
                    setTokenOpen((v) => !v);
                    setChainOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-sprout-green-light/50 hover:bg-sprout-green-light/70 rounded-xl text-xs font-bold text-sprout-text-primary cursor-pointer transition-colors"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <TokenIcon
                      type="token"
                      identifier={outputSymbol}
                      size={16}
                    />
                    <span className="truncate">{outputSymbol}</span>
                  </span>
                  <ChevronDown
                    size={14}
                    className={`text-sprout-text-muted shrink-0 transition-transform ${
                      tokenOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {tokenOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-sprout-card border border-sprout-border rounded-xl shadow-card p-1 z-10 max-h-[220px] overflow-y-auto">
                    {outputTokens.map((sym) => {
                      const active = sym === outputSymbol;
                      return (
                        <button
                          key={sym}
                          type="button"
                          onClick={() => {
                            setOutputSymbol(sym);
                            setTokenOpen(false);
                          }}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-semibold text-left cursor-pointer transition-colors ${
                            active
                              ? "bg-sprout-green-light text-sprout-green-dark"
                              : "text-sprout-text-primary hover:bg-sprout-green-light/60"
                          }`}
                        >
                          <TokenIcon type="token" identifier={sym} size={16} />
                          {sym}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {partialCustomBlocked && (
            <p className="text-center text-[11px] text-sprout-red-stop font-semibold mt-3 leading-relaxed">
              Custom destinations are only available for full withdrawals. Tap
              MAX or switch back to {position.asset.symbol} on {chainName}.
            </p>
          )}

          <Button
            className="w-full mt-5"
            disabled={!validAmount || partialCustomBlocked}
            onClick={handleConfirm}
          >
            {isFullWithdrawal ? "Withdraw all" : "Withdraw"}
          </Button>

          <p className="text-center text-[11px] text-sprout-text-muted mt-3">
            You&apos;ll receive{" "}
            <span className="font-semibold">{outputSymbol}</span> on{" "}
            <span className="font-semibold">
              {chainLabel(destinationChainId)}
            </span>
            {isCustomExit && " via LI.FI"}.
          </p>
        </div>
      </div>
    </>
  );
}
