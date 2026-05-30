import { useState } from "react";
import { colors, radii, shadows } from "../theme";
import { getThemeMode, setThemeMode, type ThemeMode } from "../theme-mode";

const OPTIONS: { mode: ThemeMode; icon: string; label: string }[] = [
  { mode: "light", icon: "☀", label: "Thème clair" },
  { mode: "auto", icon: "◐", label: "Auto (suit le système)" },
  { mode: "dark", icon: "☾", label: "Thème sombre" },
];

/** Sélecteur de thème clair / auto / sombre. Persiste le choix et suit l'OS en "auto". */
export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(getThemeMode());

  const choose = (m: ThemeMode) => {
    setThemeMode(m);
    setMode(m);
  };

  return (
    <div
      role="group"
      aria-label="Thème de l'interface"
      title="Thème : clair / auto / sombre"
      style={{
        display: "flex",
        gap: "2px",
        background: colors.bgAlt,
        border: `1px solid ${colors.border}`,
        borderRadius: radii.md,
        padding: "2px",
        flexShrink: 0,
      }}
    >
      {OPTIONS.map((o) => {
        const active = mode === o.mode;
        return (
          <button
            key={o.mode}
            onClick={() => choose(o.mode)}
            title={o.label}
            aria-label={o.label}
            aria-pressed={active}
            style={{
              border: "none",
              cursor: "pointer",
              borderRadius: radii.sm,
              padding: "3px 7px",
              fontSize: "12px",
              lineHeight: 1,
              background: active ? colors.bg : "transparent",
              color: active ? colors.primary : colors.textSoft,
              boxShadow: active ? shadows.sm : "none",
              transition: "all 0.15s",
            }}
          >
            {o.icon}
          </button>
        );
      })}
    </div>
  );
}
