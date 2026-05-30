import type {
  VaultsResponse,
  Vault,
  PositionsResponse,
  Position,
} from "@/lib/types";

// Minimal runtime guards — we only check the fields we actually
// read so a benign upstream shape drift (extra fields, reordered
// keys) doesn't crash the app. Anything we depend on is validated;
// everything else passes through untyped.
//
// As of mid-2026 the LI.FI Earn API returns BARE ARRAYS for both
// /v1/vaults and /v1/portfolio/:addr/positions (previously wrapped
// as { data } / { positions }). These guards accept either shape so
// the app survives the change and a hypothetical revert. The fetch
// layer (earn.ts) normalises the array form into the wrapped form
// the rest of the codebase expects.

export function isVaultsResponse(json: unknown): json is VaultsResponse {
  if (Array.isArray(json)) return true;
  if (typeof json !== "object" || json === null) return false;
  const obj = json as Record<string, unknown>;
  return Array.isArray(obj.data);
}

// A vault is "usable" if it has the handful of fields the deposit
// flow and cards actually read.
export function isVault(json: unknown): json is Vault {
  if (typeof json !== "object" || json === null) return false;
  const v = json as Record<string, unknown>;
  return typeof v.address === "string" && typeof v.chainId === "number";
}

export function isPositionsResponse(json: unknown): json is PositionsResponse {
  if (Array.isArray(json)) return true;
  if (typeof json !== "object" || json === null) return false;
  const obj = json as Record<string, unknown>;
  return Array.isArray(obj.positions);
}

// A position is "usable" if it has the handful of fields the
// portfolio + withdraw flows actually read.
export function isPosition(json: unknown): json is Position {
  if (typeof json !== "object" || json === null) return false;
  const p = json as Record<string, unknown>;
  return typeof p.address === "string" && typeof p.chainId === "number";
}
