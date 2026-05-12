"use client";

import type { RouteExtended, LiFiStepExtended, Process } from "@lifi/sdk";
import { LiFiErrorCode } from "@lifi/sdk";
import { EXPLORER_TX_URL_BY_CHAIN } from "@/lib/constants";
import type { Vault } from "@/lib/types";

// Adapts the SDK's RouteExtended (what updateRouteHook emits) into the
// DepositStepView[] shape the existing TransactionModal consumes. Keeps
// the UI contract stable so the deposit page doesn't care that the
// execution layer changed.

export interface DepositStepView {
  id: string;
  label: string;
  chainId?: number;
  status: "pending" | "active" | "done" | "failed";
  txHash?: string;
  txLink?: string;
}

function explorerLink(
  chainId: number | undefined,
  txHash: string
): string | undefined {
  if (!chainId) return undefined;
  const base = EXPLORER_TX_URL_BY_CHAIN[chainId];
  return base ? `${base}${txHash}` : undefined;
}

function stepLabel(step: LiFiStepExtended, vault: Vault): string {
  const fromSym = step.action.fromToken?.symbol ?? "?";
  const toSym = step.action.toToken?.symbol ?? "?";
  const crossChain = step.action.fromChainId !== step.action.toChainId;
  // Terminal step whose toToken matches the vault — label as the
  // deposit rather than a generic swap. Composer always puts the
  // vault deposit as the final output on the destination chain.
  const isVaultDeposit =
    step.action.toToken?.address?.toLowerCase() ===
      vault.address.toLowerCase() &&
    step.action.toChainId === vault.chainId;
  if (isVaultDeposit) {
    const protocol = vault.protocol.name.replace(/-/g, " ") || "vault";
    return crossChain
      ? `Bridge ${fromSym} & deposit into ${protocol}`
      : `Swap ${fromSym} → ${toSym} & deposit into ${protocol}`;
  }
  return crossChain
    ? `Bridge ${fromSym} → ${toSym}`
    : `Swap ${fromSym} → ${toSym}`;
}

/**
 * Derive the user-facing status for an SDK step from its execution
 * block. PENDING and ACTION_REQUIRED both surface as "active" because
 * that's what the UI treats identically (spinner + "confirm in
 * wallet"). STARTED is the SDK's way of saying "we're about to ask
 * the wallet" — treat as active too.
 */
function resolveStatus(
  step: LiFiStepExtended
): DepositStepView["status"] {
  const exec = step.execution;
  if (!exec) return "pending";
  if (exec.status === "DONE") return "done";
  if (exec.status === "FAILED") return "failed";
  if (exec.status === "ACTION_REQUIRED" || exec.status === "PENDING") {
    return "active";
  }
  return "pending";
}

/**
 * Pick the most-informative process entry for surfacing a tx hash.
 * Prefer the last entry with a txHash (bridges log multiple as they
 * cross chains); if none has a hash yet we return undefined.
 */
function latestProcessWithTx(processes: Process[] | undefined):
  | Process
  | undefined {
  if (!processes) return undefined;
  for (let i = processes.length - 1; i >= 0; i--) {
    if (processes[i].txHash) return processes[i];
  }
  return undefined;
}

/**
 * Map one SDK step to one DepositStepView. Called for every step in
 * the route so multi-step routes (swap → bridge → deposit) render as
 * separate checkmarks in the modal.
 */
function stepToView(
  step: LiFiStepExtended,
  index: number,
  vault: Vault
): DepositStepView {
  const latest = latestProcessWithTx(step.execution?.process);
  const chainId = step.action.fromChainId;
  return {
    id: `step-${step.id}-${index}`,
    label: stepLabel(step, vault),
    chainId,
    status: resolveStatus(step),
    txHash: latest?.txHash,
    txLink: latest?.txHash
      ? explorerLink(latest.chainId ?? chainId, latest.txHash)
      : undefined,
  };
}

/**
 * Convert a full route (possibly with one or many steps) to the
 * ordered DepositStepView[] the modal renders.
 */
export function routeToDepositSteps(
  route: RouteExtended,
  vault: Vault
): DepositStepView[] {
  return route.steps.map((step, i) => stepToView(step, i, vault));
}

/**
 * Compute the index of the currently-active step in a route.
 * Returns -1 if every step is DONE, or the first non-DONE index
 * otherwise. Used to drive the progress indicator.
 */
export function activeStepIndex(route: RouteExtended): number {
  for (let i = 0; i < route.steps.length; i++) {
    const status = route.steps[i].execution?.status;
    if (status !== "DONE") return i;
  }
  return -1;
}

/**
 * Extract the final tx hash from a completed route. Composer bundles
 * the vault deposit into the terminal step's transaction, so this is
 * what the success modal surfaces as "your deposit tx".
 */
export function finalTxFromRoute(
  route: RouteExtended
): { txHash: string; chainId: number } | null {
  for (let i = route.steps.length - 1; i >= 0; i--) {
    const step = route.steps[i];
    const latest = latestProcessWithTx(step.execution?.process);
    if (latest?.txHash) {
      return {
        txHash: latest.txHash,
        chainId: latest.chainId ?? step.action.toChainId,
      };
    }
  }
  return null;
}

/**
 * Detect user-rejection errors surfaced by the SDK. The SDK wraps
 * EIP-1193 code 4001 in its own LiFiErrorCode.SignatureRejected /
 * TransactionRejected, but the original shape (code, message) also
 * leaks through in some cases. Covers both.
 */
export function isSdkUserRejection(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as {
    code?: unknown;
    cause?: { code?: unknown; message?: unknown };
    message?: unknown;
    name?: unknown;
  };
  if (
    e.code === LiFiErrorCode.SignatureRejected ||
    e.code === LiFiErrorCode.TransactionRejected
  ) {
    return true;
  }
  if (e.code === 4001 || e.code === "ACTION_REJECTED") return true;
  const causeCode = e.cause?.code;
  if (causeCode === 4001 || causeCode === "ACTION_REJECTED") return true;
  const msg = typeof e.message === "string" ? e.message.toLowerCase() : "";
  const causeMsg =
    typeof e.cause?.message === "string" ? e.cause.message.toLowerCase() : "";
  const combined = `${msg} ${causeMsg}`;
  return (
    combined.includes("user rejected") ||
    combined.includes("user denied") ||
    combined.includes("rejected by user") ||
    combined.includes("request rejected") ||
    combined.includes("user cancelled") ||
    combined.includes("user canceled") ||
    combined.includes("transaction declined")
  );
}

/**
 * Extract the first FAILED process's error message, if any. Helps
 * surface a human-readable reason when a route halts.
 */
export function firstFailureMessage(route: RouteExtended): string | null {
  for (const step of route.steps) {
    if (!step.execution) continue;
    for (const process of step.execution.process) {
      if (process.status === "FAILED" && process.error) {
        return process.error.message ?? null;
      }
    }
  }
  return null;
}

/**
 * Translate raw LI.FI SDK / HTTP errors into messages the user can
 * actually act on. The SDK likes to surface errors as
 * "[HTTPError] [ServerError] Request failed with status code 422
 * Unprocessable Entity. <original> LI.FI SDK version: 3.16.3" —
 * nobody wants to see that, and the shape makes it hard to spot the
 * root cause.
 *
 * Falls back to the raw error text if we can't pattern-match; the
 * caller still logs the full error to the console so devs can dig in.
 */
export function friendlyErrorMessage(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";

  // Strip SDK's verbose HTTPError wrapper + trailing version tag.
  const cleaned = raw
    .replace(/^\[HTTPError\]\s*/i, "")
    .replace(/^\[ServerError\]\s*/i, "")
    .replace(/\s*LI\.FI SDK version:.*$/i, "")
    .replace(/^Request failed with status code \d+[^.]*\.\s*/i, "")
    .trim();

  const lower = cleaned.toLowerCase();

  // Most common LI.FI "no route" signals. Collapsed into one
  // message because the user's options are the same: try bigger,
  // try a different chain, or try a different token.
  if (
    lower.includes("none of the available routes") ||
    lower.includes("no available quotes") ||
    lower.includes("no possible route") ||
    lower.includes("no_quote") ||
    lower.includes("no route found") ||
    lower.includes("cannot be executed")
  ) {
    return (
      "No route available for this deposit right now. " +
      "Cross-chain deposits usually need at least $5–$10 to cover bridge fees. " +
      "Try a larger amount, a different source chain, or a different token."
    );
  }

  if (
    lower.includes("amount too low") ||
    lower.includes("amount is too low") ||
    lower.includes("below minimum") ||
    lower.includes("minimum amount")
  ) {
    return "Amount is too small for this route. Try at least $5–$10.";
  }

  if (lower.includes("insufficient")) {
    return cleaned; // "insufficient balance", "insufficient allowance" — already clear
  }

  if (lower.includes("slippage")) {
    return "Price moved too much while routing. Try again.";
  }

  return cleaned || "Something went wrong while preparing the deposit.";
}
