type BadgeColor = "green" | "amber" | "blue" | "red" | "gray";

const colorStyles: Record<BadgeColor, string> = {
  green: "bg-sprout-green-light text-sprout-green-dark",
  amber: "bg-sprout-amber-warm text-sprout-amber-dark",
  blue: "bg-blue-50 text-blue-700",
  red: "bg-red-50 text-red-600",
  gray: "bg-gray-100 text-gray-600",
};

interface BadgeProps {
  color?: BadgeColor;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ color = "green", children, className = "" }: BadgeProps) {
  return (
    <span className={`inline-block rounded-pill px-3 py-0.5 text-xs font-semibold ${colorStyles[color]} ${className}`}>
      {children}
    </span>
  );
}
