import klodyLogo from "../assets/klody_logo.png";
import type { AgentStatus } from "../hooks/useAgent";

interface Props {
  status: AgentStatus;
  availableModels: string[];
  onModelChange: (m: string) => void;
  onNewSession: () => void;
}

export function Header({ status, availableModels, onModelChange, onNewSession }: Props) {
  return (
    <header
      style={{
        background: "#0d0e16",
        borderBottom: "1px solid #2a2d45",
        padding: "0 16px",
        height: "48px",
        display: "flex",
        alignItems: "center",
        gap: "16px",
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <img
        src={klodyLogo}
        alt="Klody AI"
        style={{ height: "30px", width: "auto", display: "block", flexShrink: 0, mixBlendMode: "screen" }}
      />

      <div style={{ flex: 1 }} />

      {/* Ollama status */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <div
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            background: status.ollama ? "#34d399" : "#f87171",
            boxShadow: status.ollama ? "0 0 6px #34d39966" : "none",
          }}
        />
        <span style={{ color: "#64748b", fontSize: "11px" }}>
          Ollama {status.ollama ? "actif" : "hors ligne"}
        </span>
      </div>

      {/* LibraryBrain status */}
      <div
        title={status.libraryBrain ? "LibraryBrain actif" : "LibraryBrain hors ligne"}
        style={{ display: "flex", alignItems: "center", gap: "6px" }}
      >
        <div
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            background: status.libraryBrain ? "#a78bfa" : "#475569",
            boxShadow: status.libraryBrain ? "0 0 6px #a78bfa66" : "none",
          }}
        />
        <span style={{ color: "#64748b", fontSize: "11px" }}>
          📚 {status.libraryBrain ? "actif" : "hors ligne"}
        </span>
      </div>

      {/* Model selector */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{ color: "#64748b", fontSize: "11px" }}>Modèle</span>
        {availableModels.length > 1 ? (
          <select
            value={status.model}
            onChange={(e) => onModelChange(e.target.value)}
            style={{
              background: "#13141f",
              border: "1px solid #2a2d45",
              color: "#22d3ee",
              fontSize: "11px",
              padding: "2px 6px",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            {availableModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        ) : (
          <span style={{ color: "#22d3ee", fontSize: "11px" }}>{status.model}</span>
        )}
      </div>

      {/* Separator */}
      <div style={{ width: "1px", height: "20px", background: "#2a2d45" }} />

      {/* Session info */}
      {status.sessionId && (
        <span style={{ color: "#64748b", fontSize: "11px" }}>
          Session <span style={{ color: "#f59e0b" }}>{status.sessionId.slice(0, 8)}</span>
          {" · "}
          <span style={{ color: "#94a3b8" }}>{status.messageCount} msgs</span>
        </span>
      )}

      {/* New session */}
      <button
        onClick={onNewSession}
        style={{
          background: "transparent",
          border: "1px solid #2a2d45",
          color: "#94a3b8",
          fontSize: "11px",
          padding: "4px 10px",
          borderRadius: "4px",
          cursor: "pointer",
          transition: "border-color 0.15s, color 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLButtonElement).style.borderColor = "#22d3ee";
          (e.target as HTMLButtonElement).style.color = "#22d3ee";
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLButtonElement).style.borderColor = "#2a2d45";
          (e.target as HTMLButtonElement).style.color = "#94a3b8";
        }}
      >
        + Nouvelle  <span style={{ opacity: 0.5, fontSize: "10px", marginLeft: "4px" }}>⌘K</span>
      </button>

      {/* Connection dot */}
      <div
        title={status.connected ? "Connecté au backend" : "Backend déconnecté"}
        style={{
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          background: status.connected ? "#f59e0b" : "#64748b",
          boxShadow: status.connected ? "0 0 8px #f59e0b66" : "none",
        }}
      />
    </header>
  );
}
