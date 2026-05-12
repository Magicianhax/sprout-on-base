interface CardProps {
  children: React.ReactNode;
  className?: string;
  shadow?: "card" | "subtle";
  onClick?: () => void;
}

export function Card({ children, className = "", shadow = "card", onClick }: CardProps) {
  return (
    <div
      className={`bg-sprout-card rounded-card p-5
        ${shadow === "card" ? "shadow-card" : "shadow-subtle"}
        ${onClick ? "cursor-pointer active:scale-[0.98] transition-transform" : ""}
        ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
