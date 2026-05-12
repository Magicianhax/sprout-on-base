"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, X } from "lucide-react";

interface ReceiveModalProps {
  open: boolean;
  walletAddress: string;
  onClose: () => void;
}

export function ReceiveModal({ open, walletAddress, onClose }: ReceiveModalProps) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  async function handleCopy() {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <>
      <style>{`
        @keyframes receive-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes receive-slide-up {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .receive-backdrop { animation: receive-fade-in 0.22s ease-out both; }
        .receive-card { animation: receive-slide-up 0.3s ease-out both; }
      `}</style>

      <div
        className="fixed inset-0 z-50 flex items-center justify-center px-5 bg-black/50 backdrop-blur-sm receive-backdrop"
        aria-modal="true"
        role="dialog"
        onClick={onClose}
      >
        <div
          className="bg-sprout-card rounded-3xl shadow-2xl w-full max-w-[380px] p-7 receive-card relative"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 p-1 rounded-full text-sprout-text-muted hover:text-sprout-text-primary transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>

          <div className="text-center">
            <h2 className="font-heading text-xl font-800 text-sprout-text-primary">
              Receive
            </h2>
            <p className="text-xs text-sprout-text-muted mt-1">
              Send tokens to this address from any wallet or exchange
            </p>
          </div>

          {/* QR code — white card behind for scan contrast */}
          <div className="mt-5 flex justify-center">
            <div className="bg-white rounded-2xl p-4 shadow-subtle">
              <QRCodeSVG
                value={walletAddress}
                size={200}
                level="M"
                includeMargin={false}
                bgColor="#FFFFFF"
                fgColor="#0F172A"
              />
            </div>
          </div>

          {/* Address + copy */}
          <div className="mt-5 rounded-2xl bg-sprout-green-light/60 px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-sprout-green-dark mb-1.5">
              Your address
            </p>
            <p className="font-mono text-[11px] text-sprout-text-primary break-all leading-snug">
              {walletAddress}
            </p>
          </div>

          <button
            onClick={handleCopy}
            className="mt-4 w-full rounded-button py-3 text-sm font-bold bg-gradient-to-br from-sprout-green-primary to-[#66BB6A] text-white shadow-glow transition-all duration-150 active:scale-[0.97] cursor-pointer inline-flex items-center justify-center gap-2"
          >
            {copied ? (
              <>
                <Check size={16} strokeWidth={2.5} />
                Copied
              </>
            ) : (
              <>
                <Copy size={16} strokeWidth={2.5} />
                Copy address
              </>
            )}
          </button>

          <p className="mt-4 text-[11px] text-sprout-text-muted text-center leading-relaxed">
            Only send tokens on <span className="font-semibold">Ethereum, Base, Arbitrum, Optimism, or Polygon</span>.
            <br />
            Tokens sent on other networks may be lost.
          </p>
        </div>
      </div>
    </>
  );
}
