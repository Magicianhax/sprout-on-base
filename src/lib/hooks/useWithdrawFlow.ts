"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWallets } from "@/lib/wallet";
import { fetchVaults } from "@/lib/api/earn";
import {
  POSITION_RESYNC_DELAYS_MS,
  TOKEN_ADDRESSES,
  VAULT_MAX_PAGES,
  VAULT_PAGE_SIZE,
} from "@/lib/constants";
import { useVaults } from "@/lib/hooks/useVaults";
import {
  invalidatePositions,
  optimisticallyRemovePosition,
} from "@/lib/hooks/usePositions";
import { invalidateActivity } from "@/lib/hooks/useActivity";
import { invalidateBalances } from "@/lib/hooks/useBalances";
import { executeVaultWithdraw } from "@/lib/withdrawExecutor";
import { friendlyErrorMessage } from "@/lib/lifi/routeAdapter";
import type { Position, Vault } from "@/lib/types";
import { sendBaseNotification } from "@/lib/notify";
import { loadPreferences } from "@/stores/preferences";

type Phase = "idle" | "quoting" | "confirming" | "success" | "error";

interface FlowState {
  phase: Phase;
  position: Position | null;
  txHash: string;
  errorMessage: string;
  /** Amount requested on the current run — used by retry. Undefined means full. */
  requestedAmount?: number;
  /** Optional destination chain for cross-chain exits. */
  requestedDestinationChainId?: number;
  /** Optional output token symbol chosen by the user. */
  requestedOutputTokenSymbol?: string;
}

const INITIAL: FlowState = {
  phase: "idle",
  position: null,
  txHash: "",
  errorMessage: "",
  requestedDestinationChainId: undefined,
  requestedOutputTokenSymbol: undefined,
};

// On successful withdrawal: if the user withdrew the full position we
// remove it from the shared cache immediately so the UI updates without
// waiting for the earn indexer. For partial withdrawals we just kick a
// reload — the position still exists with a smaller balance and the
// indexer will report the new number after ~5–30 s. In both cases we
// schedule a few background reloads to confirm the final state.
function markWithdrawn(
  position: Position,
  walletAddress: string,
  isFullWithdrawal: boolean
) {
  if (isFullWithdrawal) {
    optimisticallyRemovePosition(
      walletAddress,
      position.chainId,
      position.asset.address,
      position.protocolName,
      position.vaultAddress
    );
  }
  // Fire an immediate round so the user sees the change as soon as
  // they close the success modal, then follow up on the retry
  // schedule for the slow indexer tail.
  invalidateBalances(walletAddress).catch(() => {});
  for (const ms of POSITION_RESYNC_DELAYS_MS) {
    setTimeout(() => {
      invalidateBalances(walletAddress).catch(() => {});
      invalidatePositions(walletAddress).catch((err) => {
        console.warn("[withdraw] background position resync failed", err);
      });
      invalidateActivity(walletAddress).catch(() => {
        /* non-critical */
      });
    }, ms);
  }
}

function matchVault(position: Position, vault: Vault): boolean {
  if (vault.chainId !== position.chainId) return false;
  // The position remap in usePositions resolves the exact vault
  // share token the wallet holds on-chain and stamps it on
  // position.vaultAddress. When present it's the canonical match
  // — multiple vaults can share (chainId, protocolName, underlying),
  // and picking the first one by that tuple is what caused the
  // "no shares to redeem" error when a user held a different yo
  // vault than the one `find` happened to pick.
  if (position.vaultAddress) {
    return vault.address.toLowerCase() === position.vaultAddress.toLowerCase();
  }
  return (
    vault.protocol.name === position.protocolName &&
    vault.underlyingTokens.some(
      (t) => t.address.toLowerCase() === position.asset.address.toLowerCase()
    )
  );
}

// Shared withdrawal flow used everywhere Stop Earning lives (portfolio
// list, vault detail, etc.). Callers pass in the Position — the hook
// resolves the vault's receipt token, fetches a composer quote for the
// full native balance, and fires the wallet transaction automatically.
export function useWithdrawFlow() {
  // Reading useVaults() here subscribes to the shared vault cache so
  // we have a receipt-token address for the position's protocol.
  const { vaults: cachedVaults } = useVaults();
  const { wallets } = useWallets();

  const [state, setState] = useState<FlowState>(INITIAL);
  const inFlightRef = useRef(false);
  // Tracks whether the consumer has unmounted or closed the modal so
  // late-arriving promise resolutions don't write into stale state.
  const closedRef = useRef(false);

  useEffect(() => {
    closedRef.current = false;
    return () => {
      closedRef.current = true;
    };
  }, []);

  const safeSetState = useCallback(
    (updater: FlowState | ((s: FlowState) => FlowState)) => {
      if (closedRef.current) return;
      setState(updater);
    },
    []
  );

  const close = useCallback(() => {
    inFlightRef.current = false;
    closedRef.current = true;
    setState(INITIAL);
    // Allow a fresh run after re-open from the same hook instance.
    queueMicrotask(() => {
      closedRef.current = false;
    });
  }, []);

  const resolveVault = useCallback(
    async (position: Position): Promise<Vault> => {
      const cached = cachedVaults.find((v) => matchVault(position, v));
      if (cached) return cached;

      // Fallback — the vault cache hasn't reached this protocol/chain
      // yet. Paginate the earn API directly until we find a match.
      let cursor: string | undefined;
      for (let page = 0; page < VAULT_MAX_PAGES; page++) {
        const res = await fetchVaults({
          chainId: position.chainId,
          limit: VAULT_PAGE_SIZE,
          cursor,
        });
        const hit = res.data.find((v) => matchVault(position, v));
        if (hit) return hit;
        if (!res.nextCursor) break;
        cursor = res.nextCursor;
      }

      throw new Error("Couldn't find this vault to withdraw from.");
    },
    [cachedVaults]
  );

  const run = useCallback(
    async (
      position: Position,
      options?: {
        amount?: number;
        destinationChainId?: number;
        outputTokenSymbol?: string;
      }
    ) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      closedRef.current = false;

      safeSetState({
        phase: "quoting",
        position,
        txHash: "",
        errorMessage: "",
        requestedAmount: options?.amount,
        requestedDestinationChainId: options?.destinationChainId,
        requestedOutputTokenSymbol: options?.outputTokenSymbol,
      });

      try {
        const wallet = wallets.find((w) => !!w.address) ?? wallets[0];
        if (!wallet) {
          throw new Error("No wallet found. Please reconnect.");
        }

        const vault = await resolveVault(position);

        // Resolve target chain + token. Default to the vault's own
        // chain + underlying (direct redeem path). If either differs,
        // the executor goes straight through LI.FI for the cross-chain
        // / cross-token exit.
        const destChainId =
          options?.destinationChainId ?? position.chainId;
        const destSymbol =
          options?.outputTokenSymbol ?? position.asset.symbol;
        const destTokenAddress =
          TOKEN_ADDRESSES[destSymbol]?.[destChainId] ??
          TOKEN_ADDRESSES["USDC"]?.[destChainId];

        const isCustomExit =
          destChainId !== position.chainId ||
          destSymbol.toUpperCase() !== position.asset.symbol.toUpperCase();

        const { txHash, isFullWithdrawal } = await executeVaultWithdraw({
          wallet,
          position,
          vault,
          amount: options?.amount,
          toChainId: isCustomExit ? destChainId : undefined,
          toTokenAddress: isCustomExit ? destTokenAddress : undefined,
          onConfirming: () => {
            safeSetState((s) => ({ ...s, phase: "confirming" }));
          },
        });

        markWithdrawn(position, wallet.address, isFullWithdrawal);
        safeSetState((s) => ({ ...s, phase: "success", txHash }));

        if (loadPreferences().notificationsEnabled) {
          const symbol = position.asset?.symbol ?? "funds";
          void sendBaseNotification({
            walletAddress: wallet.address,
            title: "Withdrawal complete",
            message: `Your ${symbol} is back in your wallet.`,
            targetPath: "/portfolio",
          });
        }
      } catch (err) {
        console.error("[withdraw] flow failed", err);
        // UserRejectedError carries a clean message; other errors get
        // translated (LI.FI no-route / amount-too-low / etc.) so the
        // user sees something they can act on instead of an SDK stack.
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
    [wallets, resolveVault, safeSetState]
  );

  const retry = useCallback(() => {
    if (!state.position) return;
    void run(state.position, {
      amount: state.requestedAmount,
      destinationChainId: state.requestedDestinationChainId,
      outputTokenSymbol: state.requestedOutputTokenSymbol,
    });
  }, [
    run,
    state.position,
    state.requestedAmount,
    state.requestedDestinationChainId,
    state.requestedOutputTokenSymbol,
  ]);

  const modalStatus: "confirming" | "success" | "error" | null =
    state.phase === "success"
      ? "success"
      : state.phase === "error"
      ? "error"
      : state.phase === "confirming" || state.phase === "quoting"
      ? "confirming"
      : null;

  return {
    state,
    start: run,
    retry,
    close,
    modalStatus,
  };
}
