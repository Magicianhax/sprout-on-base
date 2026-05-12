const DEFILLAMA_ICON_BASE = "https://icons.llamao.fi/icons/protocols";
const LIFI_CHAIN_ICON_BASE =
  "https://raw.githubusercontent.com/lifinance/types/main/src/assets/icons/chains";

const CHAIN_ICON_SLUGS: Record<number, string> = {
  1: "ethereum",
  8453: "base",
  42161: "arbitrum",
  10: "optimism",
  137: "polygon",
};

export function getProtocolLogoUrl(protocolName: string): string {
  return `${DEFILLAMA_ICON_BASE}/${protocolName}`;
}

export function getChainLogoUrl(chainId: number): string {
  const slug = CHAIN_ICON_SLUGS[chainId];
  if (!slug) return "/fallback-protocol.svg";
  return `${LIFI_CHAIN_ICON_BASE}/${slug}.svg`;
}

// Verified working logo URLs for all tokens from the Earn API
const TW = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains";
const CG = "https://assets.coingecko.com/coins/images";
const CMC = "https://s2.coinmarketcap.com/static/img/coins/64x64";

const KNOWN_LOGOS: Record<string, string> = {
  // Major tokens
  ETH: `${TW}/ethereum/info/logo.png`,
  WETH: `${TW}/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png`,
  USDC: `${TW}/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png`,
  USDT: `${TW}/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png`,
  DAI: `${TW}/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png`,
  WBTC: `${TW}/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png`,

  // ETH LSDs & derivatives
  weETH: `${CG}/33033/standard/weETH.png`,
  wstETH: `${CG}/18834/standard/wstETH.png`,
  cbETH: `${CG}/27008/standard/cbeth.png`,
  ezETH: `${CG}/34753/standard/Ezeth_logo_circle.png`,
  rsETH: `${CMC}/28934.png`,
  rETH: `${CG}/20764/standard/reth.png`,
  pufETH: `${TW}/ethereum/assets/0xD9A442856C234a39a81a089C06451EBAa4306a72/logo.png`,
  swETH: `${TW}/ethereum/assets/0xf951E335afb289353dc249e82926178EaC7DEd78/logo.png`,

  // BTC derivatives
  cbBTC: `${CMC}/32573.png`,
  LBTC: `${CMC}/33652.png`,
  tBTC: `${TW}/ethereum/assets/0x18084fbA666a33d37592fA2633fD49a74DD93a88/logo.png`,
  FBTC: `${CMC}/31543.png`,

  // Stablecoins
  USDe: `${CG}/33613/standard/USDE.png`,
  sUSDe: `${TW}/ethereum/assets/0x9D39A5DE30e57443BfF2A8307A4256c8797A3497/logo.png`,
  USDS: `${TW}/ethereum/assets/0xdC035D45d973E3EC169d2276DDab16f1e407384F/logo.png`,
  PYUSD: `${TW}/ethereum/assets/0x6c3ea9036406852006290770BEdFcAbA0e23A0e8/logo.png`,
  EURC: `${TW}/ethereum/assets/0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c/logo.png`,
  LUSD: `${TW}/ethereum/assets/0x5f98805A4E8be255a32880FDeC7F6728C6568bA0/logo.png`,

  // DeFi governance tokens
  AAVE: `${CG}/12645/standard/AAVE.png`,
  LINK: `${CG}/877/standard/chainlink-new-logo.png`,
  ARB: `${CG}/16547/standard/arb.jpg`,
  OP: `${CG}/25244/standard/Optimism.png`,
  CRV: `${CG}/12124/standard/Curve.png`,
  GNO: `${CG}/662/standard/logo_square_simple_300px.png`,
  RPL: `${TW}/ethereum/assets/0xD33526068D116cE69F19A9ee46F0bd304F21A51f/logo.png`,

  // Wrapped native tokens
  WAVAX: `${CG}/12559/standard/Avalanche_Circle_RedWhite_Trans.png`,
  WPOL: `${TW}/polygon/info/logo.png`,
};

// Map variant/derivative symbols to their canonical logo
const SYMBOL_ALIASES: Record<string, string> = {
  // USDC variants
  "USDC.e": "USDC",
  USDCe: "USDC",
  USDbC: "USDC",
  superUSDC: "USDC",
  gUSDC: "USDC",
  syrupUSDC: "USDC",
  // USDT variants
  USDT0: "USDT",
  USDt: "USDT",
  "USD₮": "USDT",
  USDtb: "USDT",
  // DAI variants
  "DAI.e": "DAI",
  USDai: "DAI",
  sUSDai: "DAI",
  // ETH/WETH variants
  "WETH.e": "WETH",
  superWETH: "WETH",
  WOETH: "WETH",
  ETHx: "ETH",
  DETH: "ETH",
  wrsETH: "rsETH",
  weETHs: "weETH",
  mHyperETH: "ETH",
  yoETH: "ETH",
  savETH: "ETH",
  hgETH: "ETH",
  msETH: "ETH",
  agETH: "ETH",
  uniETH: "ETH",
  tETH: "ETH",
  // BTC variants
  "BTC.b": "WBTC",
  // LINK variants
  "LINK.e": "LINK",
  // AAVE variants
  "AAVE.e": "AAVE",
  // Stablecoin variants
  stUSDS: "USDS",
  frxUSD: "USDC",
  FDUSD: "USDC",
  RLUSD: "USDC",
  reUSD: "USDC",
  rUSD: "USDC",
  DUSD: "USDC",
  USD3: "USDC",
  dUSD: "USDC",
  eUSD: "USDC",
  cUSD: "USDC",
  NUSD: "USDC",
  USP: "USDC",
  VCHF: "USDC",
  FXUSD: "USDC",
  sUSN: "USDC",
  siUSD: "USDC",
  msUSD: "USDC",
  apxUSD: "USDC",
  apyUSD: "USDC",
  avUSD: "USDC",
  USDG: "USDC",
  XSGD: "USDC",
  sBOLD: "USDC",
  sYUSD: "USDC",
  // Native wrappers
  WMNT: "ETH",
  WMON: "ETH",
  WXDAI: "DAI",
  wS: "ETH",
};

export function getTokenLogoUrl(symbol: string): string {
  // Direct match
  if (KNOWN_LOGOS[symbol]) return KNOWN_LOGOS[symbol];

  // Alias match
  const alias = SYMBOL_ALIASES[symbol];
  if (alias && KNOWN_LOGOS[alias]) return KNOWN_LOGOS[alias];

  // Pendle PT tokens — try to extract base symbol
  if (symbol.startsWith("PT-")) {
    const base = symbol
      .replace(/^PT-/, "")
      .replace(/-\d+[A-Z]{3}\d{4}$/, "")
      .replace(/^sr/, "s");
    if (KNOWN_LOGOS[base]) return KNOWN_LOGOS[base];
    const alias2 = SYMBOL_ALIASES[base];
    if (alias2 && KNOWN_LOGOS[alias2]) return KNOWN_LOGOS[alias2];
  }

  // Fallback
  return "/fallback-protocol.svg";
}
