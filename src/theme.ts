/**
 * Theme Klody — palette "exposition longue" warm & low-saturation (v2.1).
 *
 * Inspiration : photographie longue exposition (couleurs douces, désaturées,
 * peu fatigantes pour l'œil), lin, sépia, ivoire. Toutes les couleurs sont
 * intentionnellement maintenues en faible saturation pour pouvoir regarder
 * l'app pendant des heures sans agression visuelle.
 *
 * Tout composant Klody utilise ces variables.
 */

export const colors = {
  // ── Backgrounds (lin → crème → ivoire) ─────────────────────────────────
  bg: "#f7f3eb",            // lin clair (background principal)
  bgAlt: "#ede6d6",         // crème (sidebar, code blocks)
  bgMuted: "#e1d8c4",       // chip, hover background
  bgHover: "#ebe3d2",       // survol discret
  bgSurface: "#fbf8f2",     // surface élevée (cards qui veulent ressortir)

  // ── Text (terre brûlée chaude, jamais noir pur) ────────────────────────
  text: "#3d3530",          // text principal
  textMuted: "#7a6f63",     // text-muted
  textSoft: "#a89e91",      // text-soft (placeholder, hint)
  textInvert: "#fbf8f2",    // sur fond foncé (boutons primary)

  // ── Borders (warm gray, subtiles) ──────────────────────────────────────
  border: "#d9d0c3",
  borderStrong: "#c4b9a7",
  borderSoft: "#e3dccd",

  // ── Status (faible saturation, palette warm) ───────────────────────────
  primary: "#a87651",       // terra cotta (au lieu de bleu froid)
  primaryHover: "#8e5e3f",
  primarySoft: "#f0e2d4",
  primaryText: "#5e3f29",

  success: "#7a8b5a",       // olive sauge
  successSoft: "#e3e8d4",
  successText: "#475134",

  warning: "#c2922c",       // ocre doux
  warningSoft: "#f4e8c8",
  warningText: "#6b4f1a",

  danger: "#a85a4f",        // rust (rouge brique, doux)
  dangerSoft: "#efd7d1",
  dangerText: "#5f2d24",

  info: "#5d7c7b",          // teal poussiéreux
  infoSoft: "#d6e0df",
  infoText: "#33474b",

  // ── Identity Klody (accents warm équivalents) ──────────────────────────
  accentViolet: "#8e7081",     // mauve poussiéreux (au lieu de violet vif)
  accentVioletSoft: "#ebe0e3",
  accentCyan: "#6b8e8b",       // teal sauge
  accentCyanSoft: "#d8e3e1",
  accentAmber: "#a8772d",      // bronze ocre
  accentAmberSoft: "#f4e6cc",
};

export const radii = {
  sm: "4px",
  md: "6px",
  lg: "10px",
  xl: "14px",
  pill: "999px",
};

export const shadows = {
  sm: "0 1px 2px 0 rgba(120,90,60,0.05)",
  md: "0 1px 3px 0 rgba(120,90,60,0.08), 0 1px 2px -1px rgba(120,90,60,0.06)",
  lg: "0 4px 8px -2px rgba(120,90,60,0.10), 0 2px 4px -2px rgba(120,90,60,0.06)",
  focus: "0 0 0 3px rgba(168,118,81,0.22)", // anneau primary terra
};

export const fonts = {
  body: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
};
