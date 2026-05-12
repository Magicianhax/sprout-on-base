"use client";

import { useEffect, useRef } from "react";
import { useWallets } from "@/lib/wallet";
import {
  configureLifiSdk,
  lifiSdkIsConfigured,
  setLifiWallet,
} from "@/lib/lifi/sdk";

// Bootstraps the LI.FI SDK on the client: fetches the integrator name
// from our server-side /api/lifi/config (so the API key never leaves
// the backend), calls createConfig once, then keeps the SDK's EVM
// provider in sync with whichever Privy wallet is currently active.

async function fetchIntegrator(): Promise<string> {
  try {
    const res = await fetch("/api/lifi/config", { cache: "no-store" });
    if (!res.ok) return "sprout";
    const body = (await res.json()) as { integrator?: string | null };
    return body.integrator || "sprout";
  } catch {
    return "sprout";
  }
}

export function LifiSdkProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { wallets } = useWallets();
  const configuredOnce = useRef(false);

  // Configure the SDK exactly once at mount. StrictMode would call
  // the effect twice in dev, but `configureLifiSdk` is itself
  // idempotent — this ref is a belt-and-braces guard.
  useEffect(() => {
    if (configuredOnce.current) return;
    configuredOnce.current = true;

    let cancelled = false;
    void fetchIntegrator().then((integrator) => {
      if (cancelled) return;
      if (!lifiSdkIsConfigured()) {
        configureLifiSdk(integrator);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the SDK wallet pointer in sync with Privy. Privy reports
  // wallets[0] as the primary connected wallet — we push it into
  // the SDK's EVM provider so getWalletClient/switchChain hit the
  // right EIP-1193 instance.
  useEffect(() => {
    const active = wallets.find((w) => !!w.address) ?? wallets[0] ?? null;
    setLifiWallet(active);
  }, [wallets]);

  return <>{children}</>;
}
