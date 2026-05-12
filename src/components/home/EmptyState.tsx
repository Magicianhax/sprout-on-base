import { Button } from "@/components/ui/Button";
import { SproutLogo } from "@/components/ui/SproutLogo";
import { formatCurrency } from "@/lib/format";

interface EmptyStateProps {
  onStartEarning: () => void;
}

export function EmptyState({ onStartEarning }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-5 pt-4 pb-6">
      {/* $0.00 balance card */}
      <div className="w-full bg-white rounded-card shadow-card p-5 mb-8">
        <p className="text-[13px] text-sprout-text-muted mb-1">Total Balance</p>
        <p className="font-heading text-4xl font-800 text-sprout-text-primary">
          {formatCurrency(0)}
        </p>
        <p className="text-xs text-sprout-text-muted mt-2">
          Start earning to see your balance grow here
        </p>
      </div>

      {/* Sprout illustration */}
      <SproutLogo
        size={96}
        className="mb-5 shadow-subtle rounded-[22px]"
      />

      {/* Heading */}
      <h2 className="font-heading text-2xl font-700 text-sprout-text-primary text-center mb-2">
        Plant your first seed
      </h2>
      <p className="text-sm text-sprout-text-secondary text-center max-w-[260px] leading-relaxed mb-8">
        Put your crypto to work and watch it grow every single day.
      </p>

      {/* CTA */}
      <Button onClick={onStartEarning} className="w-full max-w-[320px]">
        Start Earning
      </Button>
    </div>
  );
}
