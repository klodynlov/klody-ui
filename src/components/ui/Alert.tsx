import type { ReactNode } from "react";

type Tone = "info" | "success" | "warning" | "danger";

interface Props {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}

const TONES: Record<Tone, string> = {
  info:    "bg-[var(--color-info)]/10 text-[var(--color-info)] border-[var(--color-info)]/35",
  success: "bg-[var(--color-success)]/10 text-[var(--color-success)] border-[var(--color-success)]/35",
  warning: "bg-[var(--color-warning)]/15 text-[var(--color-warning)] border-[var(--color-warning)]/45",
  danger:  "bg-[var(--color-danger)]/10 text-[var(--color-danger)] border-[var(--color-danger)]/35",
};

const ICONS: Record<Tone, string> = {
  info: "ℹ",
  success: "✓",
  warning: "⚠",
  danger: "✗",
};

export function Alert({ tone = "info", children, className = "", icon }: Props) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-2 px-3 py-2 rounded-md border text-xs leading-relaxed ${TONES[tone]} ${className}`}
    >
      <span className="font-bold leading-tight">{icon ?? ICONS[tone]}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}
