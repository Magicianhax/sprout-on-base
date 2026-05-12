// Base Builder Codes — ERC-8021 attribution suffix.
//
// We append DATA_SUFFIX to the `data` field of every eth_sendTransaction
// so Base.dev can attribute the transaction to Sprout and we earn
// referral fees on Base. Smart contracts ignore trailing bytes past
// the ABI-encoded calldata, so this is safe to append to ANY tx,
// including approvals, deposits, withdrawals, and bare value transfers.
//
// Register the builder code at https://base.dev > Settings > Builder
// Codes, then paste it into NEXT_PUBLIC_BASE_BUILDER_CODE in .env.local.
// If the env var is missing, withAttribution() is a no-op — the app
// still works, attribution is just skipped.
//
// Gas cost: 16 gas per non-zero byte. Negligible.

import { Attribution } from "ox/erc8021";

const RAW_CODE = process.env.NEXT_PUBLIC_BASE_BUILDER_CODE?.trim() || "";

export const DATA_SUFFIX: `0x${string}` | "" = RAW_CODE
  ? Attribution.toDataSuffix({ codes: [RAW_CODE] })
  : "";

// Append the suffix to existing calldata without mangling the 0x prefix.
// Pass undefined or empty to get back just the suffix (or "0x" if no
// builder code is configured — viem/EIP-1193 both accept "0x" for the
// "empty data" case).
export function withAttribution(data?: string): `0x${string}` {
  const base = data && data !== "0x" ? data : "0x";
  if (!DATA_SUFFIX) return base as `0x${string}`;
  if (base === "0x") return DATA_SUFFIX;
  return (base + DATA_SUFFIX.slice(2)) as `0x${string}`;
}
