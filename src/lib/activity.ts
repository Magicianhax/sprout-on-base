import { CHAIN_NAMES } from "@/lib/constants";
import { displayProtocol } from "@/lib/protocols";
import type { ActivityGroup, Vault, WalletTransfer } from "@/lib/types";

export type ActivityKind =
  | "deposit"
  | "withdraw"
  | "swap"
  | "bridge"
  | "send"
  | "receive";

export interface Classification {
  kind: ActivityKind;
  label: string;
  subLabel: string;
  primary: WalletTransfer;
  vault?: Vault;
}

// Whitelist of symbols we consider "real" beyond the vault cache.
export const KNOWN_TOKEN_SYMBOLS = new Set([
  "ETH",
  "POL",
  "MATIC",
  "WETH",
  "WBTC",
  "USDC",
  "USDC.E",
  "USDT",
  "USDT0",
  "DAI",
  "USDS",
  "FRAX",
  "LUSD",
  "CRVUSD",
  "GHO",
  "PYUSD",
  "TUSD",
  "STETH",
  "WSTETH",
  "CBETH",
  "CBBTC",
  "RETH",
  "WEETH",
  "EETH",
]);

export function findVaultByAddress(
  vaults: Vault[],
  chainId: number,
  address: string | null
): Vault | undefined {
  if (!address) return undefined;
  const target = address.toLowerCase();
  return vaults.find(
    (v) => v.chainId === chainId && v.address.toLowerCase() === target
  );
}

export function isRecognizedTransfer(
  t: WalletTransfer,
  vaults: Vault[]
): boolean {
  if (t.token.address === null) return true;
  if (KNOWN_TOKEN_SYMBOLS.has(t.token.symbol.toUpperCase())) return true;
  if (findVaultByAddress(vaults, t.chainId, t.token.address)) return true;
  if (findVaultByAddress(vaults, t.chainId, t.counterparty)) return true;
  return false;
}

// Strip spam transfers from a group. Returns a new group object so the
// original is untouched. Groups with no recognized transfers are later
// dropped by the caller.
export function cleanGroup(
  group: ActivityGroup,
  vaults: Vault[]
): ActivityGroup {
  return {
    ...group,
    transfers: group.transfers.filter((t) => isRecognizedTransfer(t, vaults)),
  };
}

export function classifyActivity(
  group: ActivityGroup,
  vaults: Vault[]
): Classification {
  const transfers = group.transfers;
  const chainName = CHAIN_NAMES[group.chainId] ?? `Chain ${group.chainId}`;

  for (const t of transfers) {
    // Match by token (share token itself is the vault address)
    const vaultByToken = findVaultByAddress(vaults, t.chainId, t.token.address);
    if (vaultByToken) {
      if (t.direction === "in") {
        const underlying =
          transfers.find((x) => x.direction === "out" && x !== t) ?? t;
        return {
          kind: "deposit",
          label: `Deposited into ${displayProtocol(vaultByToken.protocol.name)}`,
          subLabel: chainName,
          primary: underlying,
          vault: vaultByToken,
        };
      }
      const underlying =
        transfers.find((x) => x.direction === "in" && x !== t) ?? t;
      return {
        kind: "withdraw",
        label: `Withdrew from ${displayProtocol(vaultByToken.protocol.name)}`,
        subLabel: chainName,
        primary: underlying,
        vault: vaultByToken,
      };
    }

    // Match by counterparty (direct interaction with vault contract)
    const vaultByCounter = findVaultByAddress(
      vaults,
      t.chainId,
      t.counterparty
    );
    if (vaultByCounter) {
      if (t.direction === "out") {
        return {
          kind: "deposit",
          label: `Deposited into ${displayProtocol(vaultByCounter.protocol.name)}`,
          subLabel: chainName,
          primary: t,
          vault: vaultByCounter,
        };
      }
      return {
        kind: "withdraw",
        label: `Withdrew from ${displayProtocol(vaultByCounter.protocol.name)}`,
        subLabel: chainName,
        primary: t,
        vault: vaultByCounter,
      };
    }
  }

  // Not a vault tx
  const outs = transfers.filter((t) => t.direction === "out");
  const ins = transfers.filter((t) => t.direction === "in");

  if (outs.length > 0 && ins.length > 0) {
    const out = outs[0];
    const inc = ins[0];
    if (out.token.symbol !== inc.token.symbol) {
      return {
        kind: "swap",
        label: `${out.token.symbol} → ${inc.token.symbol}`,
        subLabel: chainName,
        primary: out,
      };
    }
  }

  if (outs.length > 0) {
    const out = outs[0];
    return {
      kind: "send",
      label: `Sent ${out.token.symbol}`,
      subLabel: chainName,
      primary: out,
    };
  }

  const inc = ins[0] ?? transfers[0];
  return {
    kind: "receive",
    label: `Received ${inc.token.symbol}`,
    subLabel: chainName,
    primary: inc,
  };
}
