import type { AgentStatus } from "../hooks/useAgent";
import { alpha, colors, radii, shadows } from "../theme";
import { ThemeToggle } from "./ThemeToggle";

interface Props {
  status: AgentStatus;
  availableModels: string[];
  onModelChange: (m: string) => void;
  onNewSession: () => void;
  onOpenSettings: () => void;
}

// ── Status dot (vert/rouge selon connecté) ───────────────────────────────────

function StatusDot({ active, label, color = colors.success }: { active: boolean; label: string; color?: string }) {
  return (
    <div
      title={`${label} ${active ? "actif" : "hors ligne"}`}
      style={{ display: "flex", alignItems: "center", gap: "6px" }}
    >
      <div
        style={{
          width: "7px",
          height: "7px",
          borderRadius: radii.pill,
          background: active ? color : colors.textSoft,
          boxShadow: active ? `0 0 0 3px ${alpha(color, 13)}` : "none",
          transition: "all 0.15s",
        }}
      />
      <span style={{ color: colors.textMuted, fontSize: "11.5px" }}>{label}</span>
    </div>
  );
}

// Tronque un nom de modèle (ex: "mlx-community/Qwen3-Coder-30B-…") en truc lisible
function shortModel(model: string): string {
  if (!model) return "";
  // Garde la partie après le dernier "/" puis tronque
  const last = model.split("/").pop() ?? model;
  return last.length > 32 ? last.slice(0, 32) + "…" : last;
}

export function Header({ status, availableModels, onModelChange, onNewSession, onOpenSettings }: Props) {
  return (
    <header
      style={{
        background: colors.bg,
        borderBottom: `1px solid ${colors.border}`,
        boxShadow: shadows.sm,
        padding: "0 24px",
        height: "52px",
        display: "flex",
        alignItems: "center",
        gap: "20px",
        flexShrink: 0,
      }}
    >
      {/* Wordmark — plus discret */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "6px", flexShrink: 0 }}>
        <span
          style={{
            fontSize: "17px",
            fontWeight: 400,
            letterSpacing: "0.12em",
            color: colors.text,
            fontFamily: "Georgia, 'Times New Roman', serif",
          }}
        >
          Klody
        </span>
        <span
          style={{
            fontSize: "9px",
            color: colors.textSoft,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          AI
        </span>
      </div>

      <div style={{ flex: 1 }} />

      <StatusDot active={status.ollama || (status.backend === "mlx")}
                 label={status.backend === "mlx" ? "MLX" : "Ollama"}
                 color={status.backend === "mlx" ? colors.primary : colors.success} />
      <StatusDot active={status.libraryBrain} label="📚 LibraryBrain" color={colors.accentViolet} />

      {/* Sélecteur de thème clair / auto / sombre */}
      <ThemeToggle />

      {/* Paramètres (réglages moteur à chaud) */}
      <button
        onClick={onOpenSettings}
        title="Paramètres"
        style={{ background: "transparent", border: `1px solid ${colors.border}`, color: colors.textMuted, fontSize: "14px", width: "30px", height: "30px", borderRadius: radii.md, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", flexShrink: 0, fontFamily: "inherit" }}
        onMouseEnter={(e) => { const t = e.currentTarget as HTMLButtonElement; t.style.color = colors.primary; t.style.borderColor = colors.primary; }}
        onMouseLeave={(e) => { const t = e.currentTarget as HTMLButtonElement; t.style.color = colors.textMuted; t.style.borderColor = colors.border; }}
      >
        ⚙
      </button>

      {/* Model selector — Bootstrap-like select compact */}
      {availableModels.length > 1 ? (
        <select
          value={status.model}
          onChange={(e) => onModelChange(e.target.value)}
          title={status.model}
          style={{
            background: colors.bgAlt,
            border: `1px solid ${colors.border}`,
            color: colors.text,
            fontSize: "11.5px",
            padding: "5px 10px",
            borderRadius: radii.md,
            cursor: "pointer",
            fontFamily: "inherit",
            fontWeight: 500,
            maxWidth: "260px",
          }}
        >
          {availableModels.map((m) => (
            <option key={m} value={m}>{shortModel(m)}</option>
          ))}
        </select>
      ) : (
        <span
          title={status.model}
          style={{
            color: colors.textMuted,
            fontSize: "11.5px",
            background: colors.bgAlt,
            padding: "4px 10px",
            borderRadius: radii.md,
            border: `1px solid ${colors.border}`,
          }}
        >
          {shortModel(status.model)}
        </span>
      )}

      {/* Session compteur (sans hex) */}
      {status.messageCount > 0 && (
        <span style={{ color: colors.textMuted, fontSize: "11.5px" }}>
          {status.messageCount} {status.messageCount === 1 ? "message" : "messages"}
        </span>
      )}

      {/* New session — primary button compact */}
      <button
        onClick={onNewSession}
        style={{
          background: colors.primary,
          border: "none",
          color: colors.textInvert,
          fontSize: "12px",
          fontWeight: 500,
          padding: "7px 14px",
          borderRadius: radii.md,
          cursor: "pointer",
          transition: "background 0.15s",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = colors.primaryHover;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = colors.primary;
        }}
      >
        + Nouvelle
        <span style={{ opacity: 0.7, fontSize: "10px" }}>⌘K</span>
      </button>

      {/* Connection dot */}
      <div
        title={status.connected ? "Connecté au backend" : "Backend déconnecté"}
        style={{
          width: "8px",
          height: "8px",
          borderRadius: radii.pill,
          background: status.connected ? colors.success : colors.danger,
          boxShadow: status.connected ? `0 0 0 3px ${alpha(colors.success, 13)}` : `0 0 0 3px ${alpha(colors.danger, 13)}`,
          transition: "all 0.15s",
        }}
      />
    </header>
  );
}
