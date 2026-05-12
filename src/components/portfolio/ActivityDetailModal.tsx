"use client";

import { useEffect } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ExternalLink,
  X,
} from "lucide-react";
import { TokenIcon } from "@/components/ui/TokenIcon";
import { CHAIN_NAMES } from "@/lib/constants";
import type { ActivityGroup, Vault, WalletTransfer } from "@/lib/types";

interface Classification {
  kind: "deposit" | "withdraw" | "swap" | "bridge" | "send" | "receive";
  label: string;
  primary: WalletTransfer;
  vault?: Vault;
}

interface ActivityDetailModalProps {
  open: boolean;
  onClose: () => void;
  group: ActivityGroup | null;
  classification: Classification | null;
}

function truncateMiddle(value: string, lead = 6, tail = 4): string {
  if (value.length <= lead + tail + 2) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

function formatAmount(amount: string, decimals: number): string {
  try {
    const big = BigInt(amount);
    const divisor = BigInt(10) ** BigInt(decimals);
    const whole = big / divisor;
    const frac = big % divisor;
    const fracScaled = (Number(frac) / Number(divisor)).toFixed(4).slice(2);
    return `${whole.toString()}.${fracScaled}`;
  } catch {
    return "—";
  }
}

function formatDateTime(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ActivityDetailModal({
  open,
  onClose,
  group,
  classification,
}: ActivityDetailModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !group || !classification) return null;

  const { kind, label, primary, vault } = classification;
  const chainName =
    CHAIN_NAMES[group.chainId] ?? `Chain ${group.chainId}`;
  const amount = formatAmount(primary.amount, primary.token.decimals);
  const amountPrefix =
    kind === "deposit" || kind === "send" || kind === "swap"
      ? "-"
      : kind === "withdraw" || kind === "receive"
      ? "+"
      : "";
  const amountTone =
    kind === "withdraw" || kind === "receive"
      ? "text-sprout-green-dark"
      : "text-sprout-text-primary";

  return (
    <>
      <style>{`
        @keyframes activity-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes activity-slide-up {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .activity-backdrop { animation: activity-fade-in 0.22s ease-out both; }
        .activity-card { animation: activity-slide-up 0.28s ease-out both; }
      `}</style>

      <div
        className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm activity-backdrop"
        aria-modal="true"
        role="dialog"
        onClick={onClose}
      >
        <div
          className="bg-sprout-card rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-[420px] max-h-[90dvh] overflow-y-auto p-6 pb-8 activity-card relative"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 p-1 rounded-full text-sprout-text-muted hover:text-sprout-text-primary transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>

          {/* Hero — token icon + chain + title + amount */}
          <div className="flex flex-col items-center text-center pt-2">
            <div className="relative shrink-0 mb-4">
              <TokenIcon
                type="token"
                identifier={primary.token.symbol}
                size={56}
              />
              <div
                className="absolute -bottom-1 -right-1 rounded-full border-2 border-sprout-card overflow-hidden"
                style={{ width: 22, height: 22 }}
              >
                <TokenIcon type="chain" identifier={group.chainId} size={22} />
              </div>
            </div>

            <div className="flex items-center justify-center gap-1.5 mb-1">
              {vault && (
                <TokenIcon
                  type="protocol"
                  identifier={vault.protocol.name}
                  size={16}
                />
              )}
              <p className="font-heading text-base font-700 text-sprout-text-primary">
                {label}
              </p>
            </div>

            <p className={`font-heading text-3xl font-800 mt-2 ${amountTone}`}>
              {amountPrefix}
              {amount} {primary.token.symbol}
            </p>
          </div>

          {/* Status / chain / time */}
          <div className="mt-6 rounded-2xl bg-sprout-green-light/40 px-4 py-3 flex flex-col gap-2">
            <DetailRow
              label="Status"
              value={
                <span className="inline-flex items-center gap-1.5 text-sprout-green-dark font-semibold">
                  <Check size={14} strokeWidth={3} />
                  Successful
                </span>
              }
            />
            <DetailRow label="Network" value={chainName} />
            <DetailRow label="Date" value={formatDateTime(group.timestamp)} />
          </div>

          {/* Transfers breakdown */}
          {group.transfers.length > 0 && (
            <div className="mt-5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-sprout-text-muted mb-2">
                Transfers ({group.transfers.length})
              </p>
              <div className="flex flex-col gap-1.5">
                {group.transfers.map((t, i) => (
                  <TransferRow key={`${t.hash}-${i}`} transfer={t} />
                ))}
              </div>
            </div>
          )}

          {/* Explorer button */}
          <a
            href={group.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 w-full rounded-button py-3.5 text-sm font-bold bg-gradient-to-br from-sprout-green-primary to-[#66BB6A] text-white shadow-glow transition-all duration-150 active:scale-[0.97] cursor-pointer inline-flex items-center justify-center gap-2"
          >
            View on explorer
            <ExternalLink size={14} strokeWidth={2.5} />
          </a>
        </div>
      </div>
    </>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-sprout-text-muted">{label}</span>
      <span className="text-sprout-text-primary">{value}</span>
    </div>
  );
}

function TransferRow({ transfer }: { transfer: WalletTransfer }) {
  const isOut = transfer.direction === "out";
  const amount = formatAmount(transfer.amount, transfer.token.decimals);
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-sprout-green-light/40 px-3 py-2">
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
          isOut ? "bg-gray-500/15 text-gray-500" : "bg-sprout-green-primary/15 text-sprout-green-dark"
        }`}
      >
        {isOut ? (
          <ArrowUpRight size={14} strokeWidth={2.5} />
        ) : (
          <ArrowDownLeft size={14} strokeWidth={2.5} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-sprout-text-primary truncate">
          {isOut ? "Sent" : "Received"} {transfer.token.symbol}
        </p>
        <p className="text-[10px] text-sprout-text-muted font-mono truncate">
          {isOut ? "to" : "from"} {truncateMiddle(transfer.counterparty)}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-bold text-sprout-text-primary">
          {isOut ? "-" : "+"}
          {amount}
        </p>
      </div>
    </div>
  );
}
