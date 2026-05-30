/**
 * Gestion du thème clair / sombre / auto.
 *
 * - "light" / "dark" : choix explicite de l'utilisateur.
 * - "auto" (défaut) : suit l'apparence du système (macOS), en direct.
 *
 * Le mode effectif (light|dark) est posé sur <html data-theme="…"> ; index.css
 * fournit les valeurs claires (:root) et sombres ([data-theme="dark"]). On suit
 * l'OS via matchMedia (fiable dans le WebView Tauri ET dans le navigateur de dev)
 * et, au passage, on aligne la barre de titre native via l'API Tauri (best-effort).
 */

export type ThemeMode = "light" | "dark" | "auto";
export type EffectiveTheme = "light" | "dark";

const STORAGE_KEY = "klody-theme";
const mql = window.matchMedia("(prefers-color-scheme: dark)");

export function getThemeMode(): ThemeMode {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" || v === "auto" ? v : "auto";
}

function osTheme(): EffectiveTheme {
  return mql.matches ? "dark" : "light";
}

export function resolveTheme(mode: ThemeMode): EffectiveTheme {
  return mode === "auto" ? osTheme() : mode;
}

export function applyTheme(mode: ThemeMode): EffectiveTheme {
  const effective = resolveTheme(mode);
  document.documentElement.dataset.theme = effective;

  // Aligne la barre de titre / chrome natif de la fenêtre Tauri.
  // En "auto", on laisse Tauri suivre le système (setTheme(null)).
  // Import dynamique + catch : sans effet (et sans erreur) hors Tauri (dev web).
  import("@tauri-apps/api/window")
    .then(({ getCurrentWindow }) =>
      getCurrentWindow().setTheme(mode === "auto" ? null : effective),
    )
    .catch(() => {
      /* pas dans Tauri (preview navigateur) — on ignore */
    });

  return effective;
}

export function setThemeMode(mode: ThemeMode): EffectiveTheme {
  localStorage.setItem(STORAGE_KEY, mode);
  return applyTheme(mode);
}

// Réagit en direct aux changements d'apparence de l'OS, uniquement en "auto".
mql.addEventListener("change", () => {
  if (getThemeMode() === "auto") applyTheme("auto");
});

// Applique le thème dès le chargement du module (avant le rendu React),
// pour minimiser tout flash au démarrage.
applyTheme(getThemeMode());
