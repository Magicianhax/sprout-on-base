"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@/lib/wallet";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";
import { WalletActionBar } from "@/components/portfolio/WalletActionBar";
import { BalanceCard } from "@/components/home/BalanceCard";
import { EmptyState } from "@/components/home/EmptyState";
import { RecentActivity } from "@/components/home/RecentActivity";
import { VaultCard } from "@/components/vault/VaultCard";
import { ChainDropdown } from "@/components/vault/ChainDropdown";
import { ProtocolDropdown } from "@/components/vault/ProtocolDropdown";
import { SortToggle } from "@/components/vault/SortToggle";
import { ChevronLeft, ChevronRight, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { BalanceHeroSkeleton, VaultCardSkeleton } from "@/components/ui/CardSkeletons";
import { usePreferences } from "@/lib/hooks/usePreferences";
import { usePositions } from "@/lib/hooks/usePositions";
import { useVaults } from "@/lib/hooks/useVaults";
import { useActivity } from "@/lib/hooks/useActivity";
import { useBalances } from "@/lib/hooks/useBalances";
import { priceFor, usePrices } from "@/lib/hooks/usePrices";
import { useSmartWithdrawFlow } from "@/lib/hooks/useSmartWithdrawFlow";
import { SmartWithdrawModal } from "@/components/portfolio/SmartWithdrawModal";
import { TransactionModal } from "@/components/deposit/TransactionModal";
import { getRiskLevel } from "@/lib/format";
import { CHAIN_NAMES, HOME_PAGE_SIZE } from "@/lib/constants";
import { displayProtocol } from "@/lib/protocols";
import { refreshEverything } from "@/lib/refresh";
import type { SortBy, Vault } from "@/lib/types";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function LiteHome() {
  const { user } = usePrivy();
  const router = useRouter();
  const address = user?.wallet?.address;
  const { positions, loading, error, reload, totalBalance } = usePositions(address);
  const activity = useActivity(address);
  const { balances } = useBalances(address);
  const prices = usePrices();
  const { vaults } = useVaults();
  const smartWithdraw = useSmartWithdrawFlow();
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const hasPositions = positions.length > 0;

  // Idle wallet tokens converted to USD using priced symbols; unknown
  // tokens contribute 0 rather than an inflated guess.
  const walletUsd = useMemo(
    () =>
      balances.reduce(
        (sum, b) => sum + b.balanceFormatted * priceFor(prices, b.symbol),
        0
      ),
    [balances, prices]
  );
  const totalValueUsd = totalBalance + walletUsd;

  // USD-weighted average APY across positions. For each position we
  // look up the matching vault in the shared cache and pull its APY;
  // positions with no vault match (rare, happens while the vault
  // stream is still loading) contribute 0 and pull the average down.
  const avgApy = useMemo(() => {
    if (!hasPositions || vaults.length === 0) return 0;
    let weighted = 0;
    let total = 0;
    for (const p of positions) {
      const usd = parseFloat(p.balanceUsd || "0");
      if (!(usd > 0)) continue;
      const vault = vaults.find(
        (v) =>
          v.chainId === p.chainId &&
          v.protocol.name === p.protocolName &&
          v.underlyingTokens.some(
            (t) => t.address.toLowerCase() === p.asset.address.toLowerCase()
          )
      );
      if (!vault) continue;
      weighted += usd * vault.analytics.apy.total;
      total += usd;
    }
    return total > 0 ? weighted / total : 0;
  }, [positions, vaults, hasPositions]);

  return (
    <main className="min-h-dvh bg-sprout-gradient pb-28">
      <Header />

      <div className="px-5 pt-4 pb-2">
        <p className="font-heading text-2xl font-700 text-sprout-text-primary">
          {getGreeting()} 👋
        </p>
      </div>

      {address && (
        <div className="pt-1 pb-3">
          <WalletActionBar
            variant="compact"
            walletAddress={address}
            hasEarningPositions={!loading && hasPositions}
          />
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-5 pt-2">
          <BalanceHeroSkeleton />
          <VaultCardSkeleton />
          <VaultCardSkeleton />
        </div>
      ) : error ? (
        <Card className="mx-5 text-center py-8">
          <p className="text-sprout-text-secondary mb-3">Couldn&apos;t load your positions</p>
          <Button variant="secondary" onClick={reload}>Try again</Button>
        </Card>
      ) : hasPositions || totalValueUsd > 0 ? (
        <div className="flex flex-col gap-5 pt-2">
          <BalanceCard
            totalBalance={totalValueUsd}
            earningBalance={totalBalance}
            avgApy={avgApy}
          />

          <div className="px-5 flex flex-col gap-3">
            <Button
              className="w-full"
              onClick={() => router.push("/deposit")}
            >
              {hasPositions ? "Earn More" : "Start Earning"}
            </Button>
            {hasPositions && (
              <button
                className="text-center text-sm text-sprout-red-stop font-semibold py-1 cursor-pointer"
                onClick={() => setWithdrawOpen(true)}
              >
                Stop Earning
              </button>
            )}
          </div>

          <RecentActivity
            records={activity.records}
            loading={activity.loading}
            error={activity.error}
            compact
          />
        </div>
      ) : (
        <EmptyState onStartEarning={() => router.push("/deposit")} />
      )}

      <BottomNav />

      <SmartWithdrawModal
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        positions={positions}
        vaults={vaults}
        totalEarningUsd={totalBalance}
        onConfirm={(usd) => {
          setWithdrawOpen(false);
          // Lite always exits each position to its own chain and
          // underlying — direct ERC4626 redeem, zero slippage.
          // Cross-chain / custom-token exits live in Pro only.
          void smartWithdraw.start(usd, positions);
        }}
      />

      <TransactionModal
        status={smartWithdraw.modalStatus}
        intent="withdraw"
        txHash={
          smartWithdraw.state.completed[
            smartWithdraw.state.completed.length - 1
          ]?.txHash
        }
        chainId={
          smartWithdraw.state.plan[smartWithdraw.state.currentStepIndex]?.position
            .chainId
        }
        errorMessage={smartWithdraw.state.errorMessage}
        onClose={() => {
          smartWithdraw.close();
          reload();
        }}
        onRetry={smartWithdraw.retry}
      />
    </main>
  );
}

const ASSET_FILTERS = [
  { label: "All", value: "all" },
  { label: "Stables", value: "stables", symbols: ["USDC", "USDT", "DAI", "USDS", "FRAX", "LUSD", "CRVUSD", "GHO", "PYUSD", "TUSD"] },
  { label: "ETH", value: "eth", symbols: ["ETH", "WETH", "STETH", "WSTETH", "RETH", "CBETH", "WEETH", "EETH", "METH", "SWETH", "OSETH", "SFRXETH"] },
  { label: "BTC", value: "btc", symbols: ["BTC", "WBTC", "TBTC", "CBBTC", "SBTC", "RENBTC", "LBTC"] },
  { label: "Low Risk", value: "low-risk" },
];

function filterVaultsByAsset(vaults: Vault[], filter: string): Vault[] {
  if (filter === "all") return vaults;

  if (filter === "low-risk") {
    return vaults.filter((v) => getRiskLevel(v.tags) === "low");
  }

  const filterDef = ASSET_FILTERS.find((f) => f.value === filter);
  if (!filterDef || !("symbols" in filterDef) || !filterDef.symbols) return vaults;

  const symbols = new Set(filterDef.symbols.map((s) => s.toUpperCase()));
  return vaults.filter((v) =>
    v.underlyingTokens.some((t) => symbols.has(t.symbol.toUpperCase()))
  );
}

function ProHome() {
  const { user } = usePrivy();
  const router = useRouter();
  const address = user?.wallet?.address;
  const { totalBalance, positions } = usePositions(address);

  const [selectedChains, setSelectedChains] = useState<number[]>([]);
  const [selectedProtocols, setSelectedProtocols] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortBy>("tvl");
  const [assetFilter, setAssetFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const { vaults, loading, loadingMore, error } = useVaults({
    chainIds: selectedChains.length > 0 ? selectedChains : undefined,
    sortBy,
  });

  const handleRefresh = () => {
    void refreshEverything(address);
  };

  const assetFilteredVaults = useMemo(
    () => filterVaultsByAsset(vaults, assetFilter),
    [vaults, assetFilter]
  );

  // Derive protocol list from vaults already narrowed by chain + asset filters
  const availableProtocols = useMemo(() => {
    const set = new Set<string>();
    for (const v of assetFilteredVaults) set.add(v.protocol.name);
    return Array.from(set);
  }, [assetFilteredVaults]);

  const protocolFilteredVaults = useMemo(() => {
    if (selectedProtocols.length === 0) return assetFilteredVaults;
    const set = new Set(selectedProtocols);
    return assetFilteredVaults.filter((v) => set.has(v.protocol.name));
  }, [assetFilteredVaults, selectedProtocols]);

  const visibleVaults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return protocolFilteredVaults;
    return protocolFilteredVaults.filter((v) => {
      const chainName = (CHAIN_NAMES[v.chainId] ?? `Chain ${v.chainId}`).toLowerCase();
      const protocolRaw = v.protocol.name.toLowerCase();
      const protocolPretty = displayProtocol(v.protocol.name).toLowerCase();
      const name = v.name.toLowerCase();
      const tokenSymbols = v.underlyingTokens.map((t) => t.symbol.toLowerCase());
      return (
        chainName.includes(q) ||
        protocolRaw.includes(q) ||
        protocolPretty.includes(q) ||
        name.includes(q) ||
        tokenSymbols.some((s) => s.includes(q))
      );
    });
  }, [protocolFilteredVaults, searchQuery]);

  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(visibleVaults.length / HOME_PAGE_SIZE));

  // Reset to first page when filters/sort/search change
  useEffect(() => {
    setPage(1);
  }, [selectedChains, selectedProtocols, sortBy, assetFilter, searchQuery]);

  // Clamp page if list shrinks
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagedVaults = useMemo(
    () => visibleVaults.slice((page - 1) * HOME_PAGE_SIZE, page * HOME_PAGE_SIZE),
    [visibleVaults, page]
  );

  return (
    <main className="min-h-dvh bg-sprout-gradient pb-28">
      <Header />

      {/* Greeting */}
      <div className="px-5 pt-4 pb-3">
        <p className="font-heading text-2xl font-700 text-sprout-text-primary">
          {getGreeting()} 👋
        </p>
      </div>

      {/* Wallet card — same rich card shown on portfolio */}
      {address && (
        <div className="mb-5">
          <WalletActionBar
            variant="full"
            walletAddress={address}
            hasEarningPositions={positions.length > 0}
            earningBalanceUsd={totalBalance}
          />
        </div>
      )}

      {/* Section label for the vault explorer */}
      <div className="flex items-center gap-2 px-5 mb-3">
        <span className="w-2 h-2 rounded-full bg-sprout-green-primary" />
        <h2 className="text-xs font-bold uppercase tracking-wide text-sprout-text-secondary">
          Explore vaults
        </h2>
      </div>

      {/* Search bar */}
      <div className="px-5 mt-4 mb-3">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sprout-text-muted pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search token, chain, or protocol"
            className="w-full bg-white border border-sprout-border rounded-pill pl-10 pr-10 py-2.5 text-sm text-sprout-text-primary placeholder:text-sprout-text-muted shadow-subtle focus:outline-none focus:border-sprout-green-primary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-sprout-text-muted hover:text-sprout-text-primary cursor-pointer"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2 flex-wrap px-5 mb-3">
        <ProtocolDropdown
          available={availableProtocols}
          selected={selectedProtocols}
          onChange={setSelectedProtocols}
        />
        <ChainDropdown selected={selectedChains} onChange={setSelectedChains} />
        <SortToggle value={sortBy} onChange={setSortBy} />
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          className="ml-auto p-2 rounded-full bg-sprout-card border border-sprout-border shadow-subtle text-sprout-text-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Refresh data"
        >
          <RefreshCw
            size={14}
            strokeWidth={2.25}
            className={loading || loadingMore ? "animate-spin" : ""}
          />
        </button>
      </div>

      {/* Asset filter pills */}
      <div className="flex gap-2 px-5 mb-3 overflow-x-auto">
        {ASSET_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setAssetFilter(f.value)}
            className={`px-3.5 py-1.5 rounded-pill text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer
              ${assetFilter === f.value
                ? "bg-sprout-green-primary text-white"
                : "bg-white text-sprout-text-secondary border border-sprout-border"
              }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Vault list */}
      {loading ? (
        <div className="flex flex-col gap-3">
          <VaultCardSkeleton />
          <VaultCardSkeleton />
          <VaultCardSkeleton />
          <VaultCardSkeleton />
        </div>
      ) : error ? (
        <Card className="mx-5 text-center py-8">
          <p className="text-sprout-text-secondary mb-3">Couldn&apos;t load opportunities</p>
          <Button variant="secondary" onClick={handleRefresh}>Try again</Button>
        </Card>
      ) : visibleVaults.length === 0 ? (
        <div className="mx-5 mt-4 text-center text-sm text-sprout-text-muted py-10">
          No vaults found for selected filters.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {pagedVaults.map((vault) => (
              <VaultCard
                key={`${vault.chainId}-${vault.address}`}
                vault={vault}
                onClick={() =>
                  router.push(`/vault/${vault.address}?chainId=${vault.chainId}`)
                }
              />
            ))}
          </div>

          {loadingMore && (
            <div className="flex items-center justify-center gap-2 mt-4 px-5 text-xs text-sprout-text-muted">
              <span className="w-3 h-3 rounded-full border-2 border-sprout-green-primary border-t-transparent animate-spin" />
              Loading more opportunities…
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 px-5 mt-5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-white border border-sprout-border shadow-subtle text-sprout-text-primary disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                aria-label="Previous page"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-xs font-semibold text-sprout-text-secondary">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-white border border-sprout-border shadow-subtle text-sprout-text-primary disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                aria-label="Next page"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </>
      )}

      <BottomNav />
    </main>
  );
}

export default function HomePage() {
  const { preferences } = usePreferences();

  return (
    <AuthGuard>
      {preferences.mode === "pro" ? <ProHome /> : <LiteHome />}
    </AuthGuard>
  );
}
