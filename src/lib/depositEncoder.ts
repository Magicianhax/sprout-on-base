// Minimal ABI encoders for the few direct-contract paths the LI.FI
// SDK doesn't handle:
//
//   - encodeBalanceOf: used by the deposit hook to poll an ERC20
//     balance on the destination chain, waiting for bridged funds
//     to actually land before firing the same-chain Composer
//     deposit tail. LI.FI's /status flips to DONE a block or two
//     before the user's RPC reflects it, and an early deposit
//     quote would return zero amount.
//
//   - encodeWithdraw / encodeRedeem: used by withdrawExecutor.ts
//     for the partial-withdraw path (SDK has no "withdraw N
//     underlying" primitive) and for the direct-redeem fallback
//     when LI.FI can't route a vault-share exit.
//
// Approve / allowance / deposit encoders that used to live here
// have been removed — Composer same-chain via getRoutes covers the
// "bridge + deposit" tail path, so the SDK does the approve and
// deposit itself. We kept no speculative helpers.

const BALANCE_OF_SELECTOR = "0x70a08231"; // balanceOf(address)
const WITHDRAW_SELECTOR = "0xb460af94"; // withdraw(uint256,address,address)
const REDEEM_SELECTOR = "0xba087652"; // redeem(uint256,address,address)

function hex32(value: string | bigint): string {
  const hex =
    typeof value === "bigint"
      ? value.toString(16)
      : value.replace(/^0x/, "").toLowerCase();
  return hex.padStart(64, "0");
}

export function encodeBalanceOf(holder: string): string {
  return `${BALANCE_OF_SELECTOR}${hex32(holder)}`;
}

export function encodeWithdraw(
  assets: bigint,
  receiver: string,
  owner: string
): string {
  return `${WITHDRAW_SELECTOR}${hex32(assets)}${hex32(receiver)}${hex32(owner)}`;
}

export function encodeRedeem(
  shares: bigint,
  receiver: string,
  owner: string
): string {
  return `${REDEEM_SELECTOR}${hex32(shares)}${hex32(receiver)}${hex32(owner)}`;
}
