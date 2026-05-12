"use client";

import { invalidateBalances } from "@/lib/hooks/useBalances";
import { invalidatePositions } from "@/lib/hooks/usePositions";
import { invalidateActivity } from "@/lib/hooks/useActivity";
import { invalidateAllVaults } from "@/lib/hooks/useVaults";

/**
 * Force a fresh fetch for every piece of state visible in the app.
 * Used by the refresh buttons on Home/Portfolio/Activity so users
 * can guarantee they're not looking at stale data.
 *
 * Every invalidate* call returns a promise that already kicks the
 * refetch — we fire them in parallel and swallow individual errors
 * so one failing source can't block the rest.
 */
export async function refreshEverything(
  walletAddress: string | undefined
): Promise<void> {
  // Vaults aren't keyed by wallet — nuke the shared stream so the
  // next useVaults() subscribe triggers a fresh paginated fetch.
  invalidateAllVaults();

  if (!walletAddress) return;

  await Promise.allSettled([
    invalidateBalances(walletAddress),
    invalidatePositions(walletAddress),
    invalidateActivity(walletAddress),
  ]);
}
