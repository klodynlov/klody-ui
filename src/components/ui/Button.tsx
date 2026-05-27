import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:   "bg-[var(--color-primary)] text-[var(--color-text-invert)] hover:bg-[var(--color-primary-hover)] border border-transparent",
  secondary: "bg-[var(--color-bg-surface)] text-[var(--color-text)] hover:bg-[var(--color-bg-hover)] border border-[var(--color-border-strong)]",
  ghost:     "bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text)] border border-transparent",
  danger:    "bg-[var(--color-danger)] text-[var(--color-text-invert)] hover:opacity-90 border border-transparent",
  success:   "bg-[var(--color-success)] text-[var(--color-text-invert)] hover:opacity-90 border border-transparent",
};

const SIZES: Record<Size, string> = {
  sm: "text-[11px] px-2.5 py-1 rounded-md gap-1.5",
  md: "text-xs px-3.5 py-1.5 rounded-md gap-2",
  lg: "text-sm px-4 py-2 rounded-lg gap-2",
};

export function Button({ variant = "secondary", size = "md", className = "", children, ...props }: Props) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {children}
    </button>
  );
}
