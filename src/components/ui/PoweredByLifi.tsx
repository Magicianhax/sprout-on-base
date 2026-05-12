interface PoweredByLifiProps {
  className?: string;
}

export function PoweredByLifi({ className = "" }: PoweredByLifiProps) {
  return (
    <p className={`text-center text-[11px] text-sprout-text-muted ${className}`}>
      Powered by{" "}
      <a
        href="https://li.fi"
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-sprout-text-secondary hover:text-sprout-green-dark transition-colors"
      >
        LI.FI
      </a>
    </p>
  );
}
