// sprout-base is Base-only. The chain list collapses to a single
// entry; we keep the chainId-indexed maps so the rest of the codebase
// (which was written for the multi-chain sprout) keeps working
// unchanged. If you find yourself adding a second chain back, you
// almost certainly want the parent `sprout/` project instead.
export const BASE_CHAIN_ID = 8453 as const;
export const SUPPORTED_CHAIN_IDS = [BASE_CHAIN_ID] as const;

export const TOKEN_ADDRESSES: Record<string, Record<number, string>> = {
  ETH: {
    8453: "0x0000000000000000000000000000000000000000",
  },
  USDC: {
    8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  USDT: {
    8453: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
  },
  DAI: {
    8453: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
  },
  // No WBTC on Base — drop the entry entirely rather than leave it
  // empty, so the source-token picker doesn't render a dead option.
};

export const TOKEN_DECIMALS: Record<string, number> = {
  USDC: 6,
  USDT: 6,
  ETH: 18,
  DAI: 18,
};

export const CHAIN_NAMES: Record<number, string> = {
  8453: "Base",
};

export const SUPPORTED_TOKENS = [
  { symbol: "USDC", name: "USD Coin" },
  { symbol: "USDT", name: "Tether" },
  { symbol: "ETH", name: "Ethereum" },
  { symbol: "DAI", name: "Dai" },
] as const;

export const RISK_TAG_MAP: Record<string, "low" | "medium" | "high"> = {
  stablecoin: "low",
  single: "low",
  "blue-chip": "low",
  multi: "medium",
  "il-risk": "high",
};

export const EARN_API_BASE = "https://earn.li.fi";
export const LIFI_API_BASE = "https://li.quest";

export const ALCHEMY_NETWORK_BY_CHAIN: Record<number, string> = {
  8453: "base-mainnet",
};

export const NATIVE_SYMBOL_BY_CHAIN: Record<number, string> = {
  8453: "ETH",
};

export const EXPLORER_TX_URL_BY_CHAIN: Record<number, string> = {
  8453: "https://basescan.org/tx/",
};

// Pagination / streaming
export const VAULT_PAGE_SIZE = 100;
export const VAULT_MAX_PAGES = 10;
export const HOME_PAGE_SIZE = 10;

// Timing
export const QUOTE_DEBOUNCE_MS = 600;
// After a deposit/withdraw, we invalidate caches and then keep
// retrying on this schedule so slow indexers (LI.FI earn, Alchemy)
// eventually report the new state. Earn positions in particular can
// take 30-60s to land, so we push the last retry out to 90s.
export const POSITION_RESYNC_DELAYS_MS = [3000, 8000, 20000, 45000, 90000] as const;
export const API_FETCH_TIMEOUT_MS = 15000;
export const RPC_FETCH_TIMEOUT_MS = 10000;

// Safety caps for swap/bridge parameters forwarded to LI.FI.
// DEFAULT_SLIPPAGE is what the SDK sends when we don't override.
// 1% is the minimum that reliably clears Pendle PT paths, newer
// stablecoin mints (USDai, etc.), and compounded multi-hop routes
// (e.g. USDC→PYUSD→USDai→PT where each hop eats 0.5% and compounds
// to ~1.5% at the top level). 0.5% was genuinely too tight for
// vault deposits — stable→stable direct swaps survived it, but
// anything that touched a newer protocol or a compound route hit
// "Simulation Failed" in any wallet with a real simulator (Rabby,
// MetaMask 12+). Real user cost at 1% is negligible because LI.FI
// routes through the best DEX anyway — this is headroom, not a
// price the user pays.
export const MAX_SLIPPAGE = 0.03; // 3% hard cap
export const DEFAULT_SLIPPAGE = 0.01; // 1% when client omits it

// Allowlists for the earn API proxy (see /api/earn/[...path]/route.ts).
// Path layout changed Apr 2026 — LI.FI dropped the /earn/ subpath
// segment, so endpoints now live at /v1/vaults, /v1/chains, etc.
export const EARN_API_PATH_ALLOWLIST: readonly RegExp[] = [
  /^v1\/vaults$/,
  /^v1\/chains$/,
  /^v1\/protocols$/,
  /^v1\/portfolio\/0x[0-9a-fA-F]{40}\/positions$/,
] as const;

export const EARN_API_QUERY_ALLOWLIST = new Set([
  "chainId",
  "asset",
  "sortBy",
  "limit",
  "cursor",
] as const);

export const DEFAULT_PREFERENCES = {
  mode: "lite" as const,
  riskLevel: "low" as const,
  preferredTokens: ["USDC"],
  experienceLevel: "beginner" as const,
  onboardingComplete: false,
  notificationsEnabled: false,
  darkMode: false,
  riskAcknowledged: false,
};
