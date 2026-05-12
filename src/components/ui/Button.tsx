"use client";

import { type ReactNode, type ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "danger-text";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-gradient-to-br from-sprout-green-primary to-[#66BB6A] text-white shadow-glow font-bold",
  secondary: "bg-sprout-card text-sprout-text-primary border-[1.5px] border-sprout-border font-bold",
  "danger-text": "text-sprout-red-stop font-semibold bg-transparent",
};

export function Button({ variant = "primary", loading = false, children, className = "", disabled, ...props }: ButtonProps) {
  return (
    <button
      className={`rounded-button px-6 py-4 text-base transition-all duration-150 cursor-pointer
        ${variantStyles[variant]}
        ${disabled || loading ? "opacity-50 cursor-not-allowed" : "active:scale-[0.97]"}
        ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? "Loading..." : children}
    </button>
  );
}
