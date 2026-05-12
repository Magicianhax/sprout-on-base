"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Copy,
  MinusCircle,
  Sprout,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ReceiveModal } from "@/components/portfolio/ReceiveModal";
import { SendModal } from "@/components/portfolio/SendModal";
import { WalletBalancesModal } from "@/components/portfolio/WalletBalancesModal";
import { useBalances } from "@/lib/hooks/useBalances";
import { priceFor, usePrices } from "@/lib/hooks/usePrices";
import { formatCurrency } from "@/lib/format";

function truncateAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

interface WalletActionBarProps {
  variant?: "full" | "compact";
  walletAddress: string;
  hasEarningPositions: boolean;
  /**
   * Total USD value of the user's earning positions, provided by the
   * parent page (via usePositions). Combined with the wallet-side
   * token USD to render a single "total value" figure in the card.
   */
  earningBalanceUsd?: number;
}

interface ActionButtonProps {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary";
}

function ActionButton({ label, icon, onClick, disabled, tone = "secondary" }: ActionButtonProps) {
  const isPrimary = tone === "primary";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center justify-center gap-1.5 flex-1 min-w-0 py-3 rounded-2xl transition-all active:scale-[0.97] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center shadow-subtle ${
          isPrimary
            ? "bg-gradient-to-br from-sprout-green-primary to-[#66BB6A] text-white"
            : "bg-sprout-green-light text-sprout-green-dark"
        }`}
      >
        {icon}
      </div>
      <span className="text-[11px] font-semibold text-sprout-text-primary">
        {label}
      </span>
    </button>
  );
}

export function WalletActionBar({
  variant = "full",
  walletAddress,
  hasEarningPositions,
  earningBalanceUsd = 0,
}: WalletActionBarProps) {
  const router = useRouter();
  const prices = usePrices();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [balancesOpen, setBalancesOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { balances } = useBalances(walletAddress);

  const sendable = useMemo(
    () => balances.filter((b) => b.balanceFormatted > 0),
    [balances]
  );

  // Sum the wallet-side tokens at their USD prices. Tokens without a
  // known price contribute 0 — accurate rather than inflating with a
  // fake number.
  const walletUsd = useMemo(
    () =>
      sendable.reduce(
        (sum, b) => sum + b.balanceFormatted * priceFor(prices, b.symbol),
        0
      ),
    [sendable, prices]
  );

  const totalUsd = earningBalanceUsd + walletUsd;

  if (!walletAddress) return null;

  async function copyAddress(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard unavailable
    }
  }

  function goWithdraw() {
    router.push("/portfolio#earning");
  }

  const actions = (
    <div className="flex items-stretch gap-1">
      <ActionButton
        label="Receive"
        icon={<ArrowDownToLine size={18} strokeWidth={2.25} />}
        onClick={() => setReceiveOpen(true)}
      />
      <ActionButton
        label="Send"
        icon={<ArrowUpFromLine size={18} strokeWidth={2.25} />}
        onClick={() => setSendOpen(true)}
      />
      <ActionButton
        label="Earn"
        tone="primary"
        icon={<Sprout size={18} strokeWidth={2.25} />}
        onClick={() => router.push("/deposit")}
      />
      <ActionButton
        label="Withdraw"
        icon={<MinusCircle size={18} strokeWidth={2.25} />}
        onClick={goWithdraw}
        disabled={!hasEarningPositions}
      />
    </div>
  );

  return (
    <>
      {variant === "compact" ? (
        <Card shadow="subtle" className="mx-5 !p-3">
          {actions}
        </Card>
      ) : (
        <Card shadow="subtle" className="mx-5 !p-4">
          <div className="flex items-start justify-between mb-4 px-1 gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-sprout-text-muted">
                Your wallet
              </p>
              <button
                type="button"
                onClick={copyAddress}
                className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-mono font-semibold text-sprout-text-primary cursor-pointer group"
                aria-label="Copy wallet address"
              >
                <span>{truncateAddress(walletAddress)}</span>
                {copied ? (
                  <Check
                    size={14}
                    strokeWidth={2.5}
                    className="text-sprout-green-dark"
                  />
                ) : (
                  <Copy
                    size={14}
                    strokeWidth={2.25}
                    className="text-sprout-text-muted group-hover:text-sprout-green-dark transition-colors"
                  />
                )}
              </button>
            </div>

            <div className="text-right shrink-0">
              <p className="font-heading text-2xl font-800 text-sprout-text-primary leading-none">
                {formatCurrency(totalUsd)}
              </p>
              <p className="text-[10px] text-sprout-text-muted mt-0.5">
                Total value
              </p>
              {earningBalanceUsd > 0 && (
                <p className="text-[11px] font-semibold text-sprout-green-dark mt-1">
                  {formatCurrency(earningBalanceUsd)} earning
                </p>
              )}
            </div>
          </div>

          {actions}

          {sendable.length > 0 && (
            <button
              type="button"
              onClick={() => setBalancesOpen(true)}
              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-sprout-green-dark cursor-pointer"
            >
              <Wallet size={13} strokeWidth={2.25} />
              View {sendable.length} token{sendable.length === 1 ? "" : "s"} in your wallet →
            </button>
          )}
        </Card>
      )}

      <ReceiveModal
        open={receiveOpen}
        walletAddress={walletAddress}
        onClose={() => setReceiveOpen(false)}
      />
      <SendModal
        open={sendOpen}
        walletAddress={walletAddress}
        balances={balances}
        onClose={() => setSendOpen(false)}
      />
      <WalletBalancesModal
        open={balancesOpen}
        onClose={() => setBalancesOpen(false)}
        balances={sendable}
      />
    </>
  );
}
