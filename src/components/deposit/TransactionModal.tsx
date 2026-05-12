"use client";

import { SproutLogo } from "@/components/ui/SproutLogo";

const EXPLORER_TX_URLS: Record<number, string> = {
  1: "https://etherscan.io/tx/",
  8453: "https://basescan.org/tx/",
  42161: "https://arbiscan.io/tx/",
  10: "https://optimistic.etherscan.io/tx/",
  137: "https://polygonscan.com/tx/",
};

export interface TransactionStepView {
  id: string;
  label: string;
  chainId?: number;
  status: "pending" | "active" | "done" | "failed";
  txHash?: string;
  txLink?: string;
}

export interface TransactionModalProps {
  status: "confirming" | "success" | "error" | null;
  intent?: "deposit" | "withdraw";
  txHash?: string;
  chainId?: number;
  errorMessage?: string;
  /** Multi-step progress list (LI.FI route execution). */
  steps?: TransactionStepView[];
  onClose: () => void;
  onRetry: () => void;
}

const COPY = {
  deposit: {
    confirmingTitle: "Confirming your deposit…",
    confirmingBody: "Please approve in your wallet",
    successTitle: "Your money is growing!",
    closeLabel: "Back to Home",
  },
  withdraw: {
    confirmingTitle: "Confirming your withdrawal…",
    confirmingBody: "Please approve in your wallet",
    successTitle: "Withdrawal complete 🎉",
    closeLabel: "Back to Portfolio",
  },
} as const;

export function TransactionModal({
  status,
  intent = "deposit",
  txHash,
  chainId,
  errorMessage,
  steps,
  onClose,
  onRetry,
}: TransactionModalProps) {
  if (!status) return null;
  const copy = COPY[intent];

  const explorerBase = chainId ? (EXPLORER_TX_URLS[chainId] ?? null) : null;
  const explorerUrl = explorerBase && txHash ? `${explorerBase}${txHash}` : null;

  // Render the step list whenever a caller provides one — the
  // deposit flow always has 2–3 steps (approve + deposit, plus an
  // optional bridge).
  const showSteps = Array.isArray(steps) && steps.length >= 1;

  return (
    <>
      <style>{`
        @keyframes sprout-breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.12); }
        }
        @keyframes check-bounce-in {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.22); opacity: 1; }
          80% { transform: scale(0.92); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes dot-pulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
        @keyframes backdrop-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modal-slide-up {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .sprout-breathe {
          animation: sprout-breathe 2s ease-in-out infinite;
          display: inline-block;
        }
        .check-bounce-in {
          animation: check-bounce-in 0.45s cubic-bezier(0.22, 0.61, 0.36, 1) both;
        }
        .dot-1 { animation: dot-pulse 1.4s ease-in-out infinite; animation-delay: 0s; }
        .dot-2 { animation: dot-pulse 1.4s ease-in-out infinite; animation-delay: 0.22s; }
        .dot-3 { animation: dot-pulse 1.4s ease-in-out infinite; animation-delay: 0.44s; }
        .backdrop-fade-in {
          animation: backdrop-fade-in 0.25s ease-out both;
        }
        .modal-slide-up {
          animation: modal-slide-up 0.32s ease-out both;
        }
      `}</style>

      {/* Backdrop — z-[65] sits above BottomNav (50), InstallPrompt
          (55), and the other modal sheets (60) so nothing can ever
          paint over this status dialog during an in-flight tx. */}
      <div
        className="fixed inset-0 z-[65] flex items-center justify-center px-5 bg-black/40 backdrop-blur-sm backdrop-fade-in"
        aria-modal="true"
        role="dialog"
      >
        {/* Modal card */}
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-[340px] min-h-[380px] px-7 py-9 flex flex-col items-center justify-center text-center modal-slide-up">

          {/* ── CONFIRMING ─────────────────────────────────── */}
          {status === "confirming" && (
            <>
              {/* Sprout icon — breathing animation */}
              <SproutLogo
                size={80}
                decorative
                className="mb-6 sprout-breathe rounded-[20px]"
              />

              <h2 className="font-heading text-xl font-bold text-sprout-text-primary mb-2">
                {copy.confirmingTitle}
              </h2>

              {showSteps ? (
                <StepList steps={steps!} />
              ) : (
                <>
                  <p className="text-sm text-sprout-text-muted mb-6">
                    {copy.confirmingBody}
                  </p>
                  <div className="flex items-center gap-2 mb-6" aria-label="Loading">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 dot-1" />
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 dot-2" />
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 dot-3" />
                  </div>
                </>
              )}

              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-sprout-text-secondary hover:text-sprout-text-primary transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </>
          )}

          {/* ── SUCCESS ────────────────────────────────────── */}
          {status === "success" && (
            <>
              {/* Bounce-in check */}
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6">
                <svg
                  className="w-10 h-10 text-green-600 check-bounce-in"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>

              <h2 className="font-heading text-xl font-bold text-sprout-text-primary mb-1">
                {copy.successTitle}
              </h2>

              {explorerUrl && (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-green-700 font-medium underline underline-offset-2 mt-3 mb-1 inline-flex items-center gap-1 hover:text-green-900 transition-colors"
                >
                  View on explorer&nbsp;↗
                </a>
              )}

              <button
                onClick={onClose}
                className="mt-6 w-full rounded-button px-6 py-4 text-base font-bold bg-gradient-to-br from-sprout-green-primary to-[#66BB6A] text-white shadow-glow transition-all duration-150 active:scale-[0.97] cursor-pointer"
              >
                {copy.closeLabel}
              </button>

              <p className="mt-5 text-[11px] text-sprout-text-muted">Powered by LI.FI</p>
            </>
          )}

          {/* ── ERROR ──────────────────────────────────────── */}
          {status === "error" && (
            <>
              {/* Red X icon */}
              <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center mb-6">
                <svg
                  className="w-10 h-10 text-red-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </div>

              <h2 className="font-heading text-xl font-bold text-sprout-text-primary mb-2">
                Something went wrong
              </h2>

              {errorMessage && (
                <p className="text-sm text-red-500 mb-2 leading-relaxed max-w-[260px]">
                  {errorMessage}
                </p>
              )}

              <div className="mt-5 w-full flex flex-col gap-2">
                <button
                  onClick={onRetry}
                  className="w-full rounded-button px-6 py-4 text-base font-bold bg-gradient-to-br from-sprout-green-primary to-[#66BB6A] text-white shadow-glow transition-all duration-150 active:scale-[0.97] cursor-pointer"
                >
                  Try Again
                </button>
                <button
                  onClick={onClose}
                  className="w-full px-6 py-3 text-sm font-semibold text-sprout-text-secondary hover:text-sprout-text-primary transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </>
  );
}

function StepList({ steps }: { steps: TransactionStepView[] }) {
  return (
    <ol className="w-full flex flex-col gap-2 mb-6 text-left">
      {steps.map((step) => {
        const explorerBase = step.chainId
          ? EXPLORER_TX_URLS[step.chainId] ?? null
          : null;
        const explorerUrl =
          step.txLink ??
          (explorerBase && step.txHash ? `${explorerBase}${step.txHash}` : null);

        return (
          <li
            key={step.id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-green-50/60"
          >
            <StepStatusIcon status={step.status} />
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm font-semibold truncate ${
                  step.status === "done"
                    ? "text-green-800"
                    : step.status === "failed"
                    ? "text-red-600"
                    : "text-sprout-text-primary"
                }`}
              >
                {step.label}
              </p>
              {explorerUrl && (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-green-700 underline underline-offset-2 hover:text-green-900"
                >
                  View tx ↗
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StepStatusIcon({ status }: { status: TransactionStepView["status"] }) {
  if (status === "done") {
    return (
      <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shrink-0">
        <svg
          className="w-4 h-4 text-white"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center shrink-0">
        <svg
          className="w-3.5 h-3.5 text-white"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </div>
    );
  }
  if (status === "active") {
    return (
      <div className="w-6 h-6 rounded-full border-2 border-green-500 flex items-center justify-center shrink-0">
        <span className="w-2 h-2 rounded-full bg-green-500 sprout-breathe" />
      </div>
    );
  }
  return (
    <div className="w-6 h-6 rounded-full border-2 border-sprout-border shrink-0" />
  );
}
