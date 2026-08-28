import type { CSSProperties } from "react";
import { colors } from "../theme";
import type { SelfHeal } from "../hooks/useBackendSelfHeal";

// Bandeau d'état de la connexion backend. Trois régimes :
//  1. coupure récente  → sobre « Reconnexion automatique… » (la relance auto du
//     LaunchAgent peut encore aboutir, on n'alarme pas) ;
//  2. escaladé + auto-remédiation en cours → le cockpit relance l'API lui-même
//     (phases healing/ok du hook useBackendSelfHeal) ;
//  3. auto-remédiation épuisée / en échec / indisponible (mode web) → rouge, on
//     rend la main à l'humain (bouton natif, ou commande à copier hors Tauri).

const MAX_AUTO_KICKS = 3; // doit rester aligné avec useBackendSelfHeal

const bannerBase: CSSProperties = {
  padding: "10px 16px",
  fontSize: "13px",
  textAlign: "center",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "10px",
  flexWrap: "wrap",
};

function Banner(props: {
  role: "status" | "alert";
  soft: string;
  edge: string;
  fg: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role={props.role}
      style={{
        ...bannerBase,
        background: props.soft,
        borderBottom: `1px solid ${props.edge}`,
        color: props.fg,
      }}
    >
      {props.children}
    </div>
  );
}

export function BackendBanner({
  escalated,
  heal,
}: {
  escalated: boolean;
  heal: SelfHeal;
}) {
  // ── Régime 1 : coupure encore dans la fenêtre de relance auto ────────────
  if (!escalated) {
    return (
      <Banner role="status" soft={colors.warningSoft} edge={colors.warning} fg={colors.warningText}>
        <span>
          <strong>Backend indisponible.</strong> Reconnexion automatique…
        </span>
      </Banner>
    );
  }

  // Commande de secours (copiable) — utilisée en mode web et si l'auto-relance
  // native échoue.
  const manualCmd = "launchctl kickstart -k gui/$(id -u)/com.klody.api";
  const code = (
    <code
      style={{
        background: colors.bg,
        border: `1px solid ${colors.danger}`,
        padding: "1px 6px",
        borderRadius: "3px",
        fontFamily: "inherit",
      }}
    >
      {manualCmd}
    </code>
  );

  // ── Mode web (hors Tauri) : pas d'accès launchctl → main à l'humain d'emblée.
  // (En natif on tente d'abord l'auto-relance ci-dessous ; ici jamais de kick,
  // donc la phase resterait « idle » — on court-circuite pour ne pas afficher
  // une « relance automatique » qui ne partira jamais.)
  if (!heal.supported) {
    return (
      <Banner role="alert" soft={colors.dangerSoft} edge={colors.danger} fg={colors.dangerText}>
        <span>
          <strong>Backend toujours déconnecté.</strong> Relancer l'API&nbsp;: {code}
        </span>
      </Banner>
    );
  }

  // ── Régime 2 : auto-remédiation supervisée en cours ──────────────────────
  if (heal.phase === "healing" || heal.phase === "idle") {
    const attempt = Math.min(heal.autoKicks + 1, MAX_AUTO_KICKS);
    return (
      <Banner role="status" soft={colors.primarySoft} edge={colors.primary} fg={colors.primaryText}>
        <span>
          <strong>Relance automatique de l'API…</strong> tentative {attempt}/{MAX_AUTO_KICKS}
        </span>
      </Banner>
    );
  }

  if (heal.phase === "ok") {
    return (
      <Banner role="status" soft={colors.successSoft} edge={colors.success} fg={colors.successText}>
        <span>
          <strong>API relancée.</strong> Reconnexion en cours…
        </span>
      </Banner>
    );
  }

  // ── Régime 3 (natif) : échec / épuisement → bouton de relance manuelle ────
  return (
    <Banner role="alert" soft={colors.dangerSoft} edge={colors.danger} fg={colors.dangerText}>
      <span>
        <strong>Backend toujours déconnecté.</strong>{" "}
        {heal.phase === "exhausted"
          ? `La relance auto n'a pas suffi (${MAX_AUTO_KICKS} tentatives).`
          : "La relance auto a échoué."}
        {heal.detail && heal.phase === "failed" ? ` (${heal.detail})` : ""}
      </span>
      <button
        type="button"
        onClick={heal.manualKick}
        style={{
          background: colors.danger,
          color: colors.textInvert,
          border: "none",
          padding: "3px 12px",
          borderRadius: "4px",
          fontSize: "13px",
          fontFamily: "inherit",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Relancer l'API
      </button>
    </Banner>
  );
}
