export interface UserPreferences {
  mode: "lite" | "pro";
  riskLevel: "low" | "medium" | "high";
  preferredTokens: string[];
  experienceLevel: "beginner" | "intermediate" | "advanced";
  onboardingComplete: boolean;
  notificationsEnabled: boolean;
  darkMode: boolean;
  /** User has acknowledged the smart-contract risk notice at least once. */
  riskAcknowledged: boolean;
}

export interface VaultProtocol {
  name: string;
  url?: string;
}

export interface UnderlyingToken {
  address: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
}

export interface VaultAnalytics {
  apy: {
    base: number;
    reward: number | null;
    total: number;
  };
  apy1d: number | null;
  apy7d: number | null;
  apy30d: number | null;
  tvl: {
    usd: string;
  };
}

export interface Vault {
  address: string;
  chainId: number;
  name: string;
  protocol: VaultProtocol;
  underlyingTokens: UnderlyingToken[];
  analytics: VaultAnalytics;
  tags: string[];
  isTransactional: boolean;
  isRedeemable: boolean;
}

export interface VaultsResponse {
  data: Vault[];
  nextCursor?: string;
  total?: number;
}

export interface PositionAsset {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
}

export interface Position {
  chainId: number;
  protocolName: string;
  asset: PositionAsset;
  balanceUsd: string;
  balanceNative: string;
  /** Vault share-token address reported by LI.FI. Used to cross-
   *  reference against the vaults cache so we can correct the
   *  protocolName when LI.FI's position response mislabels it. */
  vaultAddress?: string;
  /** Raw vault share balance in base units (hex-encoded, 0x
   *  prefixed). Populated by the on-chain positions builder so
   *  the withdraw flow can call `redeem(shares)` without having
   *  to re-query `balanceOf` through a potentially lagging user
   *  RPC. Absent when the Position came from another source. */
  shareBalanceRaw?: string;
}

export interface PositionsResponse {
  positions: Position[];
}

export interface Chain {
  chainId: number;
  name: string;
  networkCaip?: string;
}

export type RiskLevel = "low" | "medium" | "high";
export type SortBy = "tvl" | "apy";

// Wallet activity feed — backed by alchemy_getAssetTransfers. Each
// transaction (grouped by hash) can contain multiple transfers (e.g.
// a vault deposit is USDC out + shares in, same tx). Classification
// happens client-side against the useVaults cache so we can label
// deposits / withdrawals with the protocol name.
export interface WalletTransfer {
  hash: string;
  chainId: number;
  direction: "in" | "out";
  token: {
    address: string | null; // null for native chain token
    symbol: string;
    decimals: number;
  };
  amount: string; // raw base units as decimal string
  counterparty: string;
  timestamp: number; // unix seconds
}

export interface ActivityGroup {
  id: string;
  chainId: number;
  hash: string;
  timestamp: number;
  explorerUrl: string;
  transfers: WalletTransfer[];
}

export interface ActivityResponse {
  data: ActivityGroup[];
}
