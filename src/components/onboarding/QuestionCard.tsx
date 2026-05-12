"use client";

interface Option {
  label: string;
  value: string;
  description?: string;
}

interface QuestionCardProps {
  question: string;
  subtitle?: string;
  options: Option[];
  onSelect: (value: string) => void;
  selected?: string;
}

export function QuestionCard({ question, subtitle, options, onSelect, selected }: QuestionCardProps) {
  return (
    <div className="flex flex-col items-center">
      <h2 className="font-heading text-2xl font-700 text-sprout-text-primary text-center">{question}</h2>
      {subtitle && <p className="text-sm text-sprout-text-secondary mt-2 text-center">{subtitle}</p>}
      <div className="flex flex-col gap-3 w-full mt-8">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onSelect(opt.value)}
            className={`w-full text-left px-5 py-4 rounded-button border-[1.5px] transition-all duration-150 cursor-pointer
              ${selected === opt.value ? "border-sprout-green-primary bg-sprout-green-light" : "border-sprout-border bg-white"}`}
          >
            <div className="font-semibold text-sprout-text-primary">{opt.label}</div>
            {opt.description && <div className="text-xs text-sprout-text-secondary mt-1">{opt.description}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}
