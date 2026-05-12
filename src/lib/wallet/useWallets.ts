"use client";

import { useEffect, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import type { EIP1193Provider } from "viem";

// Compatibility shim for @privy-io/react-auth's useWallets(). The
// downstream code (LI.FI SDK provider wrapper, depositFlow,
// withdrawExecutor, SendModal) walks wallets[0] and reads:
//
//   wallet.address                — primary wallet address
//   wallet.chainId                — number or CAIP-2 string
//   wallet.switchChain(id)        — switch network
//   wallet.getEthereumProvider()  — raw EIP-1193 provider
//
// We expose the same surface against the active wagmi connector so
// nothing downstream needs to know we swapped the auth backend.

export interface ConnectedWallet {
  address: `0x${string}`;
  chainId: number;
  switchChain: (chainId: number) => Promise<void>;
  getEthereumProvider: () => Promise<EIP1193Provider>;
}

export function useWallets(): { wallets: ConnectedWallet[] } {
  const { address, chainId, connector, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);

  useEffect(() => {
    if (!isConnected || !address || !connector) {
      setWallet(null);
      return;
    }

    // The connector's provider isn't always synchronously available
    // (Base Account opens a popup; injected wallets read window.
    // ethereum). Build a wallet object whose getEthereumProvider()
    // resolves it lazily on demand, so the caller controls when the
    // (potentially slow) wallet-side init happens.
    const next: ConnectedWallet = {
      address,
      chainId: chainId ?? 0,
      switchChain: async (id: number) => {
        // wagmi types chainId to the configured-chains union (just 8453
        // here). Callers pass plain numbers (position.chainId etc.),
        // and at runtime wagmi rejects anything not in the config —
        // exactly the behaviour we want. The cast just bridges the
        // type gap without weakening the runtime check.
        await switchChainAsync({ chainId: id as 8453 });
      },
      getEthereumProvider: async () => {
        const provider = await connector.getProvider();
        return provider as EIP1193Provider;
      },
    };
    setWallet(next);
  }, [address, chainId, connector, isConnected, switchChainAsync]);

  return { wallets: wallet ? [wallet] : [] };
}
