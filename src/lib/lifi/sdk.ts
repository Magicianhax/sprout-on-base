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
import { base } from "viem/chains";
import { DEFAULT_SLIPPAGE } from "@/lib/constants";
import { withAttribution } from "@/lib/attribution";

// ── Chain mapping ────────────────────────────────────────────────────
// sprout-base is single-chain. We keep the Record<number, Chain>
// shape (rather than collapsing to a single constant) so the LI.FI
// SDK's chainId callbacks have a uniform lookup path, and so a
// future chain addition is one new entry rather than a refactor.

const CHAINS_BY_ID: Record<number, Chain> = {
  [base.id]: base,
};

function chainForId(id: number): Chain | undefined {
  return CHAINS_BY_ID[id];
}

/**
 * Wrap the wallet connector's EIP-1193 provider to:
 *   1. Short-circuit EIP-5792 batched-call probes that injected /
 *      embedded wallets don't implement cleanly. viem (and the LI.FI
 *      SDK on top of it) probes wallet_getCapabilities to decide
 *      whether it can atomically batch approve + deposit via
 *      wallet_sendCalls. Returning an empty capabilities map tells
 *      viem "no special batching support", so the SDK falls back to
 *      regular eth_sendTransaction — which every wallet handles fine.
 *   2. Append the Base Builder Code ERC-8021 suffix to the calldata
 *      of every eth_sendTransaction the SDK signs, so attribution
 *      reaches base.dev without needing per-call-site changes.
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
      // ABI-encoded calldata, so the append is safe for every call
      // shape. We rebuild the params array immutably so the caller's
      // input is never mutated.
      if (args.method === "eth_sendTransaction" && Array.isArray(args.params)) {
        const inParams = args.params as Array<{ data?: string; [k: string]: unknown }>;
        const head = inParams[0];
        if (head && typeof head === "object") {
          const newParams = [
            { ...head, data: withAttribution(head.data) },
            ...inParams.slice(1),
          ];
          return loose.request({ ...args, params: newParams });
        }
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
      // Ask the connector to switch first, then rebuild the viem
      // walletClient bound to the new chain — viem's client caches
      // its `chain` object, so reusing the old instance after a
      // switch gives the SDK a client that still thinks it's on the
      // previous chain.
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
  // Read chain from the provider rather than wallet.chainId — wagmi
  // sometimes reports a stale chainId for a tick after a switch, and
  // the on-the-wire eth_chainId is always authoritative.
  let chain: Chain | undefined;
  try {
    const hex = (await provider.request({ method: "eth_chainId" })) as string;
    chain = chainForId(parseInt(hex, 16));
  } catch {
    chain = undefined;
  }
  if (!chain) {
    // Fall back to the shim's reported chainId. It's a number from
    // wagmi (the upstream Privy version was a CAIP-2 string — the
    // dual-shape branch from sprout/ is no longer needed here).
    chain = chainForId(Number(wallet.chainId)) ?? base;
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
 * whenever the wagmi connector account changes (login, relogin,
 * account swap). Also re-binds the EVM provider's options so
 * in-flight route executions see the new wallet on their next step.
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
