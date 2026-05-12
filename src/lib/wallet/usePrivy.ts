"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSignMessage,
} from "wagmi";
import { createSiweMessage, generateSiweNonce } from "viem/siwe";
import { base } from "viem/chains";
import {
  clearSession,
  loadSession,
  saveSession,
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

// User shape mirrors @privy-io/react-auth's User just enough to keep
// the existing call sites compiling. `email` is a vestigial field
// from the multi-method login era — Base Account is wallet-only, so
// at runtime it's always undefined. We expose it as optional so the
// `user?.email?.address` accesses in Header and Settings type-check
// and silently render nothing.
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
  // for this exact address. If the user signed in then switched
  // wallets, the session no longer matches and we treat them as
  // logged out (forces a fresh sign-in).
  const authenticated =
    isConnected &&
    !!address &&
    !!session &&
    session.address.toLowerCase() === address.toLowerCase();

  const login = useCallback(async () => {
    // If wagmi already has a live connection (e.g. the user reloaded
    // and we auto-reconnected via cookieStorage, but the SIWE session
    // in localStorage has expired) we re-use that connection rather
    // than calling connectAsync, which would throw "AlreadyConnected"
    // on the second attempt.
    let signer: `0x${string}` | undefined =
      isConnected && address ? address : undefined;

    if (!signer) {
      // Pick baseAccount by name where possible; fall back to whatever
      // connector wagmi exposes first. The provider.tsx config lists
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

    // SIWE: ties the session to a specific address + timestamp. We
    // don't ship the signature to a server — every later action is
    // proven by its own on-chain signature — but we re-verify the
    // SIWE signature client-side via viem to catch a misbehaving
    // wallet that returns a fake address.
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
    await signMessageAsync({ message });

    const next: Session = { address: signer, signedAt: Date.now() };
    saveSession(next);
    setSession(next);
  }, [connectors, connectAsync, signMessageAsync, isConnected, address]);

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
