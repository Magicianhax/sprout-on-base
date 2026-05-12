"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useVaults } from "@/lib/hooks/useVaults";
import { ActivityRow } from "@/components/activity/ActivityRow";
import { ActivityDetailModal } from "@/components/portfolio/ActivityDetailModal";
import {
  classifyActivity,
  cleanGroup,
  type Classification,
} from "@/lib/activity";
import type { ActivityGroup } from "@/lib/types";

const HOME_LIMIT = 5;

interface RecentActivityProps {
  records: ActivityGroup[];
  loading?: boolean;
  error?: string | null;
  /**
   * When true, caps the list and shows a "View all" link to /activity.
   * Defaults to false (caller handles slicing/pagination).
   */
  compact?: boolean;
}

interface ClassifiedGroup {
  group: ActivityGroup;
  classification: Classification;
}

export function RecentActivity({
  records,
  loading,
  error,
  compact = false,
}: RecentActivityProps) {
  const router = useRouter();
  const { vaults } = useVaults();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visible = useMemo<ClassifiedGroup[]>(() => {
    const cleaned = records
      .map((g) => cleanGroup(g, vaults))
      .filter((g) => g.transfers.length > 0);
    return cleaned.map((g) => ({
      group: g,
      classification: classifyActivity(g, vaults),
    }));
  }, [records, vaults]);

  if (loading) {
    return (
      <div className="mx-5 text-sm text-sprout-text-muted animate-pulse">
        Loading activity…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-5 text-sm text-sprout-red-stop">
        Couldn&apos;t load activity — {error}
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="mx-5 text-center text-sm text-sprout-text-muted py-6">
        No activity yet. Your deposits and transfers will show up here.
      </div>
    );
  }

  const shown = compact ? visible.slice(0, HOME_LIMIT) : visible;
  const hasMore = compact && visible.length > HOME_LIMIT;
  const selectedEntry = visible.find((v) => v.group.id === selectedId) ?? null;

  return (
    <div className="mx-5">
      <h3 className="text-sm font-semibold text-sprout-text-secondary mb-3">
        Recent Activity
      </h3>
      <div className="flex flex-col gap-2">
        {shown.map(({ group, classification }) => (
          <ActivityRow
            key={group.id}
            group={group}
            classification={classification}
            onSelect={setSelectedId}
          />
        ))}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => router.push("/activity")}
          className="mt-3 w-full text-center text-xs font-semibold text-sprout-green-dark py-2 cursor-pointer"
        >
          View all activity →
        </button>
      )}

      <ActivityDetailModal
        open={selectedEntry !== null}
        onClose={() => setSelectedId(null)}
        group={selectedEntry?.group ?? null}
        classification={selectedEntry?.classification ?? null}
      />
    </div>
  );
}
