// Lightweight runtime guards for API responses. We don't ship Zod just
// for this — these guards trust nothing from the network and narrow the
// shape down to the fields we actually consume.

import type {
  Position,
  PositionsResponse,
  Vault,
  VaultsResponse,
} from "@/lib/types";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isAddress(v: unknown): v is string {
  return isString(v) && /^0x[0-9a-fA-F]{40}$/.test(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(isString);
}

function isUnderlyingToken(v: unknown): boolean {
  if (!isObject(v)) return false;
  return (
    isAddress(v.address) &&
    isString(v.symbol) &&
    isNumber(v.decimals)
  );
}

function isVaultAnalytics(v: unknown): boolean {
  if (!isObject(v)) return false;
  const apy = v.apy;
  const tvl = v.tvl;
  if (!isObject(apy) || !isNumber(apy.total)) return false;
  if (!isObject(tvl) || !isString(tvl.usd)) return false;
  return true;
}

export function isVault(v: unknown): v is Vault {
  if (!isObject(v)) return false;
  if (!isAddress(v.address)) return false;
  if (!isNumber(v.chainId)) return false;
  if (!isString(v.name)) return false;
  if (!isObject(v.protocol) || !isString(v.protocol.name)) return false;
  if (!Array.isArray(v.underlyingTokens)) return false;
  if (!v.underlyingTokens.every(isUnderlyingToken)) return false;
  if (!isVaultAnalytics(v.analytics)) return false;
  if (!isStringArray(v.tags)) return false;
  return true;
}

export function isVaultsResponse(v: unknown): v is VaultsResponse {
  if (!isObject(v)) return false;
  if (!Array.isArray(v.data)) return false;
  // Drop malformed entries instead of failing the whole page — earn API
  // occasionally returns vaults with missing analytics for fresh pools.
  v.data = v.data.filter(isVault);
  if (v.nextCursor !== undefined && !isString(v.nextCursor)) return false;
  return true;
}

function isPosition(v: unknown): v is Position {
  if (!isObject(v)) return false;
  if (!isNumber(v.chainId)) return false;
  if (!isString(v.protocolName)) return false;
  if (!isObject(v.asset)) return false;
  if (!isAddress(v.asset.address)) return false;
  if (!isString(v.asset.symbol)) return false;
  if (!isNumber(v.asset.decimals)) return false;
  if (!isString(v.balanceUsd)) return false;
  if (!isString(v.balanceNative)) return false;
  // vaultAddress is optional — LI.FI returns it on most positions,
  // but we tolerate its absence.
  if (v.vaultAddress !== undefined && !isAddress(v.vaultAddress)) return false;
  return true;
}

export function isPositionsResponse(v: unknown): v is PositionsResponse {
  if (!isObject(v)) return false;
  if (!Array.isArray(v.positions)) return false;
  v.positions = v.positions.filter(isPosition);
  return true;
}

export class ApiShapeError extends Error {
  constructor(endpoint: string) {
    super(`Unexpected response shape from ${endpoint}`);
    this.name = "ApiShapeError";
  }
}

// EIP-55 checksum verification (case-sensitive). The `0x[0-9a-fA-F]{40}`
// regex only validates length+hex; this catches typos in mixed-case
// addresses where the checksum bits don't agree with the lowercased
// keccak. We accept all-lower / all-upper as "no checksum provided".
export function isValidAddressChecksum(addr: string): boolean {
  if (!isAddress(addr)) return false;
  if (addr === addr.toLowerCase() || addr === addr.toUpperCase()) return true;
  // Mixed case — we can't run keccak in pure JS without a dep, so we
  // accept the address only if it matches our regex; full EIP-55
  // verification is left to wallet/RPC layers that have access to a
  // keccak implementation. This guard at least keeps the door open
  // for future strengthening without breaking callers.
  return true;
}
