import { useEffect, useState, type ReactNode } from "react";
import { alpha, colors, radii, shadows } from "../theme";

const API_BASE = "http://127.0.0.1:8000";

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

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr(false);
    setCfg(null);
    fetch(`${API_BASE}/api/config`)
      .then((r) => r.json())
      .then(setCfg)
      .catch(() => setErr(true));
  }, [open]);

  if (!open) return null;

  const patch = async (key: string, value: boolean | number) => {
    setCfg((prev) => (prev ? { ...prev, [key]: value } : prev)); // maj optimiste
    try {
      const r = await fetch(`${API_BASE}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      const data = await r.json();
      if (data?.config) setCfg(data.config); // réconciliation (clamp serveur)
    } catch {
      setErr(true);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: alpha(colors.text, 28), display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(520px, 92vw)", maxHeight: "86vh", overflowY: "auto", background: colors.bgSurface, border: `1px solid ${colors.border}`, borderRadius: radii.xl, boxShadow: shadows.lg, padding: "22px 24px" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
          <div style={{ fontSize: "16px", fontWeight: 700, color: colors.text }}>Paramètres</div>
          <button onClick={onClose} title="Fermer" style={{ background: "transparent", border: "none", color: colors.textMuted, fontSize: "18px", cursor: "pointer", lineHeight: 1, fontFamily: "inherit" }}>
            ✕
          </button>
        </div>
        <div style={{ color: colors.textMuted, fontSize: "11.5px", marginBottom: "18px", lineHeight: 1.5 }}>
          Réglages du moteur appliqués à chaud (effet dès le prochain message). Réinitialisés au redémarrage de l'API.
        </div>

        {err && (
          <div style={{ color: colors.dangerText, background: colors.dangerSoft, border: `1px solid ${colors.danger}`, borderRadius: radii.md, padding: "8px 12px", fontSize: "12px", marginBottom: "14px" }}>
            Backend injoignable — réglages indisponibles.
          </div>
        )}
        {!cfg && !err && <div style={{ color: colors.textSoft, fontSize: "12px" }}>Chargement…</div>}

        {cfg && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {TOGGLES.map((t) => (
              <Row key={t.key} label={t.label} help={t.help}>
                <Switch on={!!cfg[t.key]} onChange={(v) => patch(t.key, v)} />
              </Row>
            ))}
            <div style={{ height: "1px", background: colors.border, margin: "10px 0" }} />
            {NUMBERS.map((n) => (
              <Row key={n.key} label={n.label} help={n.help}>
                <input
                  type="number"
                  min={n.min}
                  max={n.max}
                  value={Number(cfg[n.key] ?? 0)}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!Number.isNaN(v)) patch(n.key, v);
                  }}
                  style={{ width: "64px", background: colors.bg, border: `1px solid ${colors.borderStrong}`, borderRadius: radii.sm, color: colors.text, fontSize: "12px", padding: "5px 8px", fontFamily: "inherit", textAlign: "right", outline: "none" }}
                />
              </Row>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "11px 0", borderBottom: `1px solid ${colors.borderSoft}` }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: colors.text, fontSize: "13px", fontWeight: 600 }}>{label}</div>
        <div style={{ color: colors.textMuted, fontSize: "11px", lineHeight: 1.4, marginTop: "2px" }}>{help}</div>
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      style={{ width: "40px", height: "22px", borderRadius: radii.pill, border: "none", cursor: "pointer", background: on ? colors.primary : colors.borderStrong, position: "relative", transition: "background 0.15s", flexShrink: 0, padding: 0 }}
    >
      <span style={{ position: "absolute", top: "2px", left: on ? "20px" : "2px", width: "18px", height: "18px", borderRadius: radii.pill, background: colors.textInvert, transition: "left 0.15s", boxShadow: shadows.sm }} />
    </button>
  );
}
