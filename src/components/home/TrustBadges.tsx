"use client";

import { useEffect, useState } from "react";
import { fetchVaults, fetchProtocols } from "@/lib/api/earn";
import { parseTvl, formatPercent, formatCompactCurrency } from "@/lib/format";

interface TrustStats {
  totalTvlUsd: number;
  avgApy: number;
  protocolCount: number;
}

function useTrustStats(): { stats: TrustStats | null; loading: boolean } {
  const [stats, setStats] = useState<TrustStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [vaultsRes, protocols] = await Promise.all([
          fetchVaults({ sortBy: "tvl", limit: 50 }),
          fetchProtocols(),
        ]);

        if (cancelled) return;

        const vaults = vaultsRes.data;
        const totalTvlUsd = vaults.reduce(
          (sum, v) => sum + parseTvl(v.analytics.tvl.usd),
          0
        );
        const apyValues = vaults
          .map((v) => v.analytics.apy.total)
          .filter((a) => a > 0);
        const avgApy =
          apyValues.length > 0
            ? apyValues.reduce((s, a) => s + a, 0) / apyValues.length
            : 0;

        setStats({
          totalTvlUsd,
          avgApy,
          protocolCount: protocols.length,
        });
      } catch {
        // Silently fail — show nothing rather than fake data
        setStats(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { stats, loading };
}

export function TrustBadges() {
  const { stats, loading } = useTrustStats();

  if (loading || !stats) return null;

  const badges = [
    {
      value: formatCompactCurrency(stats.totalTvlUsd),
      label: "Total deposited",
    },
    {
      value: formatPercent(stats.avgApy),
      label: "Avg. yearly rate",
    },
    {
      value: `${stats.protocolCount}+`,
      label: "Partners",
    },
  ];

  return (
    <div className="flex justify-center items-center gap-0 mx-5 py-4">
      {badges.map((stat, i) => (
        <div key={stat.label} className="flex items-center">
          {i > 0 && <div className="w-px h-8 bg-sprout-border mx-4" />}
          <div className="text-center">
            <div className="text-sm font-bold text-sprout-text-primary">
              {stat.value}
            </div>
            <div className="text-[11px] text-sprout-text-muted">{stat.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
