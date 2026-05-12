"use client";

import { ExternalLink } from "lucide-react";
import { TokenIcon } from "@/components/ui/TokenIcon";
import { CHAIN_NAMES } from "@/lib/constants";
import type { Classification } from "@/lib/activity";
import type { ActivityGroup } from "@/lib/types";

interface ActivityRowProps {
  group: ActivityGroup;
  classification: Classification;
  onSelect: (groupId: string) => void;
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

function formatRelativeTime(unixSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - unixSeconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ActivityRow({ group, classification, onSelect }: ActivityRowProps) {
  const { kind, label, subLabel, primary, vault } = classification;

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
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(group.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(group.id);
        }
      }}
      className="flex items-center gap-3 bg-sprout-card rounded-2xl px-4 py-3 shadow-subtle cursor-pointer transition-transform active:scale-[0.99]"
    >
      <div className="relative shrink-0">
        <TokenIcon
          type="token"
          identifier={primary.token.symbol}
          size={38}
        />
        <div
          className="absolute -bottom-1 -right-1 rounded-full border-2 border-sprout-card overflow-hidden"
          style={{ width: 16, height: 16 }}
          aria-label={CHAIN_NAMES[group.chainId] ?? `Chain ${group.chainId}`}
        >
          <TokenIcon type="chain" identifier={group.chainId} size={16} />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {vault && (
            <TokenIcon
              type="protocol"
              identifier={vault.protocol.name}
              size={14}
            />
          )}
          <p className="text-sm font-semibold text-sprout-text-primary truncate">
            {label}
          </p>
        </div>
        <p className="text-[11px] text-sprout-text-muted truncate">
          {subLabel} · {formatRelativeTime(group.timestamp)}
        </p>
      </div>

      <div className="text-right shrink-0">
        <p className={`text-sm font-bold ${amountTone}`}>
          {amountPrefix}
          {amount} {primary.token.symbol}
        </p>
      </div>

      <a
        href={group.explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="p-1.5 -m-1.5 text-sprout-text-muted hover:text-sprout-green-dark transition-colors shrink-0"
        aria-label="Open transaction in block explorer"
      >
        <ExternalLink size={14} />
      </a>
    </div>
  );
}
