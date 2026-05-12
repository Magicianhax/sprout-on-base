"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWallets } from "@/lib/wallet";
import {
  executeRoute,
  getRoutes,
  resumeRoute,
  stopRouteExecution,
  type Route,
  type RouteExtended,
} from "@lifi/sdk";
import {
  DEFAULT_SLIPPAGE,
  POSITION_RESYNC_DELAYS_MS,
} from "@/lib/constants";
import { encodeBalanceOf } from "@/lib/depositEncoder";
import { invalidateBalances } from "@/lib/hooks/useBalances";
import {
  invalidatePositions,
  optimisticallyAddPosition,
} from "@/lib/hooks/usePositions";
import { seedVaultsIntoCache } from "@/lib/hooks/useVaults";
import { invalidateActivity } from "@/lib/hooks/useActivity";
import {
  activeStepIndex,
  finalTxFromRoute,
  firstFailureMessage,
  friendlyErrorMessage,
  isSdkUserRejection,
  routeToDepositSteps,
  type DepositStepView,
} from "@/lib/lifi/routeAdapter";
import {
  clearRoute,
  loadRoute,
  saveRoute,
} from "@/lib/lifi/routePersistence";
import type { EthereumProvider, Vault } from "@/lib/types";
import { sendBaseNotification } from "@/lib/notify";
import { loadPreferences } from "@/stores/preferences";

// Deposit flow powered by LI.FI Composer via @lifi/sdk. Uses
// getRoutes (/v1/advanced/routes) rather than getQuote (/v1/quote):
// advanced/routes is more permissive — it returns multi-step routes
// LI.FI can chain internally (e.g. Across-with-destination-call that
// shows up as one LiFiStep with includedSteps = [cross, protocol]).
// /v1/quote bails when it can't find a single pre-bundled tx. The
// Jumper frontend uses /v1/advanced/routes for the same reason.
//
// Two tiers, Composer always first — no user-facing knobs for
// routing strategy (validated via LI.FI MCP: for a representative
// failing pair the unfiltered getRoutes returned 9 valid Composer
// options, all of which land in the vault. Any bridge allowlist
// would actively block most of those routes for no user benefit):
//
//   1. getRoutes(toToken=vault, no bridge filter). Covers same-chain
//      and cross-chain. LI.FI picks the best Composer route — 1-tx
//      via Across/Stargate destination call when available, else a
//      2-signature bridge+deposit that the SDK still orchestrates.
//   2. getRoutes(toToken=underlying on dest chain), executeRoute,
//      wait for bridged funds, then a same-chain Composer deposit.
//      Only kicks in when tier 1 couldn't land in the vault —
//      happens for protocols Composer doesn't support on the dest
//      chain, or when Composer's destination-call path silently
//      degrades to plain bridge.
//
// The executeRoute helper drives every step. User doesn't need to
// keep the tab open mid-bridge; SDK handles status polling and
// destination chain switch automatically.

export type DepositPhase =
  | "idle"
  | "quoting"
  | "executing"
  | "success"
  | "error";

export type { DepositStepView } from "@/lib/lifi/routeAdapter";

export interface DepositFlowState {
  phase: DepositPhase;
  steps: DepositStepView[];
  activeStepIndex: number;
  errorMessage: string;
  finalTxHash: string;
  finalChainId?: number;
}

const INITIAL: DepositFlowState = {
  phase: "idle",
  steps: [],
  activeStepIndex: -1,
  errorMessage: "",
  finalTxHash: "",
  finalChainId: undefined,
};

export interface DepositSource {
  chainId: number;
  tokenAddress: string;
  tokenSymbol: string;
  amountRaw: string;
}

export interface StartDepositArgs {
  sources: DepositSource[];
  vault: Vault;
}

interface SourceProgress {
  source: DepositSource;
  // Routes executed for this source, in order. One for the direct-
  // Composer case (single Route whose terminal step lands in the
  // vault). Two for the tier-3 fallback (plain bridge Route, then a
  // same-chain Composer Route that finishes the deposit).
  routes: RouteExtended[];
  placeholderLabel: string;
}

function scheduleResync(walletAddress: string): void {
  invalidateBalances(walletAddress).catch(() => {});
  invalidatePositions(walletAddress).catch(() => {});
  invalidateActivity(walletAddress).catch(() => {});
  for (const ms of POSITION_RESYNC_DELAYS_MS) {
    setTimeout(() => {
      invalidateBalances(walletAddress).catch(() => {});
      invalidatePositions(walletAddress).catch(() => {});
      invalidateActivity(walletAddress).catch(() => {});
    }, ms);
  }
}

function sortSources(
  sources: DepositSource[],
  destChainId: number
): DepositSource[] {
  return sources
    .filter((s) => {
      try {
        return BigInt(s.amountRaw) > BigInt(0);
      } catch {
        return false;
      }
    })
    .sort((a, b) => {
      // Same-chain first (no bridge), then cross-chain in descending
      // amount order. Matches the previous planner so retry semantics
      // don't change.
      if (a.chainId === destChainId && b.chainId !== destChainId) return -1;
      if (b.chainId === destChainId && a.chainId !== destChainId) return 1;
      try {
        const diff = BigInt(b.amountRaw) - BigInt(a.amountRaw);
        return diff > BigInt(0) ? 1 : diff < BigInt(0) ? -1 : 0;
      } catch {
        return 0;
      }
    });
}

function buildSteps(
  progress: SourceProgress[],
  vault: Vault
): DepositStepView[] {
  const steps: DepositStepView[] = [];
  for (const p of progress) {
    if (p.routes.length === 0) {
      steps.push({
        id: `source-${p.source.chainId}-${p.source.tokenAddress}`,
        label: p.placeholderLabel,
        chainId: p.source.chainId,
        status: "pending",
      });
      continue;
    }
    for (const route of p.routes) {
      steps.push(...routeToDepositSteps(route, vault));
    }
  }
  return steps;
}

function buildActiveIndex(progress: SourceProgress[]): number {
  let offset = 0;
  for (const p of progress) {
    if (p.routes.length === 0) return offset;
    for (const route of p.routes) {
      const local = activeStepIndex(route);
      if (local >= 0) return offset + local;
      offset += route.steps.length;
    }
  }
  return -1;
}

/**
 * True when the route's final step actually deposits into `vault`.
 * Composer activated → terminal toToken is the vault share. If it's
 * anything else we know the route is "bridge only" and we need the
 * tier-3 deposit tail.
 */
function routeDepositsIntoVault(
  route: Route | RouteExtended,
  vault: Vault
): boolean {
  if (route.steps.length === 0) return false;
  const last = route.steps[route.steps.length - 1];
  const terminalToken = last.action?.toToken?.address;
  if (!terminalToken) return false;
  return (
    terminalToken.toLowerCase() === vault.address.toLowerCase() &&
    last.action.toChainId === vault.chainId
  );
}

async function tryGetRoutes(
  params: Parameters<typeof getRoutes>[0]
): Promise<Route | null> {
  try {
    const response = await getRoutes(params);
    // Response.routes is ordered by the routing engine — routes[0] is
    // always the best match for the options (CHEAPEST unless we ask
    // otherwise). We don't inspect unavailableRoutes for now.
    return response.routes?.[0] ?? null;
  } catch (err) {
    // Quote-time failures are tolerated — caller tries the next tier.
    // Execution-time failures bubble up separately via executeRoute.
    console.info("[deposit] getRoutes failed", err);
    return null;
  }
}

async function readErc20Balance(
  provider: EthereumProvider,
  token: string,
  holder: string
): Promise<bigint> {
  const data = encodeBalanceOf(holder);
  try {
    const result = (await provider.request({
      method: "eth_call",
      params: [{ to: token, data }, "latest"],
    })) as string;
    if (!result || result === "0x") return BigInt(0);
    return BigInt(result);
  } catch {
    return BigInt(0);
  }
}

/**
 * Wait for the bridged tokens to actually show up on the destination
 * chain's RPC. LI.FI's /v1/status can flip to DONE a block or two
 * before the user's provider reflects the credit — firing the same-
 * chain Composer route before that causes it to quote zero.
 */
async function waitForDestinationBalance(
  provider: EthereumProvider,
  token: string,
  holder: string,
  minimumRaw: bigint,
  maxMs = 300_000
): Promise<bigint> {
  const start = Date.now();
  let delay = 2_500;
  let lastSeen = BigInt(0);
  while (Date.now() - start < maxMs) {
    lastSeen = await readErc20Balance(provider, token, holder);
    if (lastSeen >= minimumRaw) return lastSeen;
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.25, 6_000);
  }
  throw new Error(
    "Bridged tokens haven't landed on the destination chain yet. Try again in a minute."
  );
}

export function useDepositFlow() {
  const { wallets } = useWallets();
  const [state, setState] = useState<DepositFlowState>(INITIAL);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const lastArgsRef = useRef<StartDepositArgs | null>(null);
  const progressRef = useRef<SourceProgress[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const safeSet = useCallback(
    (
      updater:
        | DepositFlowState
        | ((prev: DepositFlowState) => DepositFlowState)
    ) => {
      if (!mountedRef.current) return;
      setState(updater);
    },
    []
  );

  const publishProgress = useCallback(
    (vault: Vault) => {
      const steps = buildSteps(progressRef.current, vault);
      const active = buildActiveIndex(progressRef.current);
      safeSet((prev) => ({
        ...prev,
        steps,
        activeStepIndex: active,
      }));
    },
    [safeSet]
  );

  const close = useCallback(() => {
    inFlightRef.current = false;
    lastArgsRef.current = null;
    for (const p of progressRef.current) {
      for (const route of p.routes) {
        try {
          stopRouteExecution(route);
        } catch {
          // ignore — best-effort
        }
      }
    }
    progressRef.current = [];
    safeSet(INITIAL);
  }, [safeSet]);

  const run = useCallback(
    async (args: StartDepositArgs) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      lastArgsRef.current = args;

      try {
        const wallet = wallets.find((w) => !!w.address) ?? wallets[0] ?? null;
        if (!wallet) throw new Error("No wallet found. Please reconnect.");

        const underlying = args.vault.underlyingTokens[0];
        if (!underlying?.address) {
          throw new Error("Vault is missing underlying token info.");
        }
        if (args.sources.length === 0) {
          throw new Error("No funding source provided.");
        }

        const destChainId = args.vault.chainId;
        const protocolLabel =
          args.vault.protocol.name.replace(/-/g, " ") || "vault";
        const sorted = sortSources(args.sources, destChainId);
        if (sorted.length === 0) {
          throw new Error("Nothing to deposit — every source amount is zero.");
        }

        progressRef.current = sorted.map((src) => ({
          source: src,
          routes: [],
          placeholderLabel:
            src.chainId === destChainId
              ? `Deposit ${src.tokenSymbol} into ${protocolLabel}`
              : `Bridge ${src.tokenSymbol} & deposit into ${protocolLabel}`,
        }));

        safeSet({
          ...INITIAL,
          phase: "quoting",
          steps: buildSteps(progressRef.current, args.vault),
          activeStepIndex: 0,
        });

        let finalHash = "";
        let finalChainId: number | undefined;

        for (let i = 0; i < progressRef.current.length; i++) {
          const src = progressRef.current[i].source;
          const isCrossChain = src.chainId !== destChainId;

          // ── Resume handling ──────────────────────────────────
          // If a previous attempt persisted a route for this source
          // (same wallet, vault, source chain) and it hasn't finished,
          // pick up where we left off instead of quoting fresh.
          const resumed = loadRoute({
            walletAddress: wallet.address,
            vaultChainId: destChainId,
            vaultAddress: args.vault.address,
            sourceChainId: src.chainId,
          });
          const hasLiveResumed =
            !!resumed &&
            resumed.steps.some(
              (s) =>
                !s.execution ||
                (s.execution.status !== "DONE" &&
                  s.execution.status !== "FAILED")
            );

          // ── Quote tier selection ─────────────────────────────
          let primaryRoute: Route | null = hasLiveResumed
            ? (resumed as Route)
            : null;

          if (!primaryRoute) {
            // Tier 1: Composer. No bridge filter — LI.FI's routing
            // engine picks the best path (1-tx Across/Stargate
            // destination call when available, else a multi-step
            // route the SDK will chain).
            //
            // Slippage is passed explicitly per-call rather than
            // relying on createConfig.routeOptions defaults: the
            // SDK merges config into the top-level request, but
            // LI.FI's engine will then pick tighter per-sub-step
            // slippage (often 0.5%) inside the returned route even
            // when our top-level tolerance is 1%. Explicit per-call
            // slippage gives the engine the full 1% headroom on
            // every hop, which is what fragile paths (Pendle PT
            // routes, newer stable mints) need to clear during
            // execution.
            primaryRoute = await tryGetRoutes({
              fromChainId: src.chainId,
              fromTokenAddress: src.tokenAddress,
              fromAmount: src.amountRaw,
              toChainId: destChainId,
              toTokenAddress: args.vault.address,
              fromAddress: wallet.address,
              toAddress: wallet.address,
              options: { slippage: DEFAULT_SLIPPAGE },
            });
          }

          // Tier 2 preflight: if Composer couldn't route at all AND
          // the source is cross-chain, ask for a plain bridge to the
          // underlying on the destination chain. We'll follow it up
          // with a same-chain Composer deposit once funds land.
          let needsTail = false;
          if (!primaryRoute && isCrossChain) {
            primaryRoute = await tryGetRoutes({
              fromChainId: src.chainId,
              fromTokenAddress: src.tokenAddress,
              fromAmount: src.amountRaw,
              toChainId: destChainId,
              toTokenAddress: underlying.address,
              fromAddress: wallet.address,
              toAddress: wallet.address,
              options: { slippage: DEFAULT_SLIPPAGE },
            });
            needsTail = !!primaryRoute;
          }

          if (!primaryRoute) {
            throw new Error(
              "No route available for this deposit. Try a larger amount, a different source chain, or a different token."
            );
          }

          // Composer may have silently degraded (route's terminal
          // toToken isn't the vault) — treat that like the plain-
          // bridge tier 3 path so we follow up with a same-chain
          // Composer deposit on the destination chain.
          if (!routeDepositsIntoVault(primaryRoute, args.vault)) {
            needsTail = true;
          }

          // ── Execute the primary route ────────────────────────
          progressRef.current[i] = {
            ...progressRef.current[i],
            routes: [primaryRoute as RouteExtended],
          };
          saveRoute(
            {
              walletAddress: wallet.address,
              vaultChainId: destChainId,
              vaultAddress: args.vault.address,
              sourceChainId: src.chainId,
            },
            primaryRoute
          );

          safeSet((prev) => ({ ...prev, phase: "executing" }));
          publishProgress(args.vault);

          const executionOpts = {
            updateRouteHook: (updated: RouteExtended) => {
              const entry = progressRef.current[i];
              const nextRoutes = [...entry.routes];
              nextRoutes[0] = updated;
              progressRef.current[i] = { ...entry, routes: nextRoutes };
              saveRoute(
                {
                  walletAddress: wallet.address,
                  vaultChainId: destChainId,
                  vaultAddress: args.vault.address,
                  sourceChainId: src.chainId,
                },
                updated
              );
              publishProgress(args.vault);
            },
          };

          const executedPrimary = hasLiveResumed
            ? await resumeRoute(primaryRoute, executionOpts)
            : await executeRoute(primaryRoute, executionOpts);

          // Update ref with final state.
          {
            const entry = progressRef.current[i];
            const nextRoutes = [...entry.routes];
            nextRoutes[0] = executedPrimary;
            progressRef.current[i] = { ...entry, routes: nextRoutes };
          }
          publishProgress(args.vault);

          const primaryFailure = firstFailureMessage(executedPrimary);
          if (primaryFailure) {
            throw new Error(primaryFailure);
          }

          const primaryTx = finalTxFromRoute(executedPrimary);
          if (primaryTx) {
            finalHash = primaryTx.txHash;
            finalChainId = primaryTx.chainId;
          }

          // ── Tier 2 tail: same-chain Composer deposit ─────────
          if (needsTail) {
            // Read the actual landed amount on the destination chain.
            // LI.FI's toAmountMin is a safe lower bound but we can
            // often deposit more if the bridge overdelivered — and
            // more importantly the SDK doesn't automatically fund
            // our next getRoutes with the terminal amount, so we
            // have to measure ourselves.
            const terminalStep =
              executedPrimary.steps[executedPrimary.steps.length - 1];
            const quotedMin = (() => {
              try {
                return BigInt(
                  terminalStep.estimate?.toAmountMin ??
                    terminalStep.estimate?.toAmount ??
                    "0"
                );
              } catch {
                return BigInt(0);
              }
            })();
            if (quotedMin <= BigInt(0)) {
              throw new Error(
                "Couldn't determine the bridged amount to deposit."
              );
            }

            const provider =
              (await wallet.getEthereumProvider()) as EthereumProvider;
            await waitForDestinationBalance(
              provider,
              underlying.address,
              wallet.address,
              quotedMin
            );
            const landed = await readErc20Balance(
              provider,
              underlying.address,
              wallet.address
            );
            // Deposit the lower of landed vs (quotedMin × 1.001) — the
            // tiny overshoot covers the rare case where landed is
            // slightly over toAmountMin but we still don't want to
            // touch a pre-existing destination balance.
            const depositAmount = landed < quotedMin ? landed : quotedMin;

            // Same-chain Composer deposit via a second getRoutes
            // call. LI.FI picks the right deposit adapter for the
            // protocol and bundles approve + deposit into one step
            // whenever the protocol allows it.
            const tailRoute = await tryGetRoutes({
              fromChainId: destChainId,
              fromTokenAddress: underlying.address,
              fromAmount: depositAmount.toString(),
              toChainId: destChainId,
              toTokenAddress: args.vault.address,
              fromAddress: wallet.address,
              toAddress: wallet.address,
              options: { slippage: DEFAULT_SLIPPAGE },
            });
            if (!tailRoute) {
              throw new Error(
                "Your funds arrived on the destination chain but LI.FI couldn't find a deposit route. You'll need to deposit manually."
              );
            }

            // Append tail route to this source's route list so the UI
            // shows Bridge + Deposit as sequential steps.
            {
              const entry = progressRef.current[i];
              progressRef.current[i] = {
                ...entry,
                routes: [...entry.routes, tailRoute as RouteExtended],
              };
            }
            publishProgress(args.vault);

            const tailOpts = {
              updateRouteHook: (updated: RouteExtended) => {
                const entry = progressRef.current[i];
                const nextRoutes = [...entry.routes];
                nextRoutes[entry.routes.length - 1] = updated;
                progressRef.current[i] = { ...entry, routes: nextRoutes };
                publishProgress(args.vault);
              },
            };

            const executedTail = await executeRoute(tailRoute, tailOpts);

            // Persist final tail state.
            {
              const entry = progressRef.current[i];
              const nextRoutes = [...entry.routes];
              nextRoutes[entry.routes.length - 1] = executedTail;
              progressRef.current[i] = { ...entry, routes: nextRoutes };
            }
            publishProgress(args.vault);

            const tailFailure = firstFailureMessage(executedTail);
            if (tailFailure) {
              throw new Error(tailFailure);
            }

            const tailTx = finalTxFromRoute(executedTail);
            if (tailTx) {
              finalHash = tailTx.txHash;
              finalChainId = tailTx.chainId;
            }
          }

          // Source complete — clear its resume state.
          clearRoute({
            walletAddress: wallet.address,
            vaultChainId: destChainId,
            vaultAddress: args.vault.address,
            sourceChainId: src.chainId,
          });
        }

        // Optimistic position entry so the portfolio reflects the
        // deposit immediately — LI.FI's /positions indexer and our
        // /api/vault-shares Alchemy reader can each lag 5-60s, and
        // we don't want the UI to show $0 earning for that window.
        // Seeding the vault into the shared cache also guarantees
        // augmentWithOnChainHoldings keeps probing it on subsequent
        // resyncs even if the vault never streamed in via the
        // TVL-sorted page fetch.
        seedVaultsIntoCache([args.vault]);
        try {
          // Sum of all successful source amounts, converted to the
          // underlying asset's decimals. Uses each source's quoted
          // toAmountMin when available so the number already
          // reflects slippage.
          const underlying = args.vault.underlyingTokens[0];
          if (underlying) {
            let totalBase = BigInt(0);
            for (const p of progressRef.current) {
              const terminal = p.routes[p.routes.length - 1];
              const lastStep = terminal?.steps[terminal.steps.length - 1];
              const quoted =
                lastStep?.estimate?.toAmountMin ??
                lastStep?.estimate?.toAmount ??
                "0";
              try {
                totalBase += BigInt(quoted);
              } catch {
                // skip malformed
              }
            }
            if (totalBase > BigInt(0)) {
              const underlyingAmount =
                Number(totalBase) / Math.pow(10, underlying.decimals);
              optimisticallyAddPosition(wallet.address, {
                vault: args.vault,
                underlyingAmount,
              });
            }
          }
        } catch (err) {
          // Optimistic insertion is a nice-to-have — don't let it
          // break the success path.
          console.warn("[deposit] optimistic insert failed", err);
        }

        scheduleResync(wallet.address);

        safeSet((prev) => ({
          ...prev,
          phase: "success",
          finalTxHash: finalHash,
          finalChainId,
        }));

        // Base Notifications — fire-and-forget. Gated on the user's
        // local preference; Base will additionally only deliver to
        // wallets that have notifications enabled in Base App.
        if (loadPreferences().notificationsEnabled) {
          const apy = args.vault.analytics?.apy?.total;
          const apyPart = typeof apy === "number" && apy > 0
            ? `Earning ${apy.toFixed(2)}% APY on Base.`
            : "Your funds are now earning yield on Base.";
          void sendBaseNotification({
            walletAddress: wallet.address,
            title: "Deposit confirmed",
            message: `${apyPart} Tap to view your positions.`,
            targetPath: "/portfolio",
          });
        }
      } catch (err) {
        console.error("[deposit] flow failed", err);
        const message = isSdkUserRejection(err)
          ? "You cancelled the deposit in your wallet."
          : friendlyErrorMessage(err);
        safeSet((prev) => ({
          ...prev,
          phase: "error",
          errorMessage: message,
          steps: prev.steps.map((v, idx) =>
            idx === prev.activeStepIndex ? { ...v, status: "failed" } : v
          ),
        }));
      } finally {
        inFlightRef.current = false;
      }
    },
    [wallets, safeSet, publishProgress]
  );

  const start = useCallback(
    (args: StartDepositArgs) => {
      void run(args);
    },
    [run]
  );

  const retry = useCallback(() => {
    if (!lastArgsRef.current) return;
    const args = lastArgsRef.current;
    progressRef.current = [];
    safeSet({ ...INITIAL });
    void run(args);
  }, [run, safeSet]);

  const modalStatus: "confirming" | "success" | "error" | null =
    state.phase === "success"
      ? "success"
      : state.phase === "error"
        ? "error"
        : state.phase === "quoting" || state.phase === "executing"
          ? "confirming"
          : null;

  return { state, start, retry, close, modalStatus };
}
