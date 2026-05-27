import type { ReactNode } from "react";

type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info" | "violet" | "cyan" | "amber";

interface Props {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  borderLeft?: boolean;
  padding?: "sm" | "md" | "lg";
}

const TONE_STYLES: Record<Tone, { bg: string; border: string; leftBorder: string }> = {
  neutral: { bg: "bg-[var(--color-bg-surface)]", border: "border-[var(--color-border)]", leftBorder: "border-l-[var(--color-border-strong)]" },
  primary: { bg: "bg-[var(--color-primary)]/8", border: "border-[var(--color-primary)]/30", leftBorder: "border-l-[var(--color-primary)]" },
  success: { bg: "bg-[var(--color-success)]/8", border: "border-[var(--color-success)]/30", leftBorder: "border-l-[var(--color-success)]" },
  warning: { bg: "bg-[var(--color-warning)]/12", border: "border-[var(--color-warning)]/35", leftBorder: "border-l-[var(--color-warning)]" },
  danger:  { bg: "bg-[var(--color-danger)]/8", border: "border-[var(--color-danger)]/30", leftBorder: "border-l-[var(--color-danger)]" },
  info:    { bg: "bg-[var(--color-info)]/8", border: "border-[var(--color-info)]/30", leftBorder: "border-l-[var(--color-info)]" },
  violet:  { bg: "bg-[var(--color-violet)]/8", border: "border-[var(--color-violet)]/30", leftBorder: "border-l-[var(--color-violet)]" },
  cyan:    { bg: "bg-[var(--color-cyan)]/8", border: "border-[var(--color-cyan)]/30", leftBorder: "border-l-[var(--color-cyan)]" },
  amber:   { bg: "bg-[var(--color-amber)]/8", border: "border-[var(--color-amber)]/30", leftBorder: "border-l-[var(--color-amber)]" },
};

const PADDING = {
  sm: "p-2.5",
  md: "p-3",
  lg: "p-4",
};

export function Card({ tone = "neutral", children, className = "", borderLeft = false, padding = "md" }: Props) {
  const s = TONE_STYLES[tone];
  return (
    <div
      className={`rounded-md border ${s.bg} ${s.border} ${borderLeft ? `border-l-[3px] ${s.leftBorder}` : ""} ${PADDING[padding]} ${className}`}
    >
      {children}
    </div>
  );
}
