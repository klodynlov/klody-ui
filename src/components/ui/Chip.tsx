import type { ReactNode } from "react";

type Tone = "primary" | "success" | "warning" | "danger" | "info" | "violet" | "cyan" | "amber" | "neutral";

interface Props {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  onRemove?: () => void;
  title?: string;
}

const TONES: Record<Tone, string> = {
  primary: "bg-[var(--color-primary)]/8 text-[var(--color-primary)] border-[var(--color-primary)]/25",
  success: "bg-[var(--color-success)]/8 text-[var(--color-success)] border-[var(--color-success)]/25",
  warning: "bg-[var(--color-warning)]/12 text-[var(--color-warning)] border-[var(--color-warning)]/30",
  danger:  "bg-[var(--color-danger)]/8 text-[var(--color-danger)] border-[var(--color-danger)]/25",
  info:    "bg-[var(--color-info)]/8 text-[var(--color-info)] border-[var(--color-info)]/25",
  violet:  "bg-[var(--color-violet)]/8 text-[var(--color-violet)] border-[var(--color-violet)]/25",
  cyan:    "bg-[var(--color-cyan)]/8 text-[var(--color-cyan)] border-[var(--color-cyan)]/25",
  amber:   "bg-[var(--color-amber)]/8 text-[var(--color-amber)] border-[var(--color-amber)]/25",
  neutral: "bg-[var(--color-bg-muted)] text-[var(--color-text-muted)] border-[var(--color-border)]",
};

export function Chip({ tone = "neutral", children, className = "", onRemove, title }: Props) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border ${TONES[tone]} ${className}`}
    >
      {children}
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-1 -mr-1 opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Retirer"
        >
          ✕
        </button>
      )}
    </span>
  );
}
