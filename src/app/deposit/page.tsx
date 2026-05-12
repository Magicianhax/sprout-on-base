"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePrivy } from "@/lib/wallet";
import { ArrowLeft } from "lucide-react";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TokenSelector, type TokenSelection } from "@/components/deposit/TokenSelector";
import { TransactionModal } from "@/components/deposit/TransactionModal";
import { RiskDisclaimerModal } from "@/components/deposit/RiskDisclaimerModal";
import {
  DEFAULT_SLIPPAGE,
  NATIVE_SYMBOL_BY_CHAIN,
  QUOTE_DEBOUNCE_MS,
  TOKEN_ADDRESSES,
  TOKEN_DECIMALS,
} from "@/lib/constants";
import { useBalances } from "@/lib/hooks/useBalances";
import { AmountInput } from "@/components/deposit/AmountInput";
import { DepositPreview } from "@/components/deposit/DepositPreview";
import { usePreferences } from "@/lib/hooks/usePreferences";
import { getRoutes, type Route } from "@lifi/sdk";
import { fetchVaults } from "@/lib/api/earn";
import { useDepositFlow } from "@/lib/hooks/useDepositFlow";
import {
  dailyEarnings,
  formatCurrency,
  monthlyEarnings,
  toTokenUnits,
} from "@/lib/format";
import { SUPPORTED_TOKENS, CHAIN_NAMES } from "@/lib/constants";
import type { Vault } from "@/lib/types";

// Minimal preview shape the UI reads. We pull these four fields from
// the first route returned by getRoutes (/v1/advanced/routes) —
// same endpoint the execution flow uses, so preview estimates
// always match what the deposit will actually do. We used to hit
// /v1/quote for this, but that endpoint is stricter and would 404
// on pairs /v1/advanced/routes routes fine, causing spooky
// "no quote" flashes that weren't real.
interface PreviewEstimate {
  fromAmountUSD?: string;
  toAmountUSD?: string;
  gasCosts: { amountUSD?: string; amount?: string }[];
}

function routeToPreview(route: Route): PreviewEstimate {
  // Sum gas across all steps — multi-step routes (bridge + deposit)
  // have gas on each leg. Take the aggregate for the UI's "Network
  // fee" and gas-sufficiency check. Each step.estimate.gasCosts[0]
  // is the SEND gas cost denominated in the step's source chain's
  // native token, so summing them only makes sense in USD; the
  // native-amount path uses step 0 specifically (source chain).
  const allGasCosts = route.steps.flatMap(
    (s) => s.estimate?.gasCosts ?? []
  );
  const totalGasUSD = allGasCosts.reduce((sum, g) => {
    const n = parseFloat(g.amountUSD ?? "0");
    return Number.isFinite(n) ? sum + n : sum;
  }, 0);
  const sourceGas = route.steps[0]?.estimate?.gasCosts?.[0];
  return {
    fromAmountUSD: route.fromAmountUSD,
    toAmountUSD: route.toAmountUSD,
    gasCosts: [
      {
        amountUSD: totalGasUSD > 0 ? totalGasUSD.toFixed(4) : "0",
        amount: sourceGas?.amount,
      },
    ],
  };
}

function isValidToken(symbol: string): boolean {
  return SUPPORTED_TOKENS.some((t) => t.symbol === symbol);
}

function getDefaultChainForToken(symbol: string, preferredChainId: number): number {
  const chains = Object.keys(TOKEN_ADDRESSES[symbol] ?? {}).map(Number);
  if (chains.includes(preferredChainId)) return preferredChainId;
  return chains[0] ?? preferredChainId;
}

function DepositPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = usePrivy();
  const { preferences, update: updatePreferences } = usePreferences();
  const [riskModalOpen, setRiskModalOpen] = useState(false);
  const depositFlow = useDepositFlow();

  const urlToken = searchParams.get("token");
  const urlVault = searchParams.get("vault");
  const urlChainId = searchParams.get("chainId");

  const initialSymbol =
    urlToken && isValidToken(urlToken)
      ? urlToken
      : preferences.preferredTokens[0] ?? "USDC";

  const [tokenSelection, setTokenSelection] = useState<TokenSelection>({
    symbol: initialSymbol,
    chainId: getDefaultChainForToken(initialSymbol, 8453),
  });
  const [amount, setAmount] = useState<string>("");
  const [vault, setVault] = useState<Vault | null>(null);
  const [quote, setQuote] = useState<{ estimate: PreviewEstimate } | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<"idle" | "quoting">("idle");
  const [quoteError, setQuoteError] = useState<string>("");

  const walletAddress = user?.wallet?.address ?? "";

  // Real wallet balances across all chains
  const { balances: walletBalances, loading: balancesLoading } = useBalances(
    walletAddress || undefined,
  );

  // Find balance for the currently selected token+chain (used by
  // the Pro token selector which explicitly picks one chain).
  const selectedTokenBalance =
    walletBalances.find(
      (b) => b.symbol === tokenSelection.symbol && b.chainId === tokenSelection.chainId,
    )?.balanceFormatted ?? 0;

  // Total balance for the selected token across EVERY supported
  // chain. Lite mode uses this so the user sees all their dollars
  // at once instead of being locked to whichever chain we auto-
  // picked. At deposit time the flow splits the requested amount
  // across chains (vault chain first, then by descending balance).
  const aggregatedTokenBalance = walletBalances
    .filter((b) => b.symbol === tokenSelection.symbol)
    .reduce((sum, b) => sum + b.balanceFormatted, 0);

  const isLite = preferences.mode === "lite";
  // Lite mode gates validation on the aggregated total because it
  // can plan a multi-chain deposit. Pro mode is locked to the chain
  // the user picked in the TokenSelector.
  const spendableBalance = isLite ? aggregatedTokenBalance : selectedTokenBalance;

  // Resolve vault: pro mode uses URL params, lite mode auto-fetches highest TVL
  useEffect(() => {
    if (urlVault && urlChainId) {
      // Specific vault requested — search by chainId only, find by address
      fetchVaults({ chainId: Number(urlChainId), sortBy: "tvl", limit: 100 })
        .then((res) => {
          const found = res.data.find(
            (v) => v.address.toLowerCase() === urlVault.toLowerCase()
          );
          setVault(found ?? null);
        })
        .catch(() => setVault(null));
    } else {
      // Lite / smart pick: fetch a candidate set of low-risk vaults
      // for this token and choose the one with the best APY that
      // still has meaningful TVL. Filters out risky vaults (IL risk,
      // leveraged, etc.) and obvious dust vaults.
      fetchVaults({
        chainId: tokenSelection.chainId,
        asset: tokenSelection.symbol,
        sortBy: "apy",
        limit: 20,
      })
        .then((res) =>
          res.data.length > 0
            ? res.data
            : // No candidate on the user's chain — widen to any chain
              fetchVaults({
                asset: tokenSelection.symbol,
                sortBy: "apy",
                limit: 20,
              }).then((res2) => res2.data)
        )
        .then((candidates: Vault[]) => {
          const MIN_TVL = 1_000_000; // $1M — don't pick dust vaults
          const safe = candidates.filter((v) => {
            const tags = v.tags ?? [];
            if (tags.includes("il-risk") || tags.includes("leveraged")) return false;
            const tvl = parseFloat(v.analytics.tvl.usd || "0");
            return tvl >= MIN_TVL;
          });
          const pick = (safe.length > 0 ? safe : candidates)[0];
          setVault(pick ?? null);
        })
        .catch(() => setVault(null));
    }
  }, [tokenSelection.symbol, tokenSelection.chainId, urlVault, urlChainId]);

  // When a new vault resolves, pick the best source chain based on
  // where the user actually holds the selected token. LI.FI Composer
  // handles the cross-chain bridging, so we'd rather pull from the
  // chain that has the funds than dump the user on the vault's chain
  // with an empty balance. Only runs once per (vault, token) pair —
  // tracked via a ref so user manual chain changes from TokenSelector
  // stick without being overwritten when balances refetch.
  const autoSelectedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!vault) return;
    if (balancesLoading) return;

    const key = `${vault.chainId}-${vault.address}-${tokenSelection.symbol}`;
    if (autoSelectedKey.current === key) return;
    autoSelectedKey.current = key;

    const symbol = tokenSelection.symbol;
    const candidates = walletBalances.filter(
      (b) => b.symbol === symbol && b.balanceFormatted > 0
    );

    let bestChainId: number;
    if (candidates.length === 0) {
      // No balance anywhere — fall back to the vault's own chain so
      // the token selector at least points at something sensible.
      bestChainId = getDefaultChainForToken(symbol, vault.chainId);
    } else {
      // Prefer the vault's own chain when there's any balance there
      // (saves the user a bridge). Otherwise pick the chain with the
      // largest balance.
      const onVaultChain = candidates.find((b) => b.chainId === vault.chainId);
      if (onVaultChain) {
        bestChainId = vault.chainId;
      } else {
        const sorted = [...candidates].sort(
          (a, b) => b.balanceFormatted - a.balanceFormatted
        );
        bestChainId = sorted[0].chainId;
      }
    }

    // Safety: ensure the token is actually configured on this chain.
    if (!TOKEN_ADDRESSES[symbol]?.[bestChainId]) {
      bestChainId = getDefaultChainForToken(symbol, vault.chainId);
    }

    setTokenSelection((prev) =>
      prev.chainId === bestChainId ? prev : { ...prev, chainId: bestChainId }
    );
  }, [vault, walletBalances, balancesLoading, tokenSelection.symbol]);

  // Fetch quote whenever amount, vault, or token selection changes
  const fetchQuote = useCallback(async () => {
    const numericAmount = parseFloat(amount);
    if (!vault || !walletAddress || isNaN(numericAmount) || numericAmount <= 0) {
      setQuote(null);
      setQuoteError("");
      return;
    }
    // Skip quote if the user is asking for more than they have. Shows
    // the inline error instead of burning an API call that will later
    // fail on-chain anyway.
    if (!balancesLoading && numericAmount > selectedTokenBalance) {
      setQuote(null);
      setQuoteError("");
      setQuoteStatus("idle");
      return;
    }

    const decimals = TOKEN_DECIMALS[tokenSelection.symbol] ?? 18;
    const fromAmount = toTokenUnits(numericAmount, decimals);
    const fromTokenAddress =
      TOKEN_ADDRESSES[tokenSelection.symbol]?.[tokenSelection.chainId];

    if (!fromTokenAddress) {
      setQuoteError(
        `${tokenSelection.symbol} not available on ${
          CHAIN_NAMES[tokenSelection.chainId] ?? tokenSelection.chainId
        }`
      );
      setQuote(null);
      return;
    }

    // Preview quote mirrors the execution flow — LI.FI Composer
    // bundles bridge + swap + vault deposit into one route when
    // we pass the vault address as toToken. Same-chain same-
    // underlying is still worth quoting because Composer returns
    // the actual deposit tx (with FeeForwarder attribution) and
    // the preview needs the estimate to show gas costs.
    const underlyingAddress = vault.underlyingTokens[0]?.address;
    if (!underlyingAddress) {
      setQuote(null);
      setQuoteStatus("idle");
      return;
    }

    setQuoteStatus("quoting");
    setQuoteError("");

    try {
      // Preview hits the EXACT same endpoint as the execution flow —
      // /v1/advanced/routes via the SDK. We used to call /v1/quote
      // here (it's a simpler endpoint that returns one bundled
      // transaction) but it bails on pairs that advanced/routes
      // handles fine, so the UI would flash "no route" for deposits
      // that actually work. Using the same endpoint as execution
      // guarantees preview and reality agree.
      const response = await getRoutes({
        fromChainId: tokenSelection.chainId,
        fromTokenAddress: fromTokenAddress,
        fromAmount,
        toChainId: vault.chainId,
        toTokenAddress: vault.address,
        fromAddress: walletAddress,
        toAddress: walletAddress,
        options: { slippage: DEFAULT_SLIPPAGE },
      });
      const best = response.routes?.[0];
      if (best) {
        setQuote({ estimate: routeToPreview(best) });
      } else {
        setQuote(null);
      }
      setQuoteStatus("idle");
    } catch {
      // Preview failed — not fatal, depositFlow handles execution.
      setQuote(null);
      setQuoteStatus("idle");
    }
  }, [amount, vault, walletAddress, tokenSelection, balancesLoading, selectedTokenBalance]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchQuote();
    }, QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [fetchQuote]);

  // Gate the first-ever deposit on a smart-contract-risk acknowledgement.
  // After the user accepts once, the flag persists in preferences and
  // every subsequent deposit goes straight through.
  function handlePrimaryAction() {
    if (!preferences.riskAcknowledged) {
      setRiskModalOpen(true);
      return;
    }
    void handleConfirm();
  }

  function handleAcknowledgeRisk() {
    updatePreferences({ riskAcknowledged: true });
    setRiskModalOpen(false);
    void handleConfirm();
  }

  async function handleConfirm() {
    if (!vault || !walletAddress) return;

    const symbol = tokenSelection.symbol;
    const decimals = TOKEN_DECIMALS[symbol] ?? 18;

    // Lite mode taps every chain that holds the selected token.
    // Pro mode is locked to whatever chain the user picked in the
    // TokenSelector. Both paths feed the same multi-source
    // depositFlow.start().
    const eligible = walletBalances
      .filter((b) => b.symbol === symbol && b.balanceFormatted > 0)
      .filter((b) => !!TOKEN_ADDRESSES[symbol]?.[b.chainId])
      .sort((a, b) => {
        if (a.chainId === vault.chainId && b.chainId !== vault.chainId) return -1;
        if (b.chainId === vault.chainId && a.chainId !== vault.chainId) return 1;
        return b.balanceFormatted - a.balanceFormatted;
      });

    const sourcePool = isLite
      ? eligible
      : eligible.filter((b) => b.chainId === tokenSelection.chainId);

    if (sourcePool.length === 0) return;

    // Greedy allocator: walk chains in priority order and pull from
    // each until the requested amount is covered. We work in raw
    // base units throughout to avoid float drift.
    const requestedRaw = BigInt(toTokenUnits(numericAmount, decimals));
    let remaining = requestedRaw;
    const sources: {
      chainId: number;
      tokenAddress: string;
      tokenSymbol: string;
      amountRaw: string;
    }[] = [];

    for (const balance of sourcePool) {
      if (remaining <= BigInt(0)) break;
      const tokenAddress = TOKEN_ADDRESSES[symbol]?.[balance.chainId];
      if (!tokenAddress) continue;
      const availableRaw = BigInt(
        toTokenUnits(balance.balanceFormatted, decimals)
      );
      const take = availableRaw < remaining ? availableRaw : remaining;
      if (take <= BigInt(0)) continue;
      sources.push({
        chainId: balance.chainId,
        tokenAddress,
        tokenSymbol: symbol,
        amountRaw: take.toString(),
      });
      remaining -= take;
    }

    if (sources.length === 0) return;

    depositFlow.start({ sources, vault });
  }

  const numericAmount = parseFloat(amount);
  const validAmount = !isNaN(numericAmount) && numericAmount > 0;
  // Only treat as "too much" once we actually know the balance
  // (avoids flashing an error during the initial load). Lite mode
  // gates on the aggregated total across chains; Pro mode stays
  // locked to whichever single chain the user picked.
  const insufficientBalance =
    validAmount && !balancesLoading && numericAmount > spendableBalance;
  const isExecuting =
    depositFlow.state.phase === "quoting" ||
    depositFlow.state.phase === "executing";
  // We no longer gate on `quote` being present — depositFlow can run
  // the real LI.FI route even if our lightweight preview quote 404s.
  const canSubmit =
    validAmount &&
    !insufficientBalance &&
    !!vault &&
    quoteStatus !== "quoting" &&
    !isExecuting;
  const apy = vault?.analytics.apy.total ?? 0;
  const networkFeeUsd = quote
    ? parseFloat(quote.estimate.gasCosts[0]?.amountUSD ?? "0")
    : 0;
  const isCrossChain = vault !== null && tokenSelection.chainId !== vault.chainId;

  // Gas sufficiency check — look up the user's native balance on the
  // source chain and compare to the estimated gas cost (plus 10% for
  // spikes). If the deposit token IS the native token we deduct the
  // deposit amount first so max-out flows don't silently underpay.
  const nativeSymbol = NATIVE_SYMBOL_BY_CHAIN[tokenSelection.chainId] ?? "ETH";
  const nativeBalance =
    walletBalances.find(
      (b) => b.chainId === tokenSelection.chainId && b.symbol === nativeSymbol
    )?.balanceFormatted ?? 0;
  const gasCostNativeRaw = quote?.estimate.gasCosts[0]?.amount ?? "0";
  const gasCostNative = gasCostNativeRaw
    ? Number(gasCostNativeRaw) / 1e18
    : 0;
  const depositsNative = tokenSelection.symbol === nativeSymbol;
  const nativeAfterDeposit = depositsNative
    ? nativeBalance - (validAmount ? numericAmount : 0)
    : nativeBalance;
  const insufficientGas =
    !!quote &&
    gasCostNative > 0 &&
    nativeAfterDeposit < gasCostNative * 1.1 &&
    !insufficientBalance;
  const canSubmitWithGas = canSubmit && !insufficientGas;

  // Modal state is now owned entirely by useDepositFlow — phase/steps
  // drive the confirming/success/error view.
  const modalStatus = depositFlow.modalStatus;

  return (
    <main className="flex flex-col min-h-dvh bg-sprout-gradient">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-3">
        <button
          onClick={() => router.back()}
          className="p-1 -ml-1 cursor-pointer text-sprout-text-secondary"
          aria-label="Go back"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="font-heading text-xl font-bold text-sprout-text-primary">Start Earning</h1>
      </div>

      {isLite ? (
        /* ───── LITE MODE: ultra-simple ───── */
        <>
          <div className="flex flex-col gap-8 px-5 pt-10 pb-10 flex-1">
            <div className="text-center">
              <h2 className="font-heading text-lg font-700 text-sprout-text-primary mb-1">
                How much do you want to earn on?
              </h2>
              <p className="text-sm text-sprout-text-muted">
                {aggregatedTokenBalance > 0
                  ? `You have ${aggregatedTokenBalance.toFixed(2)} ${tokenSelection.symbol}`
                  : balancesLoading
                  ? "Checking balance..."
                  : "Enter any amount"}
              </p>
            </div>

            <AmountInput
              value={amount}
              onChange={setAmount}
              balance={aggregatedTokenBalance}
              symbol={tokenSelection.symbol}
              balanceLoading={balancesLoading}
            />

            <div className="flex items-center gap-2 px-2">
              {[0.25, 0.5, 0.75, 1].map((pct) => {
                const disabled = aggregatedTokenBalance <= 0;
                return (
                  <button
                    key={pct}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (aggregatedTokenBalance <= 0) return;
                      // MAX uses the exact aggregated balance; lower
                      // percents floor-round so they can never exceed
                      // what the user actually holds across chains.
                      const raw =
                        pct === 1
                          ? aggregatedTokenBalance
                          : Math.floor(aggregatedTokenBalance * pct * 1_000_000) /
                            1_000_000;
                      setAmount(String(raw));
                    }}
                    className="flex-1 py-2.5 rounded-pill text-xs font-bold bg-sprout-green-primary text-white shadow-subtle cursor-pointer active:scale-[0.97] transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {pct === 1 ? "MAX" : `${pct * 100}%`}
                  </button>
                );
              })}
            </div>

            {insufficientBalance && (
              <p className="text-center text-xs text-sprout-red-stop font-semibold">
                You only have {aggregatedTokenBalance.toFixed(4)} {tokenSelection.symbol}
              </p>
            )}
            {!insufficientBalance && insufficientGas && (
              <p className="text-center text-xs text-sprout-red-stop font-semibold">
                Need ~{gasCostNative.toFixed(6)} {nativeSymbol} for gas. Receive some {nativeSymbol} to continue.
              </p>
            )}
            {!insufficientBalance && !insufficientGas && quoteStatus === "quoting" && validAmount && (
              <p className="text-center text-xs text-sprout-text-muted animate-pulse">Finding best rate...</p>
            )}
            {!insufficientBalance && !insufficientGas && quoteError && (
              <p className="text-center text-xs text-red-500">{quoteError}</p>
            )}

            {/* Earnings projection — only when we have a valid amount
                and a resolved vault. Keeps the Lite flow celebratory:
                the user sees what the number turns into before they
                tap Start Earning. */}
            {!insufficientBalance &&
              !insufficientGas &&
              !quoteError &&
              validAmount &&
              vault &&
              apy > 0 && (
                <div className="mx-2 bg-sprout-green-light/50 rounded-2xl px-5 py-4">
                  <p className="text-center text-[11px] font-bold uppercase tracking-wider text-sprout-green-dark">
                    You&apos;ll earn about
                  </p>
                  <p className="text-center font-heading text-2xl font-800 text-sprout-text-primary mt-1">
                    {formatCurrency(numericAmount * (apy / 100))}
                  </p>
                  <p className="text-center text-[11px] text-sprout-text-muted mt-0.5">
                    per year at {apy.toFixed(1)}%
                  </p>
                  <div className="flex items-center justify-around mt-3 pt-3 border-t border-sprout-border">
                    <div className="text-center">
                      <p className="text-[10px] text-sprout-text-muted">per day</p>
                      <p className="text-sm font-bold text-sprout-text-primary mt-0.5">
                        {formatCurrency(dailyEarnings(numericAmount, apy))}
                      </p>
                    </div>
                    <div className="w-px h-8 bg-sprout-border" />
                    <div className="text-center">
                      <p className="text-[10px] text-sprout-text-muted">per month</p>
                      <p className="text-sm font-bold text-sprout-text-primary mt-0.5">
                        {formatCurrency(monthlyEarnings(numericAmount, apy))}
                      </p>
                    </div>
                  </div>
                </div>
              )}
          </div>

          <div className="px-5 pb-8 pt-2 bg-sprout-gradient">
            <Button
              className="w-full"
              disabled={!canSubmitWithGas}
              loading={quoteStatus === "quoting" || isExecuting}
              onClick={handlePrimaryAction}
            >
              {insufficientBalance
                ? "Insufficient balance"
                : insufficientGas
                ? `Need ${nativeSymbol} for gas`
                : quoteStatus === "quoting"
                ? "Finding best rate..."
                : isExecuting
                ? "Confirming..."
                : "Start Earning"}
            </Button>
            <p className="text-center text-[11px] text-sprout-text-muted mt-4">Powered by LI.FI</p>
          </div>
        </>
      ) : (
        /* ───── PRO MODE: full details ───── */
        <>
          <div className="flex flex-col gap-5 px-5 pb-10 flex-1 overflow-y-auto">
            <Card>
              <p className="text-xs font-semibold text-sprout-text-secondary uppercase tracking-wide mb-3">
                Select Token
              </p>
              <TokenSelector
                selected={tokenSelection}
                vaultChainId={vault?.chainId ?? 8453}
                onChange={setTokenSelection}
                balances={walletBalances}
                balancesLoading={balancesLoading}
              />
            </Card>

            {isCrossChain && vault && (
              <div className="bg-blue-50 rounded-2xl px-4 py-3 text-xs text-blue-700 leading-relaxed">
                <p className="font-semibold mb-0.5">
                  Cross-chain deposit
                </p>
                <p>
                  Your {tokenSelection.symbol} on{" "}
                  <span className="font-semibold">
                    {CHAIN_NAMES[tokenSelection.chainId] ?? tokenSelection.chainId}
                  </span>{" "}
                  will be bridged to{" "}
                  <span className="font-semibold">
                    {CHAIN_NAMES[vault.chainId] ?? vault.chainId}
                  </span>{" "}
                  and deposited into the vault in one transaction via LI.FI.
                  You&apos;ll see a chain switch in your wallet.
                </p>
              </div>
            )}

            <Card>
              <p className="text-xs font-semibold text-sprout-text-secondary uppercase tracking-wide mb-3">
                Amount
              </p>
              <AmountInput
                value={amount}
                onChange={setAmount}
                balance={selectedTokenBalance}
                symbol={tokenSelection.symbol}
                balanceLoading={balancesLoading}
              />
              {selectedTokenBalance > 0 && (
                <div className="flex items-center gap-2 mt-3">
                  {[0.25, 0.5, 0.75, 1].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() =>
                        setAmount(
                          String(
                            // Trim to 6 decimal places to match AmountInput
                            Number((selectedTokenBalance * pct).toFixed(6))
                          )
                        )
                      }
                      className="flex-1 py-1.5 rounded-pill text-[11px] font-bold bg-sprout-green-light text-sprout-green-dark cursor-pointer active:scale-[0.97] transition-transform"
                    >
                      {pct === 1 ? "MAX" : `${pct * 100}%`}
                    </button>
                  ))}
                </div>
              )}
            </Card>

            {insufficientBalance && (
              <div className="bg-red-50 rounded-2xl px-4 py-3 text-sm text-red-600">
                You only have {selectedTokenBalance.toFixed(4)} {tokenSelection.symbol} on{" "}
                {CHAIN_NAMES[tokenSelection.chainId] ?? tokenSelection.chainId}.
              </div>
            )}
            {!insufficientBalance && insufficientGas && (
              <div className="bg-amber-50 rounded-2xl px-4 py-3 text-sm text-amber-800">
                You need about {gasCostNative.toFixed(6)} {nativeSymbol} on{" "}
                {CHAIN_NAMES[tokenSelection.chainId] ?? tokenSelection.chainId}{" "}
                to pay for gas. Receive some {nativeSymbol} first.
              </div>
            )}
            {!insufficientBalance && !insufficientGas && validAmount && vault && (
              <>
                {quoteStatus === "quoting" ? (
                  <div className="text-center py-4 text-sm text-sprout-text-muted animate-pulse">
                    Fetching best rate…
                  </div>
                ) : quoteError ? (
                  <div className="bg-red-50 rounded-2xl px-4 py-3 text-sm text-red-600">
                    {quoteError}
                  </div>
                ) : (
                  <DepositPreview
                    amount={numericAmount}
                    apyPercent={apy}
                    networkFeeUsd={networkFeeUsd}
                    maxSlippagePercent={DEFAULT_SLIPPAGE * 100}
                    priceImpactUsd={
                      quote?.estimate.fromAmountUSD && quote.estimate.toAmountUSD
                        ? parseFloat(quote.estimate.fromAmountUSD) -
                          parseFloat(quote.estimate.toAmountUSD)
                        : undefined
                    }
                  />
                )}
              </>
            )}

            {vault && (
              <Card shadow="subtle" className="!p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-sprout-text-secondary font-medium">{vault.protocol.name}</span>
                  <span className="text-sprout-text-secondary font-medium">{CHAIN_NAMES[vault.chainId] ?? `Chain ${vault.chainId}`}</span>
                </div>
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="text-sprout-green-dark font-semibold">{vault.analytics.apy.total.toFixed(1)}% yearly</span>
                  <span className="text-sprout-text-muted">{vault.underlyingTokens[0]?.symbol} vault</span>
                </div>
              </Card>
            )}
          </div>

          <div className="px-5 pb-8 pt-2 bg-sprout-gradient">
            <Button
              className="w-full"
              disabled={!canSubmitWithGas}
              loading={isExecuting}
              onClick={handlePrimaryAction}
            >
              {insufficientBalance
                ? "Insufficient balance"
                : insufficientGas
                ? `Need ${nativeSymbol} for gas`
                : isExecuting
                ? "Confirming…"
                : "Confirm"}
            </Button>
            <p className="text-center text-[11px] text-sprout-text-muted mt-4">Powered by LI.FI</p>
          </div>
        </>
      )}

      <RiskDisclaimerModal
        open={riskModalOpen}
        onAccept={handleAcknowledgeRisk}
        onClose={() => setRiskModalOpen(false)}
      />

      <TransactionModal
        status={modalStatus}
        txHash={depositFlow.state.finalTxHash}
        chainId={depositFlow.state.finalChainId ?? vault?.chainId}
        errorMessage={depositFlow.state.errorMessage}
        steps={depositFlow.state.steps}
        onClose={() => {
          depositFlow.close();
          if (modalStatus === "success") router.replace("/home");
        }}
        onRetry={depositFlow.retry}
      />
    </main>
  );
}

export default function DepositPage() {
  return (
    <AuthGuard>
      <DepositPageContent />
    </AuthGuard>
  );
}
