"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { TokenIcon } from "@/components/ui/TokenIcon";
import { formatCurrency, formatPercent } from "@/lib/format";
import { CHAIN_NAMES } from "@/lib/constants";
import { fetchVaults } from "@/lib/api/earn";
import { displayProtocol } from "@/lib/protocols";
import type { Position } from "@/lib/types";

interface PositionCardProps {
  position: Position;
  showDetails: boolean;
  /** Fires when the user taps the primary Stop/Withdraw button. */
  onAction: (position: Position) => void;
  /** Text of the primary action button (defaults to "Stop Earning"). */
  actionLabel?: string;
}

export function PositionCard({
  position,
  onAction,
  actionLabel = "Stop Earning",
}: PositionCardProps) {
  const { asset, protocolName, chainId, balanceUsd, balanceNative } = position;
  const chainName = CHAIN_NAMES[chainId] ?? `Chain ${chainId}`;
  const balanceUsdNum = parseFloat(balanceUsd || "0");
  const balanceNativeNum = parseFloat(balanceNative || "0");

  const [apy, setApy] = useState<number | null>(null);

  // Fetch APY for this position's vault
  useEffect(() => {
    let cancelled = false;

    fetchVaults({
      chainId,
      asset: asset.symbol,
      sortBy: "tvl",
      limit: 50,
    })
      .then((res) => {
        if (cancelled) return;
        // Find the vault matching this protocol
        const vault = res.data.find(
          (v) =>
            v.protocol.name === protocolName &&
            v.underlyingTokens.some(
              (t) => t.address.toLowerCase() === asset.address.toLowerCase()
            )
        );
        if (vault) {
          setApy(vault.analytics.apy.total);
        }
      })
      .catch(() => {
        // silent
      });

    return () => {
      cancelled = true;
    };
  }, [chainId, asset.symbol, asset.address, protocolName]);

  function handleAction(e: React.MouseEvent) {
    e.stopPropagation();
    onAction(position);
  }

  return (
    <Card shadow="subtle" className="mx-5">
      <div className="flex items-start gap-3">
        {/* Token icon with chain badge */}
        <div className="relative shrink-0">
          <TokenIcon type="token" identifier={asset.symbol} size={44} />
          <div
            className="absolute -bottom-1 -right-1 rounded-full border-2 border-white overflow-hidden"
            style={{ width: 18, height: 18 }}
          >
            <TokenIcon type="chain" identifier={chainId} size={18} />
          </div>
        </div>

        {/* Token info */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sprout-text-primary text-[15px] truncate leading-tight">
            {asset.symbol}
          </p>
          <p className="text-xs text-sprout-text-muted mt-0.5 truncate">
            {displayProtocol(protocolName)} · {chainName}
          </p>
        </div>

        {/* Balance */}
        <div className="text-right shrink-0">
          <p className="font-heading text-base font-800 text-sprout-text-primary">
            {formatCurrency(balanceUsdNum)}
          </p>
          <p className="text-[11px] text-sprout-text-muted mt-0.5">
            {balanceNativeNum.toFixed(4)} {asset.symbol}
          </p>
        </div>
      </div>

      {/* APY + Stop Earning row */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-sprout-border">
        <div className="flex items-center gap-1.5">
          {apy !== null ? (
            <Badge color="green">{formatPercent(apy)} yearly</Badge>
          ) : (
            <span className="text-xs text-sprout-text-muted">Earning yield</span>
          )}
        </div>

        <button
          className="text-xs font-semibold text-sprout-red-stop cursor-pointer py-1 px-2"
          onClick={handleAction}
        >
          {actionLabel}
        </button>
      </div>
    </Card>
  );
}
