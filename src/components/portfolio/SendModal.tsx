"use client";

import { useMemo, useState } from "react";
import { useWallets } from "@/lib/wallet";
import { ChevronDown, X } from "lucide-react";
import { TokenIcon } from "@/components/ui/TokenIcon";
import { TransactionModal } from "@/components/deposit/TransactionModal";
import { CHAIN_NAMES, TOKEN_ADDRESSES, TOKEN_DECIMALS } from "@/lib/constants";
import { withAttribution } from "@/lib/attribution";
import { toTokenUnits } from "@/lib/format";
import type { TokenBalance } from "@/lib/hooks/useBalances";

interface SendModalProps {
  open: boolean;
  onClose: () => void;
  walletAddress: string;
  balances: TokenBalance[];
}

type Phase = "form" | "confirming" | "success" | "error";

const ERC20_TRANSFER_SELECTOR = "0xa9059cbb"; // transfer(address,uint256)

function hex32(value: string | bigint): string {
  const hex =
    typeof value === "bigint"
      ? value.toString(16)
      : value.replace(/^0x/, "").toLowerCase();
  return hex.padStart(64, "0");
}

function encodeErc20Transfer(to: string, amount: bigint): string {
  return `${ERC20_TRANSFER_SELECTOR}${hex32(to)}${hex32(amount)}`;
}

function isValidAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function tokenKey(b: TokenBalance): string {
  return `${b.chainId}-${b.symbol}`;
}

export function SendModal({
  open,
  onClose,
  walletAddress,
  balances,
}: SendModalProps) {
  const { wallets } = useWallets();

  const sendable = useMemo(
    () => balances.filter((b) => b.balanceFormatted > 0),
    [balances]
  );

  const [selectedKey, setSelectedKey] = useState<string>(
    () => (sendable[0] ? tokenKey(sendable[0]) : "")
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [txHash, setTxHash] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  if (!open) return null;

  const selected = sendable.find((b) => tokenKey(b) === selectedKey) ?? sendable[0];
  const numeric = parseFloat(amount);
  const validAmount = !isNaN(numeric) && numeric > 0 && selected && numeric <= selected.balanceFormatted;
  const validRecipient = isValidAddress(recipient.trim());
  const canSend = Boolean(selected && validAmount && validRecipient && phase === "form");

  const tokenAddr = selected ? TOKEN_ADDRESSES[selected.symbol]?.[selected.chainId] : undefined;
  const isNative = tokenAddr === "0x0000000000000000000000000000000000000000";
  const decimals = selected ? TOKEN_DECIMALS[selected.symbol] ?? 18 : 18;

  function handleMax() {
    if (!selected) return;
    setAmount(String(selected.balanceFormatted));
  }

  function resetForm() {
    setAmount("");
    setRecipient("");
    setTxHash("");
    setErrorMessage("");
    setPhase("form");
  }

  function handleFullClose() {
    resetForm();
    onClose();
  }

  async function handleSend() {
    if (!canSend || !selected || !tokenAddr) return;

    const wallet =
      wallets.find((w) => w.address.toLowerCase() === walletAddress.toLowerCase()) ??
      wallets[0];
    if (!wallet) {
      setErrorMessage("No wallet found. Please reconnect.");
      setPhase("error");
      return;
    }

    setPhase("confirming");
    setErrorMessage("");

    try {
      await wallet.switchChain(selected.chainId);
      const provider = await wallet.getEthereumProvider();

      const cleanRecipient = recipient.trim();
      const rawAmount = toTokenUnits(numeric, decimals);
      const amountBig = BigInt(rawAmount);

      // viem's EIP1193Provider types eth_sendTransaction strictly as
      // [ExactPartial<RpcTransactionRequest>] where every address/hex
      // field is `0x${string}`. cleanRecipient is user input (plain
      // string) so we cast it to the template-literal type after the
      // earlier validation step has confirmed it matches 0x[hex]{40}.
      let txParams: {
        from: `0x${string}`;
        to: `0x${string}`;
        data?: `0x${string}`;
        value?: `0x${string}`;
      };

      if (isNative) {
        txParams = {
          from: wallet.address,
          to: cleanRecipient as `0x${string}`,
          value: `0x${amountBig.toString(16)}` as `0x${string}`,
          data: withAttribution(),
        };
      } else {
        txParams = {
          from: wallet.address,
          to: tokenAddr as `0x${string}`,
          data: withAttribution(encodeErc20Transfer(cleanRecipient, amountBig)),
        };
      }

      const hash = (await provider.request({
        method: "eth_sendTransaction",
        params: [txParams],
      })) as string;

      setTxHash(hash);
      setPhase("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transaction failed";
      setErrorMessage(message);
      setPhase("error");
    }
  }

  const modalStatus =
    phase === "confirming"
      ? "confirming"
      : phase === "success"
      ? "success"
      : phase === "error"
      ? "error"
      : null;

  return (
    <>
      <style>{`
        @keyframes send-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes send-slide-up {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .send-backdrop { animation: send-fade-in 0.22s ease-out both; }
        .send-card { animation: send-slide-up 0.3s ease-out both; }
      `}</style>

      <div
        className="fixed inset-0 z-50 flex items-center justify-center px-5 bg-black/50 backdrop-blur-sm send-backdrop"
        aria-modal="true"
        role="dialog"
        onClick={handleFullClose}
      >
        <div
          className="bg-sprout-card rounded-3xl shadow-2xl w-full max-w-[380px] p-6 send-card relative"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleFullClose}
            className="absolute right-4 top-4 p-1 rounded-full text-sprout-text-muted hover:text-sprout-text-primary transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>

          <h2 className="font-heading text-xl font-800 text-sprout-text-primary text-center">
            Send
          </h2>

          {sendable.length === 0 ? (
            <div className="mt-8 text-center">
              <p className="text-sm text-sprout-text-secondary">
                You have nothing to send yet.
              </p>
              <p className="text-xs text-sprout-text-muted mt-2">
                Add tokens via Receive to get started.
              </p>
            </div>
          ) : (
            <>
              {/* Token picker */}
              <div className="mt-5">
                <p className="text-xs font-semibold text-sprout-text-muted uppercase tracking-wide mb-2">
                  Token
                </p>
                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  className="w-full flex items-center gap-3 bg-sprout-green-light/60 rounded-2xl px-4 py-3 cursor-pointer"
                >
                  {selected ? (
                    <>
                      <div className="relative shrink-0">
                        <TokenIcon type="token" identifier={selected.symbol} size={36} />
                        <div
                          className="absolute -bottom-1 -right-1 rounded-full border-2 border-sprout-card overflow-hidden"
                          style={{ width: 16, height: 16 }}
                        >
                          <TokenIcon type="chain" identifier={selected.chainId} size={16} />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-semibold text-sprout-text-primary">
                          {selected.symbol}
                        </p>
                        <p className="text-[11px] text-sprout-text-muted">
                          {CHAIN_NAMES[selected.chainId] ?? `Chain ${selected.chainId}`} ·{" "}
                          {selected.balanceFormatted.toFixed(4)} available
                        </p>
                      </div>
                      <ChevronDown
                        size={18}
                        className={`text-sprout-text-muted transition-transform ${pickerOpen ? "rotate-180" : ""}`}
                      />
                    </>
                  ) : (
                    <span className="text-sm text-sprout-text-muted">Select a token</span>
                  )}
                </button>

                {pickerOpen && (
                  <div className="mt-2 rounded-2xl border border-sprout-border bg-sprout-card max-h-[220px] overflow-y-auto">
                    {sendable.map((b) => (
                      <button
                        key={tokenKey(b)}
                        type="button"
                        onClick={() => {
                          setSelectedKey(tokenKey(b));
                          setPickerOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-sprout-green-light/40 cursor-pointer text-left"
                      >
                        <div className="relative shrink-0">
                          <TokenIcon type="token" identifier={b.symbol} size={30} />
                          <div
                            className="absolute -bottom-1 -right-1 rounded-full border-2 border-sprout-card overflow-hidden"
                            style={{ width: 14, height: 14 }}
                          >
                            <TokenIcon type="chain" identifier={b.chainId} size={14} />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-sprout-text-primary">
                            {b.symbol}
                          </p>
                          <p className="text-[11px] text-sprout-text-muted truncate">
                            {CHAIN_NAMES[b.chainId] ?? `Chain ${b.chainId}`}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-sprout-text-secondary shrink-0">
                          {b.balanceFormatted.toFixed(4)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Recipient */}
              <div className="mt-4">
                <p className="text-xs font-semibold text-sprout-text-muted uppercase tracking-wide mb-2">
                  Recipient address
                </p>
                <input
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="0x…"
                  spellCheck={false}
                  className="w-full bg-sprout-green-light/60 rounded-2xl px-4 py-3 text-sm font-mono text-sprout-text-primary placeholder:text-sprout-text-muted outline-none focus:ring-2 focus:ring-sprout-green-primary/40"
                />
                {recipient && !validRecipient && (
                  <p className="text-[11px] text-sprout-red-stop mt-1.5 px-1">
                    Not a valid 0x address.
                  </p>
                )}
              </div>

              {/* Amount */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-sprout-text-muted uppercase tracking-wide">
                    Amount
                  </p>
                  {selected && (
                    <button
                      type="button"
                      onClick={handleMax}
                      className="text-[11px] font-bold text-sprout-green-dark cursor-pointer"
                    >
                      MAX
                    </button>
                  )}
                </div>
                <div className="flex items-baseline gap-2 bg-sprout-green-light/60 rounded-2xl px-4 py-3">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 min-w-0 bg-transparent text-2xl font-heading font-bold text-sprout-text-primary outline-none placeholder:text-sprout-text-muted"
                  />
                  <span className="text-base font-semibold text-sprout-text-secondary shrink-0">
                    {selected?.symbol ?? ""}
                  </span>
                </div>
                {selected && amount && numeric > selected.balanceFormatted && (
                  <p className="text-[11px] text-sprout-red-stop mt-1.5 px-1">
                    Amount exceeds your {selected.symbol} balance.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                className="mt-6 w-full rounded-button py-3.5 text-base font-bold bg-gradient-to-br from-sprout-green-primary to-[#66BB6A] text-white shadow-glow transition-all duration-150 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Send {selected?.symbol ?? ""}
              </button>

              <p className="mt-3 text-[11px] text-sprout-text-muted text-center">
                Double-check the address — transactions can&apos;t be reversed.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Reuse the shared TransactionModal for confirming / success / error */}
      <TransactionModal
        status={modalStatus}
        intent="withdraw"
        txHash={txHash}
        chainId={selected?.chainId}
        errorMessage={errorMessage}
        onClose={handleFullClose}
        onRetry={() => setPhase("form")}
      />
    </>
  );
}
