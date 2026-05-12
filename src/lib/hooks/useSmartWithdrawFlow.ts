"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWallets } from "@/lib/wallet";
import { useVaults } from "@/lib/hooks/useVaults";
import {
  invalidatePositions,
  optimisticallyRemovePosition,
} from "@/lib/hooks/usePositions";
import { invalidateActivity } from "@/lib/hooks/useActivity";
import { invalidateBalances } from "@/lib/hooks/useBalances";
import { executeVaultWithdraw } from "@/lib/withdrawExecutor";
import { friendlyErrorMessage } from "@/lib/lifi/routeAdapter";
import { POSITION_RESYNC_DELAYS_MS, TOKEN_ADDRESSES } from "@/lib/constants";
import {
  buildWithdrawPlan,
  planTotalUsd,
  type WithdrawStep,
} from "@/lib/withdrawPlanner";
import type { Position, Vault } from "@/lib/types";
import { sendBaseNotification } from "@/lib/notify";
import { loadPreferences } from "@/stores/preferences";

type Phase = "idle" | "planning" | "confirming" | "success" | "error";

export interface SmartWithdrawState {
  phase: Phase;
  plan: WithdrawStep[];
  /** Which step is currently being signed / waiting on the wallet. */
  currentStepIndex: number;
  /** Successful step results, in order. */
  completed: Array<{ step: WithdrawStep; txHash: string }>;
  errorMessage: string;
  requestedUsd: number;
  /**
   * Optional destination chain the user picked in the withdraw
   * modal. Each step's withdraw is targeted at USDC on this
   * chain — executeVaultWithdraw routes via LI.FI when it's
   * different from the vault's chain. Undefined = deliver to
   * each position's own chain.
   */
  destinationChainId?: number;
}

const INITIAL: SmartWithdrawState = {
  phase: "idle",
  plan: [],
  currentStepIndex: -1,
  completed: [],
  errorMessage: "",
  requestedUsd: 0,
  destinationChainId: undefined,
};

function scheduleResync(walletAddress: string) {
  invalidateBalances(walletAddress).catch(() => {});
  invalidatePositions(walletAddress).catch(() => {});
  for (const ms of POSITION_RESYNC_DELAYS_MS) {
    setTimeout(() => {
      invalidateBalances(walletAddress).catch(() => {});
      invalidatePositions(walletAddress).catch(() => {});
      invalidateActivity(walletAddress).catch(() => {});
    }, ms);
  }
}

async function resolveVault(
  position: Position,
  cachedVaults: Vault[]
): Promise<Vault> {
  // Prefer the vault the wallet actually holds shares in — stamped
  // on position.vaultAddress by the remap in usePositions. Falls
  // back to the looser (chain, protocol, underlying) match only if
  // vaultAddress is missing (e.g. the vault cache hadn't streamed
  // far enough at remap time).
  if (position.vaultAddress) {
    const target = position.vaultAddress.toLowerCase();
    const byAddress = cachedVaults.find(
      (v) =>
        v.chainId === position.chainId &&
        v.address.toLowerCase() === target
    );
    if (byAddress) return byAddress;
  }
  const assetAddr = position.asset.address.toLowerCase();
  const hit = cachedVaults.find(
    (v) =>
      v.chainId === position.chainId &&
      v.protocol.name === position.protocolName &&
      v.underlyingTokens.some((t) => t.address.toLowerCase() === assetAddr)
  );
  if (!hit) {
    throw new Error("Couldn't find the source vault for one of the steps.");
  }
  return hit;
}

export function useSmartWithdrawFlow() {
  const { wallets } = useWallets();
  const { vaults: cachedVaults } = useVaults();
  const [state, setState] = useState<SmartWithdrawState>(INITIAL);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);

  // Correctly track mounted state across React strict-mode double-
  // invocations: set to true on every effect run, false only on the
  // real unmount cleanup. A cleanup-only effect would flip the ref
  // to false on the strict-mode simulated remount and never reset
  // it, silently dropping every setState that followed.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const safeSetState = useCallback(
    (
      updater:
        | SmartWithdrawState
        | ((prev: SmartWithdrawState) => SmartWithdrawState)
    ) => {
      if (!mountedRef.current) return;
      setState(updater);
    },
    []
  );

  const close = useCallback(() => {
    inFlightRef.current = false;
    safeSetState(INITIAL);
  }, [safeSetState]);

  // Execute an already-built plan starting at `fromIndex`. Used by both
  // start() and retry() so resume-on-failure shares one code path.
  const executePlan = useCallback(
    async (
      plan: WithdrawStep[],
      fromIndex: number,
      requestedUsd: number,
      destinationChainId?: number
    ) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        const wallet = wallets.find((w) => !!w.address) ?? wallets[0];
        if (!wallet) {
          throw new Error("No wallet found. Please reconnect.");
        }

        safeSetState((s) => ({
          ...s,
          phase: "confirming",
          plan,
          currentStepIndex: fromIndex,
          requestedUsd,
          destinationChainId,
          errorMessage: "",
        }));

        // Target token on the destination chain, if set. Lite
        // mode always delivers to USDC — if TOKEN_ADDRESSES doesn't
        // have USDC on the chosen chain we fall back to per-
        // position defaults (no cross-chain routing).
        const destTokenAddress =
          destinationChainId !== undefined
            ? TOKEN_ADDRESSES["USDC"]?.[destinationChainId]
            : undefined;

        for (let i = fromIndex; i < plan.length; i++) {
          const step = plan[i];
          safeSetState((s) => ({ ...s, currentStepIndex: i }));

          const vault = await resolveVault(step.position, cachedVaults);

          const { txHash, isFullWithdrawal } = await executeVaultWithdraw({
            wallet,
            position: step.position,
            vault,
            amount: step.amount,
            toChainId:
              destinationChainId ?? undefined,
            toTokenAddress: destTokenAddress,
            // No per-step UI flicker — we're already in "confirming".
          });

          // Optimistically remove the whole position from the shared
          // cache only if we redeemed all of it. Partial steps rely on
          // the background resync.
          if (isFullWithdrawal) {
            optimisticallyRemovePosition(
              wallet.address,
              step.position.chainId,
              step.position.asset.address,
              step.position.protocolName,
              step.position.vaultAddress
            );
          }

          safeSetState((s) => ({
            ...s,
            completed: [...s.completed, { step, txHash }],
          }));
        }

        // Plan fully executed — kick the long-tail resync so balances,
        // positions, and activity reflect the new state.
        const wa = wallet.address;
        scheduleResync(wa);

        safeSetState((s) => ({ ...s, phase: "success" }));

        if (loadPreferences().notificationsEnabled) {
          const amount = requestedUsd > 0
            ? `$${requestedUsd.toFixed(2)} `
            : "";
          void sendBaseNotification({
            walletAddress: wa,
            title: "Withdrawal complete",
            message: `Your ${amount}withdrawal is back in your wallet.`,
            targetPath: "/portfolio",
          });
        }
      } catch (err) {
        console.error("[smart-withdraw] flow failed", err);
        const isUserReject =
          err instanceof Error && err.name === "UserRejectedError";
        const message = isUserReject
          ? err.message
          : friendlyErrorMessage(err);
        safeSetState((s) => ({ ...s, phase: "error", errorMessage: message }));
      } finally {
        inFlightRef.current = false;
      }
    },
    [wallets, cachedVaults, safeSetState]
  );

  const start = useCallback(
    async (
      requestedUsd: number,
      positions: Position[],
      destinationChainId?: number
    ) => {
      if (inFlightRef.current) return;

      const plan = buildWithdrawPlan(positions, cachedVaults, requestedUsd);
      if (plan.length === 0) {
        safeSetState((s) => ({
          ...s,
          phase: "error",
          errorMessage: "Nothing to withdraw for the requested amount.",
          requestedUsd,
          destinationChainId,
        }));
        return;
      }

      // If we can't cover the requested amount with available
      // positions, abort early with a clear error.
      const planTotal = planTotalUsd(plan);
      if (planTotal < requestedUsd * 0.99) {
        safeSetState((s) => ({
          ...s,
          phase: "error",
          errorMessage: `You only have about $${planTotal.toFixed(
            2
          )} earning — try a smaller amount.`,
          requestedUsd,
          destinationChainId,
          plan,
        }));
        return;
      }

      safeSetState({
        phase: "planning",
        plan,
        currentStepIndex: 0,
        completed: [],
        errorMessage: "",
        requestedUsd,
        destinationChainId,
      });

      await executePlan(plan, 0, requestedUsd, destinationChainId);
    },
    [cachedVaults, executePlan, safeSetState]
  );

  // Resume from wherever we failed.
  const retry = useCallback(() => {
    if (state.plan.length === 0) return;
    const fromIndex = state.completed.length;
    if (fromIndex >= state.plan.length) return;
    safeSetState((s) => ({ ...s, phase: "confirming", errorMessage: "" }));
    void executePlan(
      state.plan,
      fromIndex,
      state.requestedUsd,
      state.destinationChainId
    );
  }, [
    state.plan,
    state.completed.length,
    state.requestedUsd,
    state.destinationChainId,
    executePlan,
    safeSetState,
  ]);

  const modalStatus: "confirming" | "success" | "error" | null =
    state.phase === "success"
      ? "success"
      : state.phase === "error"
      ? "error"
      : state.phase === "confirming" || state.phase === "planning"
      ? "confirming"
      : null;

  return {
    state,
    start,
    retry,
    close,
    modalStatus,
  };
}
