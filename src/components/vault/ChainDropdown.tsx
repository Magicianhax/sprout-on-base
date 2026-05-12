"use client";

import { TokenIcon } from "@/components/ui/TokenIcon";
import { SUPPORTED_CHAIN_IDS, CHAIN_NAMES } from "@/lib/constants";

interface ChainDropdownProps {
  selected: number[];
  // Kept for source compatibility with the multi-chain parent project.
  // sprout-base is Base-only so the value never changes — call sites
  // can still pass an onChange in case a chain is ever added back.
  onChange: (chainIds: number[]) => void;
}

// sprout-base is single-chain (Base), so the multi-chain dropdown
// collapses to a static badge. We keep the component name and prop
// signature identical so call sites don't change. If a second chain
// is ever added back, restore the parent project's dropdown version.
export function ChainDropdown(_: ChainDropdownProps) {
  const chainId = SUPPORTED_CHAIN_IDS[0];
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-sprout-border rounded-pill text-sm font-semibold text-sprout-text-primary shadow-subtle">
      <TokenIcon type="chain" identifier={chainId} size={16} />
      <span>{CHAIN_NAMES[chainId]}</span>
    </div>
  );
}
