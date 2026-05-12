"use client";

interface AmountInputProps {
  value: string;
  onChange: (value: string) => void;
  balance: number;
  symbol: string;
  balanceLoading?: boolean;
}

export function AmountInput({
  value,
  onChange,
  balance,
  symbol,
  balanceLoading = false,
}: AmountInputProps) {
  function handleMax() {
    if (balance > 0) onChange(balance.toString());
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (raw === "" || /^\d*\.?\d*$/.test(raw)) {
      onChange(raw);
    }
  }

  const formattedBalance = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(balance);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-baseline justify-center w-full py-3">
        <span className="text-3xl font-bold text-sprout-text-secondary select-none">$</span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={handleChange}
          placeholder="0.00"
          className="text-4xl font-bold text-sprout-text-primary bg-transparent outline-none placeholder:text-sprout-text-muted"
          style={{ width: `${Math.max((value || "0.00").length, 4) * 0.65}em` }}
        />
      </div>

      {/* Balance row — hide only while still loading and balance is 0 */}
      {!balanceLoading && (
        <div className="flex items-center gap-2 min-h-[24px]">
          {balance > 0 ? (
            <>
              <span className="text-sm text-sprout-text-secondary">
                Balance: {formattedBalance} {symbol}
              </span>
              <button
                onClick={handleMax}
                className="text-xs font-bold text-sprout-green-dark bg-sprout-green-light px-2 py-0.5 rounded-full cursor-pointer"
              >
                MAX
              </button>
            </>
          ) : (
            <span className="text-sm text-sprout-text-muted">No {symbol} balance</span>
          )}
        </div>
      )}

      {balanceLoading && (
        <div className="min-h-[24px] flex items-center">
          <span className="text-sm text-sprout-text-muted animate-pulse">
            Loading balance…
          </span>
        </div>
      )}
    </div>
  );
}
