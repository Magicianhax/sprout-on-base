import type { ConnectedWallet } from "@/lib/wallet";
import {
  executeRoute,
  getRoutes,
  type Route,
  type RouteExtended,
  type UpdateRouteHook,
} from "@lifi/sdk";
import { DEFAULT_SLIPPAGE } from "@/lib/constants";
import { toTokenUnits } from "@/lib/format";
import {
  encodeBalanceOf,
  encodeRedeem,
  encodeWithdraw,
} from "@/lib/depositEncoder";
import { withAttribution } from "@/lib/attribution";
import {
  finalTxFromRoute,
  firstFailureMessage,
  isSdkUserRejection,
} from "@/lib/lifi/routeAdapter";
import type { EthereumProvider, Position, Vault } from "@/lib/types";

// Function selectors
const ASSET_SELECTOR = "0x38d52e0f"; // asset() — ERC4626

// Withdrawal priority (per product requirement):
//   1. LI.FI getRoutes (Composer direct, or any swap/bridge route the
//      engine can build from vault share → target token). Handles
//      both same-chain and cross-chain exits in one call.
//   2. Direct ERC4626 redeem/withdraw when LI.FI can't route but the
//      user is exiting to the vault's own underlying on its own chain
//      AND the vault passes the asset() probe.
//   3. Cross-chain fallback: direct ERC4626 redeem on the vault's
//      own chain (underlying lands with user), then a separate LI.FI
//      route bridges the underlying to the user's chosen destination.
//
// Partial withdraws bypass LI.FI entirely — the SDK's routes take a
// fromAmount in share-token units, and mapping "withdraw $50 of
// underlying" to a share count cleanly would require a per-vault
// conversion we don't carry. Partial exits always call
// ERC4626.withdraw(assets) directly on the user's chain.

/**
 * Sentinel for explicit wallet cancellations. Propagates up without
 * triggering silent fallbacks — a user who rejected a prompt doesn't
 * want us to re-prompt on a different path.
 */
class UserRejectedError extends Error {
  constructor(message = "Transaction cancelled by user.") {
    super(message);
    this.name = "UserRejectedError";
  }
}

/**
 * Raised when every on-chain exit path — LI.FI routing, direct
 * ERC4626 redeem, local redeem + bridge — fails for a vault. Happens
 * for protocols whose share tokens lack DEX liquidity AND enforce a
 * native withdrawal queue (Ether.fi Liquid, yoUSD). Carries the
 * protocol's own app URL so the UI can show a "Withdraw at {app}"
 * button instead of a generic error.
 */
export class ProtocolRedirectError extends Error {
  readonly protocolName: string;
  readonly protocolUrl: string | undefined;
  constructor(protocolName: string, protocolUrl?: string) {
    const pretty = protocolName.replace(/-/g, " ");
    const base = protocolUrl
      ? `This vault uses its own withdrawal flow. Exit from ${pretty} at ${protocolUrl}.`
      : `This vault uses its own withdrawal flow. Open the ${pretty} app to exit.`;
    super(base);
    this.name = "ProtocolRedirectError";
    this.protocolName = protocolName;
    this.protocolUrl = protocolUrl;
  }
}

/**
 * Pre-SDK rejection shape (direct eth_sendTransaction). Matches
 * EIP-1193 code 4001, Privy's wrapped -32603, and ethers/viem's
 * ACTION_REJECTED strings.
 */
function isUserRejection(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown; name?: unknown };
  if (e.code === 4001 || e.code === "ACTION_REJECTED") return true;
  if (typeof e.name === "string" && e.name === "UserRejectedError") return true;
  const msg = typeof e.message === "string" ? e.message.toLowerCase() : "";
  return (
    msg.includes("user rejected") ||
    msg.includes("user denied") ||
    msg.includes("rejected by user") ||
    msg.includes("request rejected") ||
    msg.includes("user cancelled") ||
    msg.includes("user canceled") ||
    msg.includes("transaction declined")
  );
}

async function supportsErc4626(
  provider: EthereumProvider,
  vaultAddress: string,
  expectedUnderlying: string
): Promise<boolean> {
  try {
    const result = (await provider.request({
      method: "eth_call",
      params: [{ to: vaultAddress, data: ASSET_SELECTOR }, "latest"],
    })) as string;
    if (!result || result === "0x" || result.length < 66) return false;
    const returnedAddress = `0x${result.slice(-40)}`.toLowerCase();
    return returnedAddress === expectedUnderlying.toLowerCase();
  } catch {
    return false;
  }
}

export interface WithdrawExecutorOptions {
  wallet: ConnectedWallet;
  position: Position;
  vault: Vault;
  /** Underlying asset amount (decimal). Undefined → full position. */
  amount?: number;
  /**
   * Optional cross-chain / cross-token exit target. When set, funds
   * end up as this token on this chain. When both are undefined we
   * default to the vault's own underlying on its own chain.
   */
  toChainId?: number;
  toTokenAddress?: string;
  /** Fires once the flow is about to start prompting the wallet. */
  onConfirming?: () => void;
}

export interface WithdrawExecutorResult {
  txHash: string;
  isFullWithdrawal: boolean;
}

async function readBalance(
  provider: EthereumProvider,
  token: string,
  holder: string
): Promise<bigint> {
  const data = encodeBalanceOf(holder);
  const result = (await provider.request({
    method: "eth_call",
    params: [{ to: token, data }, "latest"],
  })) as string;
  if (!result || result === "0x") return BigInt(0);
  return BigInt(result);
}

async function tryGetRoutes(
  params: Parameters<typeof getRoutes>[0]
): Promise<Route | null> {
  try {
    const response = await getRoutes(params);
    return response.routes?.[0] ?? null;
  } catch (err) {
    console.info("[withdraw] getRoutes failed", err);
    return null;
  }
}

/**
 * Execute a LI.FI route via the SDK. Fires onConfirming once the SDK
 * first requests a wallet interaction so the UI can flip from
 * "quoting" to "confirming" at the right moment. Returns the final
 * tx hash or throws on failure / user rejection.
 */
async function executeWithdrawRoute(
  route: Route,
  onConfirming?: () => void
): Promise<string | null> {
  let notified = false;
  const hook: UpdateRouteHook = (updated) => {
    if (!notified) {
      const active = updated.steps.some(
        (s) =>
          s.execution?.status === "ACTION_REQUIRED" ||
          s.execution?.status === "PENDING"
      );
      if (active) {
        notified = true;
        onConfirming?.();
      }
    }
  };
  const executed = await executeRoute(route, { updateRouteHook: hook });
  const failure = firstFailureMessage(executed);
  if (failure) throw new Error(failure);
  const tx = finalTxFromRoute(executed);
  return tx?.txHash ?? null;
}

async function findAndExecuteLifi(
  wallet: ConnectedWallet,
  fromChain: number,
  fromToken: string,
  fromAmount: bigint,
  toChain: number,
  toToken: string,
  onConfirming?: () => void
): Promise<string | null> {
  const route = await tryGetRoutes({
    fromChainId: fromChain,
    fromTokenAddress: fromToken,
    fromAmount: fromAmount.toString(),
    toChainId: toChain,
    toTokenAddress: toToken,
    fromAddress: wallet.address,
    toAddress: wallet.address,
    // Explicit slippage — the SDK merges createConfig defaults into
    // the request, but LI.FI's routing engine tightens per-sub-step
    // slippage below our top-level tolerance. Passing it here
    // ensures fragile withdraw paths (share-token → DEX → output)
    // get the full 1% headroom on every hop instead of 0.5%.
    options: { slippage: DEFAULT_SLIPPAGE },
  });
  if (!route) return null;
  try {
    return await executeWithdrawRoute(route, onConfirming);
  } catch (err) {
    if (isSdkUserRejection(err) || isUserRejection(err)) {
      throw new UserRejectedError(
        "You cancelled the withdrawal in your wallet."
      );
    }
    console.warn("[withdraw] LI.FI execution failed", err);
    return null;
  }
}

/**
 * Direct ERC4626 redeem. Returns the tx hash. Throws
 * UserRejectedError on wallet rejection — caller should not fall
 * back silently in that case.
 */
async function executeDirectRedeem(
  wallet: ConnectedWallet,
  provider: EthereumProvider,
  vaultAddress: string,
  shares: bigint,
  onConfirming?: () => void
): Promise<string> {
  onConfirming?.();
  const data = encodeRedeem(shares, wallet.address, wallet.address);
  try {
    const hash = (await provider.request({
      method: "eth_sendTransaction",
      params: [{ from: wallet.address, to: vaultAddress, data: withAttribution(data) }],
    })) as string;
    return hash;
  } catch (err) {
    if (isUserRejection(err)) {
      throw new UserRejectedError(
        "You cancelled the withdrawal in your wallet."
      );
    }
    throw err;
  }
}

/**
 * Poll the destination-token balance until it reaches at least
 * `minimumRaw`. Used between a direct ERC4626 redeem and a follow-up
 * bridge leg — the redeem is synchronous but some vaults settle in
 * the same tx the RPC hasn't yet indexed when we query.
 */
async function waitForBalance(
  provider: EthereumProvider,
  token: string,
  holder: string,
  minimumRaw: bigint,
  maxMs = 120_000
): Promise<bigint> {
  const start = Date.now();
  let delay = 2_000;
  while (Date.now() - start < maxMs) {
    const current = await readBalance(provider, token, holder);
    if (current >= minimumRaw) return current;
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.25, 5_000);
  }
  throw new Error(
    "Withdrawn funds haven't been indexed yet. Check your wallet in a minute."
  );
}

export async function executeVaultWithdraw(
  opts: WithdrawExecutorOptions
): Promise<WithdrawExecutorResult> {
  const {
    wallet,
    position,
    vault,
    amount,
    toChainId,
    toTokenAddress,
    onConfirming,
  } = opts;

  const fullBalance = parseFloat(position.balanceNative);
  if (!Number.isFinite(fullBalance) || fullBalance <= 0) {
    throw new Error("Nothing to withdraw — your balance is zero.");
  }

  const requested =
    amount && amount > 0 ? Math.min(amount, fullBalance) : fullBalance;
  const isFullWithdrawal = requested >= fullBalance * 0.9999;

  if (vault.chainId !== position.chainId) {
    throw new Error("Vault chain mismatch — refusing to send transaction.");
  }

  await wallet.switchChain(position.chainId);
  const provider = (await wallet.getEthereumProvider()) as EthereumProvider;
  const chainHex = (await provider.request({
    method: "eth_chainId",
  })) as string;
  if (parseInt(chainHex, 16) !== position.chainId) {
    throw new Error("Wallet is on the wrong chain. Please switch networks.");
  }

  const destChain = toChainId ?? position.chainId;
  const destToken = toTokenAddress ?? position.asset.address;
  const wantsDifferentOutput =
    destChain !== position.chainId ||
    destToken.toLowerCase() !== position.asset.address.toLowerCase();

  // ─── Partial withdrawal — direct ERC4626 only ──────────────
  // No tier fallback: the SDK has no "withdraw X underlying"
  // primitive, and partial cross-chain would need an additional
  // conversion we don't carry.
  if (!isFullWithdrawal) {
    if (wantsDifferentOutput) {
      throw new Error(
        "Cross-chain partial withdrawals aren't supported yet. Exit the full position or withdraw on the vault's own chain."
      );
    }

    const assets = BigInt(toTokenUnits(requested, position.asset.decimals));
    if (assets === BigInt(0)) {
      throw new Error("Withdraw amount rounds to zero.");
    }

    onConfirming?.();
    const data = encodeWithdraw(assets, wallet.address, wallet.address);
    try {
      const hash = (await provider.request({
        method: "eth_sendTransaction",
        params: [{ from: wallet.address, to: vault.address, data: withAttribution(data) }],
      })) as string;
      return { txHash: hash, isFullWithdrawal: false };
    } catch (err) {
      if (isUserRejection(err)) {
        throw new UserRejectedError(
          "You cancelled the withdrawal in your wallet."
        );
      }
      throw err;
    }
  }

  // ─── Full withdrawal ───────────────────────────────────────
  // Share count. Prefer the value stamped by our positions builder
  // (read via Alchemy during the feed build) over the user's own
  // RPC, which sometimes lags by a block on Base.
  let shares = BigInt(0);
  if (position.shareBalanceRaw) {
    try {
      shares = BigInt(position.shareBalanceRaw);
    } catch {
      shares = BigInt(0);
    }
  }
  if (shares === BigInt(0)) {
    shares = await readBalance(provider, vault.address, wallet.address);
  }
  if (shares === BigInt(0)) {
    try {
      const res = await fetch("/api/vault-shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId: vault.chainId,
          address: wallet.address,
          vaults: [vault.address],
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          held?: Array<{ address: string; shareBalance?: string }>;
        };
        const match = data.held?.find(
          (h) => h.address.toLowerCase() === vault.address.toLowerCase()
        );
        if (match?.shareBalance) {
          try {
            shares = BigInt(match.shareBalance);
          } catch {
            // keep zero
          }
        }
      }
    } catch {
      // ignore
    }
  }
  if (shares === BigInt(0)) {
    throw new Error("No shares to redeem — position already empty.");
  }

  // Tier 1 — LI.FI Composer direct (preferred for any scenario,
  // same-chain or cross-chain, Composer or swap/bridge route). This
  // captures the integrator fee and routes via whichever path LI.FI
  // thinks is best.
  onConfirming?.();
  const directLifiHash = await findAndExecuteLifi(
    wallet,
    vault.chainId,
    vault.address,
    shares,
    destChain,
    destToken,
    onConfirming
  );
  if (directLifiHash) {
    return { txHash: directLifiHash, isFullWithdrawal: true };
  }

  // Tier 2 — Direct ERC4626 redeem. Only usable when exiting to the
  // vault's own underlying on its own chain AND the vault implements
  // ERC4626 correctly. Zero slippage, one tx; the fee just doesn't
  // get captured (no LI.FI in the loop).
  const canDirectRedeem =
    !wantsDifferentOutput &&
    (await supportsErc4626(provider, vault.address, position.asset.address));

  if (canDirectRedeem) {
    return {
      txHash: await executeDirectRedeem(
        wallet,
        provider,
        vault.address,
        shares,
        onConfirming
      ),
      isFullWithdrawal: true,
    };
  }

  // Tier 3 — Cross-chain fallback. LI.FI couldn't route vault share
  // → target directly, but if the vault supports ERC4626 we can
  // redeem to the vault's underlying locally, then bridge the
  // underlying to the user's chosen destination via a fresh LI.FI
  // route. Two signatures, but the user ends up where they asked.
  if (wantsDifferentOutput) {
    const canRedeemLocally = await supportsErc4626(
      provider,
      vault.address,
      position.asset.address
    );
    if (canRedeemLocally) {
      const redeemHash = await executeDirectRedeem(
        wallet,
        provider,
        vault.address,
        shares,
        onConfirming
      );

      // Wait for the underlying to settle locally — ERC4626 vaults
      // credit in the same block, but the user's RPC may lag.
      const underlyingBalance = await waitForBalance(
        provider,
        position.asset.address,
        wallet.address,
        BigInt(1)
      );
      if (underlyingBalance <= BigInt(0)) {
        // Shouldn't happen after waitForBalance succeeds, but we
        // surface a real tx hash so the user can see the redeem
        // succeeded even if the bridge leg didn't fire.
        return { txHash: redeemHash, isFullWithdrawal: true };
      }

      const bridgeHash = await findAndExecuteLifi(
        wallet,
        position.chainId,
        position.asset.address,
        underlyingBalance,
        destChain,
        destToken,
        onConfirming
      );
      if (bridgeHash) {
        return { txHash: bridgeHash, isFullWithdrawal: true };
      }
      // Bridge leg couldn't route. The redeem already succeeded — the
      // user has their underlying on the vault's chain. Surface that
      // tx and a clear error so they know where their funds are.
      throw new Error(
        "Withdrew to the vault's own chain, but LI.FI couldn't route a bridge to your chosen destination. Your underlying is on " +
          `${position.asset.symbol} on chain ${position.chainId}. You can bridge it manually.`
      );
    }
  }

  throw new Error(
    "This vault doesn't support direct withdrawal and LI.FI has no route for its share token."
  );
}

// Suppress unused-vars lint for RouteExtended — kept exported for
// typing callers that may want to observe route shape in hooks.
export type { RouteExtended };
