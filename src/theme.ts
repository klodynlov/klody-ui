/**
 * Theme Klody — palette "exposition longue" warm & low-saturation (v3 · clair/sombre).
 *
 * Inspiration : photographie longue exposition (couleurs douces, désaturées,
 * peu fatigantes pour l'œil), lin, sépia, ivoire. Faible saturation pour
 * pouvoir regarder l'app pendant des heures sans agression visuelle.
 *
 * v3 : chaque couleur pointe désormais vers une variable CSS (`var(--…)`)
 * définie dans index.css en versions CLAIRE et SOMBRE. Les styles inline qui
 * lisent ces valeurs deviennent donc réactifs au thème : il suffit de changer
 * l'attribut `data-theme` sur <html> (cf. theme-mode.ts) pour basculer toute
 * l'UI, sans toucher aux composants. Les valeurs hex réelles vivent dans le CSS.
 */

export const colors = {
  // ── Backgrounds (lin → crème → ivoire / espresso en sombre) ────────────
  bg: "var(--color-bg)",
  bgAlt: "var(--color-bg-alt)",
  bgMuted: "var(--color-bg-muted)",
  bgHover: "var(--color-bg-hover)",
  bgSurface: "var(--color-bg-surface)",

  // ── Text (terre brûlée chaude / ivoire en sombre) ──────────────────────
  text: "var(--color-text)",
  textMuted: "var(--color-text-muted)",
  textSoft: "var(--color-text-soft)",
  textInvert: "var(--color-text-invert)",

  // ── Borders (warm gray, subtiles) ──────────────────────────────────────
  border: "var(--color-border)",
  borderStrong: "var(--color-border-strong)",
  borderSoft: "var(--color-border-soft)",

  // ── Status (faible saturation, palette warm) ───────────────────────────
  primary: "var(--color-primary)",
  primaryHover: "var(--color-primary-hover)",
  primarySoft: "var(--color-primary-soft)",
  primaryText: "var(--color-primary-text)",

  success: "var(--color-success)",
  successSoft: "var(--color-success-soft)",
  successText: "var(--color-success-text)",

  warning: "var(--color-warning)",
  warningSoft: "var(--color-warning-soft)",
  warningText: "var(--color-warning-text)",

  danger: "var(--color-danger)",
  dangerSoft: "var(--color-danger-soft)",
  dangerText: "var(--color-danger-text)",

  info: "var(--color-info)",
  infoSoft: "var(--color-info-soft)",
  infoText: "var(--color-info-text)",

  // ── Identity Klody (accents warm) ──────────────────────────────────────
  accentViolet: "var(--color-accent-violet)",
  accentVioletSoft: "var(--color-accent-violet-soft)",
  accentCyan: "var(--color-accent-cyan)",
  accentCyanSoft: "var(--color-accent-cyan-soft)",
  accentAmber: "var(--color-accent-amber)",
  accentAmberSoft: "var(--color-accent-amber-soft)",
};

export const radii = {
  sm: "4px",
  md: "6px",
  lg: "10px",
  xl: "14px",
  pill: "999px",
};

export const shadows = {
  sm: "var(--shadow-sm)",
  md: "var(--shadow-md)",
  lg: "var(--shadow-lg)",
  focus: "var(--shadow-focus)",
};

export const fonts = {
  body: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
};

/**
 * Applique une transparence à une couleur du thème de façon dynamique.
 *
 * Remplace l'ancien pattern `${colors.primary}55` (concaténation d'un alpha
 * hex) qui ne fonctionne plus avec les `var(--…)`. `color-mix` est résolu au
 * moment du rendu et suit donc le thème actif.
 *
 * @param color  une couleur (idéalement un `colors.*`, i.e. une var CSS)
 * @param pct    opacité en pourcentage (0–100). Repères : 13 ≈ ex-"22", 33 ≈ ex-"55".
 */
export const alpha = (color: string, pct: number): string =>
  `color-mix(in srgb, ${color} ${pct}%, transparent)`;
