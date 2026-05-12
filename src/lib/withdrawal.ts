// Protocols that support native withdrawal via Composer
const NATIVE_WITHDRAW_PROTOCOLS = new Set([
  "morpho-v1",
  "morpho-v2",
  "aave-v3",
  "euler-v2",
  "pendle",
  "lido-wsteth",
  "ether.fi-stake",
  "ether.fi-liquid",
  "felix-vanilla",
  "hyperlend",
  "neverland",
  "usdai",
  "seamless",
]);

export function supportsNativeWithdraw(protocolName: string): boolean {
  return NATIVE_WITHDRAW_PROTOCOLS.has(protocolName);
}

export type WithdrawMethod = "composer" | "swap";

export function getWithdrawMethod(protocolName: string): WithdrawMethod {
  return supportsNativeWithdraw(protocolName) ? "composer" : "swap";
}
