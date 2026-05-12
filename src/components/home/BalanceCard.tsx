import { Card } from "@/components/ui/Card";
import { formatCurrency, formatPercent } from "@/lib/format";

interface BalanceCardProps {
  /** Total wallet value (earning positions + idle token holdings). */
  totalBalance: number;
  /** Slice of totalBalance that's deposited into earning protocols. */
  earningBalance: number;
  /** Weighted-average APY across the user's earning positions. */
  avgApy: number;
}

export function BalanceCard({
  totalBalance,
  earningBalance,
  avgApy,
}: BalanceCardProps) {
  // avgApy is in percent form (e.g. 4.2 means 4.2%).
  const yearly = avgApy > 0 ? earningBalance * (avgApy / 100) : 0;

  return (
    <Card className="mx-5">
      <p className="text-[13px] text-sprout-text-muted mb-1">Total Balance</p>
      <p className="font-heading text-4xl font-800 text-sprout-text-primary">
        {formatCurrency(totalBalance)}
      </p>
      {earningBalance > 0 && (
        <p className="text-xs font-semibold text-sprout-green-dark mt-1">
          {formatCurrency(earningBalance)} earning
        </p>
      )}
      {yearly > 0 && (
        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="text-xs text-sprout-text-muted">You&apos;ll earn about</span>
          <span className="text-sm font-bold text-sprout-green-dark">
            {formatCurrency(yearly)}
          </span>
          <span className="text-xs text-sprout-text-muted">
            / year at {formatPercent(avgApy)}
          </span>
        </div>
      )}
    </Card>
  );
}
