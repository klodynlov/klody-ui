import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

// ── Auto-remédiation supervisée du backend ──────────────────────────────────
// Le front reconnecte le WebSocket tout seul (useAgent). Tant que la relance
// auto du LaunchAgent `com.klody.api` (KeepAlive, ThrottleInterval 30 s) peut
// aboutir, on ne fait qu'attendre. Passé le palier d'escalade (~30 s de coupure
// continue), cette relance a vraisemblablement échoué : le cockpit prend la main
// et RELANCE lui-même l'API — au lieu de demander à l'humain de taper la commande.
//
// « Supervisée » : l'action est RÉVERSIBLE (redémarrage d'un service KeepAlive,
// aucun état perdu). On la tente automatiquement, mais bornée — au-delà de
// MAX_AUTO_KICKS relances infructueuses on rend la main à l'humain (bouton +
// commande manuelle). Rien d'irréversible n'est jamais fait sans lui.

// Un palier = RETRY_EVERY tentatives WS de 3 s ≈ 30 s entre deux auto-relances.
const RETRY_EVERY = 10;
// Au-delà, on cesse d'auto-relancer : si 3 kickstart n'ont pas suffi, la panne
// dépasse le simple hang (API cassée, port squatté…) → décision humaine.
const MAX_AUTO_KICKS = 3;

export type HealPhase =
  | "idle" // connecté, ou coupure encore dans la fenêtre de relance auto
  | "healing" // kickstart en vol
  | "ok" // kickstart accepté — on attend que le WS revienne
  | "failed" // le dernier kickstart a renvoyé une erreur
  | "exhausted" // MAX_AUTO_KICKS atteint sans reconnexion
  | "unsupported"; // hors Tauri (mode web) — pas d'accès launchctl

export interface SelfHeal {
  phase: HealPhase;
  detail: string;
  supported: boolean;
  autoKicks: number;
  /** Relance manuelle (bouton de secours). No-op hors Tauri. */
  manualKick: () => void;
}

export function useBackendSelfHeal(opts: {
  connected: boolean;
  reconnectAttempts: number;
  /** Palier à partir duquel on prend la main (= seuil d'escalade côté App). */
  escalateAt: number;
}): SelfHeal {
  const { connected, reconnectAttempts, escalateAt } = opts;
  const [phase, setPhase] = useState<HealPhase>("idle");
  const [detail, setDetail] = useState("");
  const [autoKicks, setAutoKicks] = useState(0);

  const supported = isTauri();
  const inFlight = useRef(false);
  // Palier déjà traité : garantit UN seul kick par palier même si l'effet
  // re-tourne (reconnectAttempts n'incrémente que toutes les 3 s, mais d'autres
  // deps peuvent re-déclencher l'effet entre-temps).
  const lastKickStep = useRef(-1);
  const kickCount = useRef(0);

  const kick = useCallback(
    async (manual: boolean) => {
      if (!supported) {
        setPhase("unsupported");
        return;
      }
      if (inFlight.current) return;
      inFlight.current = true;
      setPhase("healing");
      setDetail("");
      try {
        const msg = await invoke<string>("kickstart_backend");
        setDetail(typeof msg === "string" ? msg : "");
        // Succès du kickstart ≠ backend déjà revenu : le WS reconnectera seul et
        // l'effet `connected` ci-dessous remettra tout à zéro. On reste en "ok"
        // (bannière sobre « API relancée… ») en attendant.
        setPhase("ok");
        if (!manual) {
          kickCount.current += 1;
          setAutoKicks(kickCount.current);
        }
      } catch (e) {
        setDetail(String(e));
        setPhase("failed");
      } finally {
        inFlight.current = false;
      }
    },
    [supported],
  );

  // Retour à la normale : dès que le WS est reconnecté, on réarme tout pour la
  // prochaine coupure.
  useEffect(() => {
    if (!connected) return;
    kickCount.current = 0;
    lastKickStep.current = -1;
    inFlight.current = false;
    setAutoKicks(0);
    setPhase("idle");
    setDetail("");
  }, [connected]);

  // Boucle d'auto-relance : ne se déclenche qu'aux paliers, plafonnée.
  useEffect(() => {
    if (connected || !supported) return;
    if (reconnectAttempts < escalateAt) return;
    if (kickCount.current >= MAX_AUTO_KICKS) {
      setPhase(p => (p === "healing" ? p : "exhausted"));
      return;
    }
    const stepsSince = reconnectAttempts - escalateAt;
    if (stepsSince % RETRY_EVERY !== 0) return; // pas un palier
    if (lastKickStep.current === reconnectAttempts) return; // palier déjà kické
    lastKickStep.current = reconnectAttempts;
    void kick(false);
  }, [connected, supported, reconnectAttempts, escalateAt, kick]);

  return { phase, detail, supported, autoKicks, manualKick: () => void kick(true) };
}
