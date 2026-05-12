import type { SortBy } from "@/lib/types";

interface SortToggleProps {
  value: SortBy;
  onChange: (value: SortBy) => void;
}

const OPTIONS: { label: string; value: SortBy }[] = [
  { label: "TVL", value: "tvl" },
  { label: "APY", value: "apy" },
];

export function SortToggle({ value, onChange }: SortToggleProps) {
  return (
    <div className="flex bg-sprout-green-light rounded-pill p-0.5 gap-0.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1 rounded-pill text-xs font-semibold transition-all cursor-pointer
            ${value === opt.value
              ? "bg-white text-sprout-green-dark shadow-subtle"
              : "text-sprout-text-muted"
            }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
