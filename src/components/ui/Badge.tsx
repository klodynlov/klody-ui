import type { ReactNode } from "react";

type Tone = "primary" | "success" | "warning" | "danger" | "info" | "violet" | "cyan" | "amber" | "neutral";

interface Props {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  title?: string;
}

const TONES: Record<Tone, string> = {
  primary: "bg-[var(--color-primary)]/12 text-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/35",
  success: "bg-[var(--color-success)]/12 text-[var(--color-success)] ring-1 ring-[var(--color-success)]/35",
  warning: "bg-[var(--color-warning)]/15 text-[var(--color-warning)] ring-1 ring-[var(--color-warning)]/40",
  danger:  "bg-[var(--color-danger)]/12 text-[var(--color-danger)] ring-1 ring-[var(--color-danger)]/35",
  info:    "bg-[var(--color-info)]/12 text-[var(--color-info)] ring-1 ring-[var(--color-info)]/35",
  violet:  "bg-[var(--color-violet)]/12 text-[var(--color-violet)] ring-1 ring-[var(--color-violet)]/35",
  cyan:    "bg-[var(--color-cyan)]/12 text-[var(--color-cyan)] ring-1 ring-[var(--color-cyan)]/35",
  amber:   "bg-[var(--color-amber)]/12 text-[var(--color-amber)] ring-1 ring-[var(--color-amber)]/35",
  neutral: "bg-[var(--color-bg-muted)] text-[var(--color-text-muted)] ring-1 ring-[var(--color-border)]",
};

export function Badge({ tone = "neutral", children, className = "", title }: Props) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold uppercase tracking-wider ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
