"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { TokenIcon } from "@/components/ui/TokenIcon";
import { CHAIN_NAMES } from "@/lib/constants";
import type { TokenBalance } from "@/lib/hooks/useBalances";

interface WalletBalanceCardProps {
  balance: TokenBalance;
}

function formatBal(n: number): string {
  if (n === 0) return "0.00";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.0001) return n.toFixed(4);
  return n.toFixed(6);
}

export function WalletBalanceCard({ balance }: WalletBalanceCardProps) {
  const router = useRouter();
  const chainName = CHAIN_NAMES[balance.chainId] ?? `Chain ${balance.chainId}`;

  function handleStartEarning() {
    router.push(`/deposit?token=${balance.symbol}&chainId=${balance.chainId}`);
  }

  return (
    <Card
      onClick={handleStartEarning}
      shadow="subtle"
      className="mx-5"
    >
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <TokenIcon type="token" identifier={balance.symbol} size={44} />
          <div
            className="absolute -bottom-1 -right-1 rounded-full border-2 border-white overflow-hidden"
            style={{ width: 18, height: 18 }}
          >
            <TokenIcon type="chain" identifier={balance.chainId} size={18} />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sprout-text-primary text-[15px] leading-tight">
            {balance.symbol}
          </p>
          <p className="text-xs text-sprout-text-muted mt-0.5">{chainName}</p>
        </div>

        <div className="text-right shrink-0">
          <p className="font-heading text-sm font-700 text-sprout-text-primary">
            {formatBal(balance.balanceFormatted)} {balance.symbol}
          </p>
          <p className="text-[11px] text-sprout-green-dark font-semibold mt-0.5">
            Tap to earn →
          </p>
        </div>
      </div>
    </Card>
  );
}
