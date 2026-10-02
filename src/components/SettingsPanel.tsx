import { useEffect, useRef, useState, type ReactNode } from "react";
import { colors, radii, shadows } from "../theme";

import { apiError, requestApi } from "../api";

type Cfg = Record<string, boolean | number>;

const TOGGLES: { key: string; label: string; help: string }[] = [
  { key: "router_enabled", label: "Router adaptatif", help: "Classe la difficulté du prompt et adapte la stratégie + le nombre d'itérations." },
  { key: "best_of_n_enabled", label: "Best-of-N", help: "Génère plusieurs candidats puis un reranker LLM choisit le meilleur (tâches difficiles)." },
  { key: "best_of_n_force", label: "Forcer Best-of-N", help: "Active Best-of-N sur toutes les tâches (évaluation A/B). Coûteux en calcul." },
  { key: "sandbox_auto_exec", label: "Sandbox automatique", help: "Teste le code (pytest / py_compile) après chaque écriture de fichier .py." },
];

const NUMBERS: { key: string; label: string; min: number; max: number; help: string }[] = [
  { key: "max_iterations", label: "Itérations max (ReAct)", min: 1, max: 100, help: "Plafond de cycles raisonnement → action par message." },
  { key: "best_of_n_count", label: "Candidats Best-of-N", min: 2, max: 8, help: "Nombre de candidats générés quand Best-of-N est actif." },
  { key: "sandbox_timeout", label: "Timeout sandbox (s)", min: 1, max: 120, help: "Durée maximale d'une exécution sandbox." },
];

function isConfig(value: unknown): value is Cfg {
  if (!value || typeof value !== "object") return false;
  const cfg = value as Cfg;
  return TOGGLES.every(t => typeof cfg[t.key] === "boolean")
    && NUMBERS.every(n => Number.isFinite(cfg[n.key]) && Number.isInteger(cfg[n.key]));
}

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const epoch = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    if (!open) return;
    const current = ++epoch.current;
    const element = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    setErr(null);
    setCfg(null);
    setSaving(false);
    setSaved(false);
    busy.current = false;
    requestApi("/api/config")
      .then(r => r.json())
      .then(data => {
        if (!isConfig(data)) throw new Error("Réglages reçus invalides.");
        if (epoch.current === current) setCfg(data);
      })
      .catch(error => { if (epoch.current === current) setErr(apiError(error)); });
    return () => {
      epoch.current++;
      element?.close();
      previousFocus?.focus({ preventScroll: true });
    };
  }, [open]);

  const patch = async (key: string, value: boolean | number) => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setSaved(false);
    setErr(null);
    const current = epoch.current;
    try {
      const r = await requestApi("/api/config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      const data = await r.json();
      if (!data.ok || !isConfig(data.config)) throw new Error("Le serveur n'a pas confirmé les réglages.");
      if (current === epoch.current) { setCfg(data.config); setSaved(true); }
    } catch (error) {
      if (current === epoch.current) setErr(`Modification non confirmée : ${apiError(error)}`);
    } finally {
      if (current === epoch.current) { busy.current = false; setSaving(false); }
    }
  };

  if (!open) return null;
  return (
    <dialog ref={dialog} aria-labelledby="settings-title" onCancel={onClose}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ width: "min(520px, 92vw)", maxHeight: "86dvh", margin: "auto", padding: 0, background: colors.bgSurface, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: radii.xl, boxShadow: shadows.lg }}>
      <div style={{ padding: "22px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 id="settings-title" style={{ fontSize: 18, fontWeight: 700 }}>Paramètres</h2>
          <button onClick={onClose} title="Fermer" aria-label="Fermer les paramètres" className="question-option">✕</button>
        </div>
        <p style={{ color: colors.textMuted, fontSize: 12, margin: "12px 0" }}>
          Réglages appliqués dès le prochain message. Réinitialisés au redémarrage de l'API.
        </p>
        {err && <div role="alert" className="operation-error">{err}</div>}
        <p role="status" style={{ fontSize: 12, color: colors.textMuted }}>
          {saving ? "Enregistrement…" : saved ? "Réglages confirmés par le serveur." : !cfg && !err ? "Chargement…" : ""}
        </p>
        {cfg && <fieldset disabled={saving} style={{ border: 0, padding: 0, minWidth: 0 }}>
          <legend className="sr-only">Moteur local</legend>
          {TOGGLES.map(t => <Row key={t.key} label={t.label} help={t.help}>
            <button role="switch" aria-label={t.label} aria-checked={!!cfg[t.key]}
              onClick={() => patch(t.key, !cfg[t.key])} className="question-option">
              {cfg[t.key] ? "Activé" : "Désactivé"}
            </button>
          </Row>)}
          {NUMBERS.map(n => <Row key={n.key} label={n.label} help={n.help}>
            <NumberSetting value={Number(cfg[n.key])} label={n.label} min={n.min} max={n.max} onApply={v => patch(n.key, v)} />
          </Row>)}
        </fieldset>}
      </div>
    </dialog>
  );
}

function NumberSetting({ value, label, min, max, onApply }: {
  value: number; label: string; min: number; max: number; onApply: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const number = Number(draft);
  const valid = draft.trim() !== "" && Number.isInteger(number) && number >= min && number <= max;
  return <form onSubmit={e => { e.preventDefault(); if (valid && number !== value) onApply(number); }} style={{ display: "flex", gap: 6 }}>
    <input type="number" aria-label={label} min={min} max={max} step={1} value={draft}
      onChange={e => setDraft(e.target.value)} aria-invalid={!valid}
      style={{ width: 65, padding: 6, border: `1px solid ${colors.borderStrong}`, borderRadius: radii.sm }} />
    <button className="question-option" disabled={!valid || number === value} aria-label={`Appliquer ${label}`}>OK</button>
  </form>;
}

function Row({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 0", borderBottom: `1px solid ${colors.borderSoft}` }}>
    <div style={{ flex: "1 1 190px" }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
      <p style={{ color: colors.textMuted, fontSize: 11, lineHeight: 1.5 }}>{help}</p>
    </div>
    {children}
  </div>;
}
