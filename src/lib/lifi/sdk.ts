"use client";

import {
  EVM,
  createConfig,
  type EVMProviderOptions,
} from "@lifi/sdk";
import type { ConnectedWallet } from "@/lib/wallet";
import {
  createWalletClient,
  custom,
  type Chain,
  type Client,
  type EIP1193Provider,
} from "viem";
import {
  arbitrum,
  base,
  mainnet,
  optimism,
  polygon,
} from "viem/chains";
import { DEFAULT_SLIPPAGE } from "@/lib/constants";
import { withAttribution } from "@/lib/attribution";

// ── Chain mapping ────────────────────────────────────────────────────
// viem's chain objects carry formatters, multicall addresses, etc. —
// the SDK expects these via the wallet `Client`. Only the chains
// Sprout actually supports are listed; any other chain Privy reports
// is rejected before we try to build a walletClient for it.

const CHAINS_BY_ID: Record<number, Chain> = {
  [mainnet.id]: mainnet,
  [base.id]: base,
  [arbitrum.id]: arbitrum,
  [optimism.id]: optimism,
  [polygon.id]: polygon,
};

function chainForId(id: number): Chain | undefined {
  return CHAINS_BY_ID[id];
}

/**
 * Wrap Privy's EIP-1193 provider to intercept EIP-5792 batched-call
 * methods that Privy's embedded wallet doesn't implement cleanly.
 *
 * viem (and by extension @lifi/sdk) probes wallet_getCapabilities to
 * decide whether it can atomically batch approve + deposit via
 * wallet_sendCalls. Privy responds to that probe with its own
 * internal "Hardware wallets are not supported" rejection, which
 * viem surfaces as:
 *   [UnknownError] This Wallet does not support a capability that
 *   was not marked as optional.
 *
 * Returning an empty capabilities map tells viem "this wallet has
 * no special batching support" — SDK falls back to regular
 * eth_sendTransaction, which Privy's embedded wallet handles fine.
 * wallet_sendCalls is force-rejected in case viem ever skips the
 * capability check and attempts it anyway.
 */
function wrapProviderForSdk(provider: EIP1193Provider): EIP1193Provider {
  // Viem's EIP1193Provider types `request` as a heavy discriminated
  // union across every JSON-RPC method it knows about. That's painful
  // to narrow from a generic passthrough wrapper — we cast to a
  // loose shape for the wrapper and back to EIP1193Provider at the
  // return, which keeps runtime behaviour identical (a plain EIP-1193
  // call object) without fighting the union.
  type LooseProvider = {
    request(args: { method: string; params?: unknown }): Promise<unknown>;
  };
  const loose = provider as unknown as LooseProvider;
  const patched: LooseProvider = {
    request: async (args) => {
      if (args.method === "wallet_getCapabilities") {
        return {};
      }
      if (args.method === "wallet_sendCalls") {
        throw new Error(
          "This wallet doesn't support batched calls. Falling back to individual transactions."
        );
      }
      // Base Builder Codes attribution: every tx the LI.FI SDK sends
      // (approvals, deposits, bridges, swaps) flows through here, so
      // appending the ERC-8021 suffix at this single point covers all
      // of them. Smart contracts ignore trailing bytes past the
      // ABI-encoded calldata, so the append is safe for every call shape.
      if (args.method === "eth_sendTransaction" && Array.isArray(args.params)) {
        const params = args.params as Array<{ data?: string; [k: string]: unknown }>;
        if (params[0] && typeof params[0] === "object") {
          params[0] = { ...params[0], data: withAttribution(params[0].data) };
        }
        return loose.request({ ...args, params });
      }
      return loose.request(args);
    },
  };
  return { ...provider, request: patched.request } as unknown as EIP1193Provider;
}

// ── Module state ─────────────────────────────────────────────────────
// Single EVM provider instance for the whole app. `configureLifiSdk`
// is idempotent and may be called more than once (StrictMode double-
// mount, remount after user relogin). Subsequent calls re-use the
// provider so the SDK's in-flight route tracking survives.

let configured = false;
let evmProvider: ReturnType<typeof EVM> | null = null;
let currentWallet: ConnectedWallet | null = null;

function resolveApiUrl(): string {
  if (typeof window === "undefined") {
    // SSR path — never actually used at runtime (configure runs in a
    // client-only effect), but `createConfig` reads apiUrl synchronously
    // so we need a non-throwing default.
    return "https://li.quest/v1";
  }
  return `${window.location.origin}/api/lifi/v1`;
}

function buildEvmProviderOptions(): EVMProviderOptions {
  return {
    getWalletClient: async () => {
      const client = await walletClientForActiveChain();
      if (!client) {
        throw new Error("No wallet connected. Please reconnect.");
      }
      return client;
    },
    switchChain: async (chainId: number) => {
      const wallet = currentWallet;
      if (!wallet) {
        throw new Error("No wallet connected. Please reconnect.");
      }
      const chain = chainForId(chainId);
      if (!chain) {
        throw new Error(`Chain ${chainId} is not supported.`);
      }
      // Ask Privy to switch first, then rebuild the viem walletClient
      // bound to the new chain — viem's client caches its `chain`
      // object, so reusing the old instance after a switch gives the
      // SDK a client that still thinks it's on the previous chain.
      await wallet.switchChain(chainId);
      const rawProvider = (await wallet.getEthereumProvider()) as EIP1193Provider;
      const provider = wrapProviderForSdk(rawProvider);
      return createWalletClient({
        account: wallet.address as `0x${string}`,
        chain,
        transport: custom(provider),
      }) as Client;
    },
  };
}

async function walletClientForActiveChain(): Promise<Client | null> {
  const wallet = currentWallet;
  if (!wallet) return null;
  const rawProvider = (await wallet.getEthereumProvider()) as EIP1193Provider;
  const provider = wrapProviderForSdk(rawProvider);
  // Read chain from the provider, not from `wallet.chainId`, because
  // Privy sometimes reports a stale chainId for a tick after a switch.
  let chain: Chain | undefined;
  try {
    const hex = (await provider.request({ method: "eth_chainId" })) as string;
    chain = chainForId(parseInt(hex, 16));
  } catch {
    chain = undefined;
  }
  if (!chain) {
    // Fall back to whatever Privy claims; the SDK's switchChain hook
    // will correct if needed.
    const parsed =
      typeof wallet.chainId === "string"
        ? Number(wallet.chainId.split(":").pop())
        : Number(wallet.chainId);
    chain = chainForId(parsed) ?? base;
  }
  return createWalletClient({
    account: wallet.address as `0x${string}`,
    chain,
    transport: custom(provider),
  }) as Client;
}

/**
 * Configure the LI.FI SDK. Idempotent. Safe to call from a client-side
 * effect — no-ops on the server. The integrator name is resolved once
 * via /api/lifi/config before this runs.
 */
export function configureLifiSdk(integrator: string): void {
  if (typeof window === "undefined") return;
  if (configured) return;

  evmProvider = EVM(buildEvmProviderOptions());

  createConfig({
    integrator,
    apiUrl: resolveApiUrl(),
    providers: [evmProvider],
    routeOptions: {
      // 25 bps — the cap LI.FI allows. Registered integrator on our
      // API key receives this via FeeForwarder on-chain.
      fee: 0.0025,
      slippage: DEFAULT_SLIPPAGE,
      order: "CHEAPEST",
    },
    // Let the SDK fetch its chain registry from /v1/chains lazily
    // on first use (routed through our proxy so the key stays
    // server-side). Without this, executeRoute fails with
    // "ChainId <id> not found" when resolving the destination
    // chain — the SDK has no chain data to construct the viem
    // transport from. This is ~20 KB one-time and cached.
    preloadChains: true,
  });

  configured = true;
}

/**
 * Update the active wallet the SDK should use for signing. Called
 * whenever the Privy wallet instance changes (login, relogin, account
 * swap). Also re-binds the EVM provider's options so in-flight route
 * executions see the new wallet on their next step.
 */
export function setLifiWallet(wallet: ConnectedWallet | null): void {
  currentWallet = wallet;
  if (evmProvider) {
    // Re-apply options — this forces getStepExecutor to pick up the
    // new walletClient for subsequent steps. setOptions is a cheap
    // mutator, so calling it on every wallet change is fine.
    evmProvider.setOptions(buildEvmProviderOptions());
  }
}

export function lifiSdkIsConfigured(): boolean {
  return configured;
}
