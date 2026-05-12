"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  useConfig,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSignMessage,
} from "wagmi";
import { getAccount } from "@wagmi/core";
import { createSiweMessage, generateSiweNonce } from "viem/siwe";
import { base } from "viem/chains";
import {
  clearSession,
  loadSession,
  saveSession,
  SESSION_TTL_MS,
  type Session,
} from "./session";

// Compatibility shim — exposes the subset of @privy-io/react-auth's
// usePrivy() that sprout-base actually consumed. Backed by wagmi +
// the wagmi baseAccount() connector so users sign in with their
// Base (Coinbase smart) wallet via passkey.
//
// Why a shim instead of a refactor? The pre-Base-migration sprout
// codebase has ~20 call sites that read { ready, authenticated,
// user, login, logout } off usePrivy(). Keeping the same shape
// means the migration is one import-path swap per file instead of
// a logic rewrite per file.

// `email` is a vestigial field from the multi-method-login era —
// Base Account is wallet-only, so at runtime it's always undefined.
// We expose it as optional so the `user?.email?.address` accesses
// in Header and Settings type-check and silently render nothing.
export interface UsePrivyResult {
  ready: boolean;
  authenticated: boolean;
  user:
    | {
        wallet: { address: `0x${string}` };
        email?: { address?: string };
      }
    | null;
  login: () => Promise<void>;
  logout: () => void;
}

export function usePrivy(): UsePrivyResult {
  const { address, isConnected, status } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const config = useConfig();
  const publicClient = usePublicClient({ chainId: base.id });

  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate the session from localStorage exactly once on mount.
  // useEffect runs only on the client, so we never call localStorage
  // during SSR.
  useEffect(() => {
    setSession(loadSession());
    setHydrated(true);
  }, []);

  // wagmi exposes status as 'disconnected' | 'connecting' |
  // 'reconnecting' | 'connected'. We're "ready" once the initial
  // reconnect attempt has resolved AND we've read localStorage.
  const ready = hydrated && status !== "reconnecting" && status !== "connecting";

  // Authenticated = wallet connected AND a fresh SIWE signature exists
  // for this exact address AND the signature hasn't aged past TTL. The
  // TTL check here (not just at load) means a tab left open past the
  // 24h boundary flips back to logged-out on the next render.
  const authenticated =
    isConnected &&
    !!address &&
    !!session &&
    session.address.toLowerCase() === address.toLowerCase() &&
    Date.now() - session.signedAt < SESSION_TTL_MS;

  const login = useCallback(async () => {
    // Read the live account snapshot — the values destructured at the
    // top of this hook are captured in this useCallback closure and
    // can be stale by the time the user clicks (wagmi may have
    // completed a background reconnect since the last render).
    const live = getAccount(config);

    let signer: `0x${string}` | undefined =
      live.isConnected && live.address ? live.address : undefined;

    if (!signer) {
      // Pick baseAccount by id/name where possible; fall back to whatever
      // connector wagmi exposes first. The provider config lists
      // baseAccount first, so connectors[0] is the right one even if
      // wagmi's connector.id naming changes between versions.
      const baseConnector =
        connectors.find(
          (c) =>
            c.id === "baseAccount" ||
            c.id === "baseAccountSDK" ||
            c.name === "Base Account"
        ) ?? connectors[0];
      if (!baseConnector) {
        throw new Error("No wallet connector available.");
      }
      const result = await connectAsync({ connector: baseConnector });
      signer = result.accounts[0];
    }

    if (!signer) throw new Error("Wallet did not return an address.");
    if (!publicClient) {
      throw new Error(
        "No Base RPC client available — cannot verify your wallet signature."
      );
    }

    // SIWE: ties the session to a specific address + timestamp. We
    // don't ship the signature to a server (every on-chain action is
    // its own proof of wallet control), but we DO verify the
    // signature locally via viem's verifyMessage. viem handles both
    // EOA (ECDSA recover) and smart-wallet (EIP-1271, ERC-6492)
    // signatures transparently, so this catches a misbehaving
    // connector that hands us a wrong address from connectAsync.
    const nonce = generateSiweNonce();
    const message = createSiweMessage({
      address: signer,
      chainId: base.id,
      domain: typeof window !== "undefined" ? window.location.host : "sprout",
      nonce,
      uri:
        typeof window !== "undefined"
          ? window.location.origin
          : "https://sprout.app",
      version: "1",
      statement: "Sign in to Sprout to manage your Base yield positions.",
    });
    const signature = await signMessageAsync({ message });
    const valid = await publicClient.verifyMessage({
      address: signer,
      message,
      signature,
    });
    if (!valid) {
      throw new Error(
        "Sign-in signature failed verification. Please reconnect your wallet and try again."
      );
    }

    const next: Session = { address: signer, signedAt: Date.now() };
    saveSession(next);
    setSession(next);
  }, [config, connectors, connectAsync, signMessageAsync, publicClient]);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
    void disconnectAsync().catch(() => {
      // disconnect can throw if there's no active connection — fine,
      // the user is logging out anyway.
    });
  }, [disconnectAsync]);

  return {
    ready,
    authenticated,
    user: authenticated && address ? { wallet: { address } } : null,
    login,
    logout,
  };
}
