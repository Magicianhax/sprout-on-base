interface SkeletonProps {
  className?: string;
  rounded?: "sm" | "md" | "lg" | "full";
  style?: React.CSSProperties;
}

// Base skeleton block — shimmer gradient that works in both light and
// dark themes (colors pulled from sprout tokens so dark mode inherits).
export function Skeleton({ className = "", rounded = "md", style }: SkeletonProps) {
  const radius =
    rounded === "full"
      ? "rounded-full"
      : rounded === "lg"
      ? "rounded-2xl"
      : rounded === "sm"
      ? "rounded-md"
      : "rounded-xl";

  return (
    <div
      className={`sprout-shimmer ${radius} ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}
