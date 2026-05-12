"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { TokenIcon } from "@/components/ui/TokenIcon";
import { displayProtocol } from "@/lib/protocols";

interface ProtocolDropdownProps {
  available: string[];
  selected: string[];
  onChange: (protocols: string[]) => void;
}

export function ProtocolDropdown({ available, selected, onChange }: ProtocolDropdownProps) {
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

  const sortedProtocols = useMemo(
    () =>
      [...available].sort((a, b) =>
        displayProtocol(a).localeCompare(displayProtocol(b))
      ),
    [available]
  );

  function toggle(name: string) {
    setDraft((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
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
      ? "All Protocols"
      : draft.length === 1
      ? displayProtocol(draft[0])
      : `${draft.length} protocols`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={available.length === 0}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-sprout-border rounded-pill text-sm font-semibold text-sprout-text-primary shadow-subtle cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="truncate max-w-[120px]">{triggerLabel}</span>
        <ChevronDown
          size={14}
          className={`text-sprout-text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 bg-white border border-sprout-border rounded-2xl shadow-card p-3 min-w-[220px] max-h-[360px] overflow-y-auto z-50">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-sprout-text-muted">
              Protocols
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
            {sortedProtocols.map((name) => {
              const checked = draft.includes(name);
              return (
                <label
                  key={name}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-sprout-green-light cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(name)}
                    className="accent-sprout-green-primary w-4 h-4 cursor-pointer"
                  />
                  <TokenIcon type="protocol" identifier={name} size={20} />
                  <span className="text-sm text-sprout-text-primary truncate">
                    {displayProtocol(name)}
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
