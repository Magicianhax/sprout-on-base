"use client";

import { useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { base } from "wagmi/chains";
import { baseAccount, injected } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// sprout-base auth — the canonical Base App stack.
//
// One chain (Base mainnet), two connectors:
//   - baseAccount() — Sign in with Base / passkey-based smart wallet.
//     This is the primary path; what the landing page CTA triggers.
//   - injected() — existing wallets (MetaMask, Rabby, etc.). Lets
//     power users connect their EOA without going through Coinbase.
//
// ssr: true keeps wagmi happy under Next 16 App Router server
// components. The QueryClient is created once per mount via useState
// so HMR doesn't multiply caches.

const config = createConfig({
  chains: [base],
  connectors: [
    baseAccount({ appName: "Sprout" }),
    injected(),
  ],
  transports: {
    [base.id]: http(),
  },
  ssr: true,
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
