"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { TokenIcon } from "@/components/ui/TokenIcon";

interface TokenFilterDropdownProps {
  available: string[];
  selected: string[];
  onChange: (tokens: string[]) => void;
}

export function TokenFilterDropdown({
  available,
  selected,
  onChange,
}: TokenFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selected);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(selected);
  }, [selected]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setDraft(selected);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, selected]);

  const sortedTokens = useMemo(
    () => [...available].sort((a, b) => a.localeCompare(b)),
    [available]
  );

  function toggle(symbol: string) {
    setDraft((prev) =>
      prev.includes(symbol)
        ? prev.filter((s) => s !== symbol)
        : [...prev, symbol]
    );
  }

  function handleApply() {
    onChange(draft);
    setOpen(false);
  }

  function handleClear() {
    setDraft([]);
  }

  const triggerLabel =
    draft.length === 0
      ? "All Tokens"
      : draft.length === 1
      ? draft[0]
      : `${draft.length} tokens`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={available.length === 0}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-sprout-card border border-sprout-border rounded-pill text-sm font-semibold text-sprout-text-primary shadow-subtle cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="truncate max-w-[120px]">{triggerLabel}</span>
        <ChevronDown
          size={14}
          className={`text-sprout-text-muted transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 bg-sprout-card border border-sprout-border rounded-2xl shadow-card p-3 min-w-[200px] max-h-[360px] overflow-y-auto z-50">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-sprout-text-muted">
              Tokens
            </span>
            {draft.length > 0 && (
              <button
                onClick={handleClear}
                className="text-[11px] font-semibold text-sprout-green-dark cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1 mb-3">
            {sortedTokens.map((symbol) => {
              const checked = draft.includes(symbol);
              return (
                <label
                  key={symbol}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-sprout-green-light cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(symbol)}
                    className="accent-sprout-green-primary w-4 h-4 cursor-pointer"
                  />
                  <TokenIcon type="token" identifier={symbol} size={20} />
                  <span className="text-sm text-sprout-text-primary truncate">
                    {symbol}
                  </span>
                </label>
              );
            })}
          </div>

          <button
            onClick={handleApply}
            className="w-full bg-sprout-green-primary text-white rounded-button py-2 text-sm font-bold cursor-pointer"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
