"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { usePrivy } from "@/lib/wallet";
import { ArrowLeft, ExternalLink, Info } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TokenIcon } from "@/components/ui/TokenIcon";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { usePositions } from "@/lib/hooks/usePositions";
import { useVaults } from "@/lib/hooks/useVaults";
import { useWithdrawFlow } from "@/lib/hooks/useWithdrawFlow";
import { fetchVaults } from "@/lib/api/earn";
import { TransactionModal } from "@/components/deposit/TransactionModal";
import { PoweredByLifi } from "@/components/ui/PoweredByLifi";
import {
  formatPercent,
  formatCompactCurrency,
  formatCurrency,
  parseTvl,
  getRiskLevel,
} from "@/lib/format";
import { CHAIN_NAMES } from "@/lib/constants";
import type { Vault } from "@/lib/types";


const RISK_DESCRIPTIONS: Record<"low" | "medium" | "high", string> = {
  low: "This vault holds stablecoin assets with minimal price volatility. Smart contract risk is present in all DeFi protocols, but this vault uses audited, battle-tested code. Suitable for users who want to preserve principal while earning yield.",
  medium:
    "This vault involves some price exposure or liquidity risk. Returns may vary based on market conditions. Smart contract risk is present. Only deposit funds you are comfortable with at moderate risk.",
  high: "This vault carries significant risk including impermanent loss, leverage, or high volatility. You could lose a substantial portion of your deposit. Only use with funds you can afford to lose.",
};

const TAG_LABELS: Record<string, string> = {
  stablecoin: "Stablecoin",
  single: "Single Asset",
  "blue-chip": "Blue Chip",
  multi: "Multi Asset",
  "il-risk": "IL Risk",
  leveraged: "Leveraged",
  lending: "Lending",
  "yield-farming": "Yield Farming",
};

function VaultDetailContent({ vault, chainId }: { vault: Vault; chainId: number }) {
  const router = useRouter();
  const { user } = usePrivy();
  const address = user?.wallet?.address;
  const { positions, reload: reloadPositions } = usePositions(address);
  const withdraw = useWithdrawFlow();

  const token = vault.underlyingTokens[0];
  const apy = vault.analytics.apy.total;
  const tvlUsd = parseTvl(vault.analytics.tvl.usd);
  const riskLevel = getRiskLevel(vault.tags);
  const chainName = CHAIN_NAMES[vault.chainId] ?? `Chain ${vault.chainId}`;

  const userPosition = positions.find(
    (p) =>
      p.asset.address.toLowerCase() === (vault.underlyingTokens[0]?.address ?? "").toLowerCase() &&
      p.chainId === vault.chainId
  );

  const hasPosition = Boolean(userPosition);

  function handleEarnMore() {
    router.push(`/deposit?vault=${vault.address}&chainId=${chainId}`);
  }

  function handleStopEarning() {
    if (!userPosition) return;
    void withdraw.start(userPosition);
  }

  return (
    <main className="min-h-dvh bg-sprout-gradient pb-16">
      {/* Back header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 rounded-xl hover:bg-black/5 transition-colors cursor-pointer"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5 text-sprout-text-primary" />
        </button>
        <span className="font-heading text-lg font-700 text-sprout-text-primary flex-1">
          Vault Details
        </span>
        <Badge color="blue" className="text-[11px]">
          PRO
        </Badge>
      </div>

      <div className="flex flex-col gap-4 px-5">
        {/* Vault identity card */}
        <Card shadow="card">
          {/* Token icon + name + subtitle */}
          <div className="flex items-center gap-3 mb-4">
            <div className="shrink-0">
              {token ? (
                <TokenIcon type="token" identifier={token.symbol} size={52} />
              ) : (
                <div
                  className="rounded-xl bg-sprout-green-light flex items-center justify-center text-sprout-green-dark font-bold text-sm"
                  style={{ width: 52, height: 52 }}
                >
                  ?
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-heading text-lg font-700 text-sprout-text-primary truncate leading-tight">
                {vault.name}
              </p>
              <p className="text-sm text-sprout-text-muted mt-0.5">
                {vault.protocol.name} · {chainName}
              </p>
            </div>
          </div>

          {/* Stats grid 2x2 */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {/* Yearly Rate — green */}
            <div className="bg-green-50 rounded-2xl p-3">
              <p className="text-[11px] font-semibold text-green-700 mb-1 uppercase tracking-wide">
                Yearly Rate
              </p>
              <p className="font-heading text-xl font-800 text-green-800">
                {formatPercent(apy)}
              </p>
            </div>

            {/* Total Deposited — amber */}
            <div className="bg-amber-50 rounded-2xl p-3">
              <p className="text-[11px] font-semibold text-amber-700 mb-1 uppercase tracking-wide">
                Total Deposited
              </p>
              <p className="font-heading text-xl font-800 text-amber-800">
                {formatCompactCurrency(tvlUsd)}
              </p>
            </div>

            {/* Asset — blue */}
            <div className="bg-blue-50 rounded-2xl p-3">
              <p className="text-[11px] font-semibold text-blue-700 mb-1 uppercase tracking-wide">
                Asset
              </p>
              <p className="font-heading text-xl font-800 text-blue-800">
                {token?.symbol ?? "—"}
              </p>
            </div>

            {/* Chain — purple */}
            <div className="bg-purple-50 rounded-2xl p-3">
              <p className="text-[11px] font-semibold text-purple-700 mb-1 uppercase tracking-wide">
                Chain
              </p>
              <p className="font-heading text-xl font-800 text-purple-800 truncate">
                {chainName}
              </p>
            </div>
          </div>

          {/* Tags row */}
          {vault.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {vault.tags.map((tag) => (
                <Badge key={tag} color="gray">
                  {TAG_LABELS[tag] ?? tag}
                </Badge>
              ))}
            </div>
          )}
        </Card>

        {/* Position card — only if user has position */}
        {hasPosition && userPosition && (
          <Card shadow="subtle">
            <p className="text-xs font-semibold text-sprout-text-muted uppercase tracking-wide mb-3">
              Your Position
            </p>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-heading text-2xl font-800 text-sprout-text-primary">
                  {formatCurrency(parseFloat(userPosition.balanceUsd || "0"))}
                </p>
                <p className="text-sm text-sprout-text-muted mt-0.5">
                  Current balance
                </p>
              </div>
              <div className="text-right">
                <Badge color="green" className="text-sm px-3 py-1">
                  {userPosition.balanceNative} {userPosition.asset.symbol}
                </Badge>
              </div>
            </div>
          </Card>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 items-center">
          <Button
            variant="primary"
            className="flex-1"
            onClick={handleEarnMore}
          >
            {hasPosition ? "Earn More" : "Start Earning"}
          </Button>
          {hasPosition && (
            <Button
              variant="danger-text"
              className="shrink-0 px-4"
              onClick={handleStopEarning}
            >
              Stop Earning
            </Button>
          )}
        </div>

        {/* About protocol */}
        {vault.protocol.url && (
          <Card shadow="subtle">
            <p className="font-heading text-base font-700 text-sprout-text-primary mb-2">
              About {vault.protocol.name}
            </p>
            <a
              href={vault.protocol.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-sprout-green-dark hover:underline"
            >
              Visit website
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Card>
        )}

        {/* Risk info */}
        <div
          className="rounded-card p-5 border"
          style={{ backgroundColor: "#FFFBEB", borderColor: "#FEF3C7" }}
        >
          <div className="flex gap-3">
            <Info
              className="w-5 h-5 shrink-0 mt-0.5"
              style={{ color: "#92400E" }}
            />
            <div>
              <p
                className="text-sm font-semibold mb-1"
                style={{ color: "#92400E" }}
              >
                Risk Information
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "#92400E" }}>
                {RISK_DESCRIPTIONS[riskLevel]}
              </p>
            </div>
          </div>
        </div>


        <PoweredByLifi className="pt-4 pb-2" />
      </div>

      <TransactionModal
        status={withdraw.modalStatus}
        intent="withdraw"
        txHash={withdraw.state.txHash}
        chainId={withdraw.state.position?.chainId}
        errorMessage={withdraw.state.errorMessage}
        onClose={() => {
          withdraw.close();
          reloadPositions();
        }}
        onRetry={withdraw.retry}
      />
    </main>
  );
}

function VaultDetailLoader() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const vaultAddress = params.id;
  const chainId = Number(searchParams.get("chainId") ?? 0);

  // Reuse the shared vault cache — if home page already loaded, this is free.
  const { vaults: cachedVaults, loading: cacheLoading } = useVaults();

  const cachedVault = useMemo(() => {
    if (!vaultAddress) return null;
    return (
      cachedVaults.find(
        (v) =>
          v.address.toLowerCase() === vaultAddress.toLowerCase() &&
          (!chainId || v.chainId === chainId)
      ) ?? null
    );
  }, [cachedVaults, vaultAddress, chainId]);

  const [fallbackVault, setFallbackVault] = useState<Vault | null>(null);
  const [fallbackLoading, setFallbackLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only hit the network if the vault isn't in the shared cache once the
  // cache has finished loading. This happens when users deep-link directly
  // to a vault they haven't browsed to.
  useEffect(() => {
    if (!vaultAddress) return;
    if (cachedVault) return;
    if (cacheLoading) return;

    let cancelled = false;

    async function loadVault() {
      setFallbackLoading(true);
      setError(null);
      try {
        let found: Vault | undefined;
        let cursor: string | undefined;

        for (let page = 0; page < 10 && !found; page++) {
          const response = await fetchVaults({
            ...(chainId ? { chainId } : {}),
            limit: 100,
            cursor,
          });
          if (cancelled) return;

          found = response.data.find(
            (v) =>
              v.address.toLowerCase() === vaultAddress.toLowerCase() &&
              (!chainId || v.chainId === chainId)
          );

          cursor = response.nextCursor;
          if (!cursor) break;
        }

        if (cancelled) return;
        if (!found) {
          setError("Vault not found.");
        } else {
          setFallbackVault(found);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load vault data."
          );
        }
      } finally {
        if (!cancelled) setFallbackLoading(false);
      }
    }

    loadVault();

    return () => {
      cancelled = true;
    };
  }, [vaultAddress, chainId, cachedVault, cacheLoading]);

  const vault = cachedVault ?? fallbackVault;
  const loading = !vault && (cacheLoading || fallbackLoading);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="font-heading text-lg text-sprout-green-dark animate-pulse">
          Loading vault…
        </div>
      </div>
    );
  }

  if (error || !vault) {
    return (
      <main className="min-h-dvh bg-sprout-gradient">
        <div className="flex items-center gap-3 px-5 pt-5 pb-4">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-xl hover:bg-black/5 transition-colors cursor-pointer"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-sprout-text-primary" />
          </button>
          <span className="font-heading text-lg font-700 text-sprout-text-primary">
            Vault Details
          </span>
        </div>
        <div className="mx-5 mt-4 bg-red-50 rounded-2xl p-4 text-sm text-red-600">
          {error ?? "Vault not found."}
        </div>
      </main>
    );
  }

  return <VaultDetailContent vault={vault} chainId={chainId} />;
}

export default function VaultDetailPage() {
  return (
    <AuthGuard>
      <VaultDetailLoader />
    </AuthGuard>
  );
}
