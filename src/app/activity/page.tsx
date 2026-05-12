"use client";

import { useEffect, useMemo, useState } from "react";
import { usePrivy } from "@/lib/wallet";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";
import { Button } from "@/components/ui/Button";
import { ActivityRow } from "@/components/activity/ActivityRow";
import { TokenFilterDropdown } from "@/components/activity/TokenFilterDropdown";
import { ChainDropdown } from "@/components/vault/ChainDropdown";
import { ProtocolDropdown } from "@/components/vault/ProtocolDropdown";
import { ActivityDetailModal } from "@/components/portfolio/ActivityDetailModal";
import { useActivity } from "@/lib/hooks/useActivity";
import { useVaults } from "@/lib/hooks/useVaults";
import {
  classifyActivity,
  cleanGroup,
  type Classification,
} from "@/lib/activity";
import { refreshEverything } from "@/lib/refresh";
import type { ActivityGroup } from "@/lib/types";

const PAGE_SIZE = 10;

interface ClassifiedGroup {
  group: ActivityGroup;
  classification: Classification;
}

function ActivityContent() {
  const { user } = usePrivy();
  const address = user?.wallet?.address;
  const { records, loading, error } = useActivity(address);
  const { vaults } = useVaults();

  const handleRefresh = () => {
    void refreshEverything(address);
  };

  const [selectedChains, setSelectedChains] = useState<number[]>([]);
  const [selectedTokens, setSelectedTokens] = useState<string[]>([]);
  const [selectedProtocols, setSelectedProtocols] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Clean + classify every group once per data/vault change
  const classified = useMemo<ClassifiedGroup[]>(() => {
    const cleaned = records
      .map((g) => cleanGroup(g, vaults))
      .filter((g) => g.transfers.length > 0);
    return cleaned.map((g) => ({
      group: g,
      classification: classifyActivity(g, vaults),
    }));
  }, [records, vaults]);

  // Filter option lists derived from the whole classified set so
  // selecting a filter doesn't immediately drop the option from its
  // own dropdown.
  const availableChains = useMemo(() => {
    const set = new Set<number>();
    for (const c of classified) set.add(c.group.chainId);
    return Array.from(set);
  }, [classified]);

  const availableTokens = useMemo(() => {
    const set = new Set<string>();
    for (const c of classified) set.add(c.classification.primary.token.symbol);
    return Array.from(set);
  }, [classified]);

  const availableProtocols = useMemo(() => {
    const set = new Set<string>();
    for (const c of classified) {
      const name = c.classification.vault?.protocol.name;
      if (name) set.add(name);
    }
    return Array.from(set);
  }, [classified]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return classified.filter((c) => {
      if (
        selectedChains.length > 0 &&
        !selectedChains.includes(c.group.chainId)
      ) {
        return false;
      }
      if (
        selectedTokens.length > 0 &&
        !selectedTokens.includes(c.classification.primary.token.symbol)
      ) {
        return false;
      }
      if (selectedProtocols.length > 0) {
        const proto = c.classification.vault?.protocol.name;
        if (!proto || !selectedProtocols.includes(proto)) return false;
      }
      if (q) {
        const hay = [
          c.classification.label,
          c.classification.primary.token.symbol,
          c.classification.vault?.protocol.name ?? "",
          c.group.hash,
          ...c.group.transfers.map((t) => t.counterparty),
          ...c.group.transfers.map((t) => t.token.symbol),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [classified, selectedChains, selectedTokens, selectedProtocols, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // Reset to page 1 when filters or search change
  useEffect(() => {
    setPage(1);
  }, [selectedChains, selectedTokens, selectedProtocols, searchQuery]);

  // Clamp the page if the list shrinks
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  const selectedEntry = filtered.find((e) => e.group.id === selectedId) ?? null;

  const hasActiveFilters =
    selectedChains.length > 0 ||
    selectedTokens.length > 0 ||
    selectedProtocols.length > 0 ||
    searchQuery.trim().length > 0;

  function clearFilters() {
    setSelectedChains([]);
    setSelectedTokens([]);
    setSelectedProtocols([]);
    setSearchQuery("");
  }

  return (
    <main className="min-h-dvh bg-sprout-gradient pb-32">
      <Header />

      <div className="flex items-end justify-between gap-3 px-5 pt-5 pb-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-sprout-text-muted">
            History
          </p>
          <p className="font-heading text-2xl font-800 text-sprout-text-primary mt-0.5">
            Activity
          </p>
        </div>
        <Button
          variant="secondary"
          className="!px-4 !py-2 !text-xs shrink-0"
          onClick={handleRefresh}
        >
          Refresh
        </Button>
      </div>

      {/* Search bar */}
      <div className="px-5 mb-3">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sprout-text-muted pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by token, protocol, address, tx hash"
            className="w-full bg-sprout-card border border-sprout-border rounded-pill pl-10 pr-10 py-2.5 text-sm text-sprout-text-primary placeholder:text-sprout-text-muted shadow-subtle focus:outline-none focus:border-sprout-green-primary"
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

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap px-5 mb-4">
        <ProtocolDropdown
          available={availableProtocols}
          selected={selectedProtocols}
          onChange={setSelectedProtocols}
        />
        <TokenFilterDropdown
          available={availableTokens}
          selected={selectedTokens}
          onChange={setSelectedTokens}
        />
        <ChainDropdown
          selected={selectedChains}
          onChange={setSelectedChains}
        />
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-[11px] font-semibold text-sprout-green-dark cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {loading && classified.length === 0 ? (
        <div className="mx-5 text-sm text-sprout-text-muted animate-pulse">
          Loading activity…
        </div>
      ) : error ? (
        <div className="mx-5 text-sm text-sprout-red-stop">
          Couldn&apos;t load activity — {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mx-5 text-center text-sm text-sprout-text-muted py-10">
          {hasActiveFilters
            ? "No activity matches the selected filters."
            : "No activity yet. Your deposits and transfers will show up here."}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 px-5">
            {paged.map(({ group, classification }) => (
              <ActivityRow
                key={group.id}
                group={group}
                classification={classification}
                onSelect={setSelectedId}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 px-5 mt-5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-sprout-card border border-sprout-border shadow-subtle text-sprout-text-primary disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                aria-label="Previous page"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-xs font-semibold text-sprout-text-secondary">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-sprout-card border border-sprout-border shadow-subtle text-sprout-text-primary disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                aria-label="Next page"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </>
      )}

      <BottomNav />

      <ActivityDetailModal
        open={selectedEntry !== null}
        onClose={() => setSelectedId(null)}
        group={selectedEntry?.group ?? null}
        classification={selectedEntry?.classification ?? null}
      />
    </main>
  );
}

export default function ActivityPage() {
  return (
    <AuthGuard>
      <ActivityContent />
    </AuthGuard>
  );
}
