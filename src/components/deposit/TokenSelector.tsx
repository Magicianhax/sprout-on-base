"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TokenIcon } from "@/components/ui/TokenIcon";
import { CHAIN_NAMES, TOKEN_ADDRESSES } from "@/lib/constants";
import type { TokenBalance } from "@/lib/hooks/useBalances";

export { TOKEN_ADDRESSES } from "@/lib/constants";
export { TOKEN_DECIMALS } from "@/lib/constants";

export interface TokenSelection {
  symbol: string;
  chainId: number;
}

interface TokenSelectorProps {
  selected: TokenSelection;
  vaultChainId: number;
  onChange: (selection: TokenSelection) => void;
  balances: TokenBalance[];
  balancesLoading: boolean;
}

interface TokenGroup {
  symbol: string;
  totalBalance: number;
  chains: { chainId: number; balance: number }[];
}

function formatBal(n: number): string {
  if (n === 0) return "0.00";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.0001) return n.toFixed(4);
  return n.toFixed(6);
}

function buildGroups(balances: TokenBalance[]): TokenGroup[] {
  const balanceMap = new Map<string, number>();
  for (const b of balances) {
    balanceMap.set(`${b.symbol}-${b.chainId}`, b.balanceFormatted);
  }

  const groups: TokenGroup[] = [];

  for (const [symbol, chainMap] of Object.entries(TOKEN_ADDRESSES)) {
    const chains: { chainId: number; balance: number }[] = [];
    let totalBalance = 0;

    for (const chainIdStr of Object.keys(chainMap)) {
      const chainId = Number(chainIdStr);
      const balance = balanceMap.get(`${symbol}-${chainId}`) ?? 0;
      chains.push({ chainId, balance });
      totalBalance += balance;
    }

    // Sort chains: those with balance first
    chains.sort((a, b) => b.balance - a.balance);

    groups.push({ symbol, totalBalance, chains });
  }

  // Sort groups: highest total balance first, then alphabetical
  groups.sort((a, b) => {
    if (a.totalBalance > 0 && b.totalBalance === 0) return -1;
    if (a.totalBalance === 0 && b.totalBalance > 0) return 1;
    if (a.totalBalance !== b.totalBalance) return b.totalBalance - a.totalBalance;
    return a.symbol.localeCompare(b.symbol);
  });

  return groups;
}

export function TokenSelector({
  selected,
  vaultChainId,
  onChange,
  balances,
  balancesLoading: loading,
}: TokenSelectorProps) {
  const [open, setOpen] = useState(false);
  const [expandedToken, setExpandedToken] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => buildGroups(balances), [balances]);

  const isCrossChain = selected.chainId !== vaultChainId;
  const fromChainName = CHAIN_NAMES[selected.chainId] ?? `Chain ${selected.chainId}`;
  const toChainName = CHAIN_NAMES[vaultChainId] ?? `Chain ${vaultChainId}`;

  const selectedBalance =
    balances.find((b) => b.symbol === selected.symbol && b.chainId === selected.chainId)
      ?.balanceFormatted ?? 0;

  const selectedTotalBalance =
    groups.find((g) => g.symbol === selected.symbol)?.totalBalance ?? 0;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setExpandedToken(null);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function handleTokenClick(symbol: string) {
    if (expandedToken === symbol) {
      setExpandedToken(null);
    } else {
      setExpandedToken(symbol);
    }
  }

  function handleChainSelect(symbol: string, chainId: number) {
    onChange({ symbol, chainId });
    setOpen(false);
    setExpandedToken(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div ref={dropdownRef} className="relative">
        {/* Trigger */}
        <button
          onClick={() => { setOpen((o) => !o); setExpandedToken(null); }}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-button border-[1.5px] border-sprout-border bg-sprout-card cursor-pointer"
        >
          <div className="relative flex-shrink-0">
            <TokenIcon type="token" identifier={selected.symbol} size={36} />
            <div className="absolute -bottom-1 -right-1 rounded-full border-2 border-white overflow-hidden" style={{ width: 18, height: 18 }}>
              <TokenIcon type="chain" identifier={selected.chainId} size={18} />
            </div>
          </div>

          <div className="flex flex-col items-start flex-1 min-w-0">
            <span className="text-sm font-semibold text-sprout-text-primary leading-tight">
              {selected.symbol} on {fromChainName}
            </span>
            {selectedBalance > 0 && (
              <span className="text-xs text-sprout-text-secondary leading-tight">
                {formatBal(selectedBalance)} {selected.symbol}
              </span>
            )}
            {selectedBalance === 0 && loading && (
              <span className="text-xs text-sprout-text-muted leading-tight animate-pulse">Loading...</span>
            )}
          </div>

          <ChevronDown
            size={16}
            className={`text-sprout-text-secondary flex-shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          />
        </button>

        {/* Dropdown */}
        {open && (
          <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border border-sprout-border rounded-2xl shadow-lg overflow-hidden max-h-80 overflow-y-auto">
            {groups.map((group) => {
              const isExpanded = expandedToken === group.symbol;
              const isSelectedGroup = selected.symbol === group.symbol;

              return (
                <div key={group.symbol}>
                  {/* Token group header — shows cumulative balance */}
                  <button
                    onClick={() => handleTokenClick(group.symbol)}
                    className={`flex items-center gap-3 w-full px-3 py-3 text-left cursor-pointer transition-colors
                      ${isSelectedGroup ? "bg-sprout-green-light/50" : "hover:bg-gray-50"}
                      ${group.totalBalance === 0 ? "opacity-40" : ""}`}
                  >
                    <TokenIcon type="token" identifier={group.symbol} size={32} />

                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-sprout-text-primary">
                        {group.symbol}
                      </span>
                    </div>

                    <span className={`text-sm font-medium mr-1 ${group.totalBalance > 0 ? "text-sprout-text-primary" : "text-sprout-text-muted"}`}>
                      {formatBal(group.totalBalance)}
                    </span>

                    <ChevronRight
                      size={14}
                      className={`text-sprout-text-muted flex-shrink-0 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
                    />
                  </button>

                  {/* Expanded chain breakdown */}
                  {isExpanded && (
                    <div className="bg-gray-50 border-t border-sprout-border">
                      {group.chains.map((chain) => {
                        const chainName = CHAIN_NAMES[chain.chainId] ?? `Chain ${chain.chainId}`;
                        const isActive = isSelectedGroup && selected.chainId === chain.chainId;

                        return (
                          <button
                            key={chain.chainId}
                            onClick={() => handleChainSelect(group.symbol, chain.chainId)}
                            className={`flex items-center gap-3 w-full pl-8 pr-3 py-2.5 text-left cursor-pointer transition-colors
                              ${isActive ? "bg-sprout-green-light" : "hover:bg-sprout-green-light/30"}
                              ${chain.balance === 0 ? "opacity-40" : ""}`}
                          >
                            <div className="flex-shrink-0" style={{ width: 20, height: 20 }}>
                              <TokenIcon type="chain" identifier={chain.chainId} size={20} className="rounded-full" />
                            </div>

                            <span className={`text-sm flex-1 ${isActive ? "font-semibold text-sprout-green-dark" : "text-sprout-text-secondary"}`}>
                              {chainName}
                            </span>

                            <span className={`text-sm ${chain.balance > 0 ? "font-medium text-sprout-text-primary" : "text-sprout-text-muted"}`}>
                              {formatBal(chain.balance)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cross-chain hint */}
      {isCrossChain ? (
        <p className="text-xs text-sprout-text-muted bg-sprout-green-light rounded-xl px-3 py-2">
          Will bridge {selected.symbol} from {fromChainName} → {toChainName} automatically
        </p>
      ) : null}
    </div>
  );
}
