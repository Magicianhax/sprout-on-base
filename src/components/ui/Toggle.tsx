"use client";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
  disabled?: boolean;
}

// Fixed-size switch that can't be stretched by flex parents. Thumb is
// positioned via `left` so enabled/disabled states stay pixel-perfect.
export function Toggle({ checked, onChange, ariaLabel, disabled }: ToggleProps) {
  const WIDTH = 44;
  const HEIGHT = 24;
  const THUMB = 18;
  const GAP = (HEIGHT - THUMB) / 2; // 3px

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? "bg-sprout-green-primary" : "bg-gray-200"
      }`}
      style={{ width: WIDTH, height: HEIGHT }}
    >
      <span
        className="absolute bg-white rounded-full shadow transition-[left] duration-200 ease-out"
        style={{
          width: THUMB,
          height: THUMB,
          top: GAP,
          left: checked ? WIDTH - THUMB - GAP : GAP,
        }}
      />
    </button>
  );
}
