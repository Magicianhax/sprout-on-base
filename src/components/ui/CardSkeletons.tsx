import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

// Mirrors VaultCard — token icon (44) + chain badge, title + subtitle
// line, APY block on the right, and a row of badge pills below.
export function VaultCardSkeleton() {
  return (
    <Card shadow="subtle" className="mx-5">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <Skeleton rounded="full" className="w-11 h-11" />
          <Skeleton
            rounded="full"
            className="absolute -bottom-1 -right-1 w-[18px] h-[18px] ring-2 ring-sprout-card"
          />
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>

        <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-3 w-10" />
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <Skeleton rounded="full" className="h-5 w-16" />
        <Skeleton rounded="full" className="h-5 w-14" />
        <Skeleton rounded="full" className="h-5 w-12" />
      </div>
    </Card>
  );
}

// Mirrors PositionCard — token icon + chain badge, title + subtitle,
// balance block, then a footer row with APY badge + stop earning text.
export function PositionCardSkeleton() {
  return (
    <Card shadow="subtle" className="mx-5">
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <Skeleton rounded="full" className="w-11 h-11" />
          <Skeleton
            rounded="full"
            className="absolute -bottom-1 -right-1 w-[18px] h-[18px] ring-2 ring-sprout-card"
          />
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
        </div>

        <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3 w-12" />
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-sprout-border">
        <Skeleton rounded="full" className="h-5 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
    </Card>
  );
}

// Mirrors WalletBalanceCard — compact single-line row with token icon
// + chain badge, symbol/chain, balance on right.
export function WalletBalanceCardSkeleton() {
  return (
    <Card shadow="subtle" className="mx-5">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <Skeleton rounded="full" className="w-11 h-11" />
          <Skeleton
            rounded="full"
            className="absolute -bottom-1 -right-1 w-[18px] h-[18px] ring-2 ring-sprout-card"
          />
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-1/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-3 w-14" />
        </div>
      </div>
    </Card>
  );
}

// Mirrors the Lite-home BalanceCard — big hero number + secondary label.
export function BalanceHeroSkeleton() {
  return (
    <Card shadow="card" className="mx-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="flex items-center gap-3 pt-2 border-t border-sprout-border">
          <Skeleton rounded="full" className="h-6 w-20" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>
    </Card>
  );
}
