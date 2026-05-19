import type { SessionSummary } from "../hooks/useAgent";

interface Props {
  sessions: SessionSummary[];
  currentSessionId: string;
  onLoad: (id: string) => void;
}

export function Sidebar({ sessions, currentSessionId, onLoad }: Props) {
  const fmt = (ts: number) => {
    const d = new Date(ts * 1000);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "à l'instant";
    if (diff < 3600000) return `il y a ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `il y a ${Math.floor(diff / 3600000)} h`;
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  };

  return (
    <aside
      style={{
        width: "220px",
        flexShrink: 0,
        background: "#0d0e16",
        borderRight: "1px solid #2a2d45",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 14px 8px",
          color: "#64748b",
          fontSize: "10px",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          borderBottom: "1px solid #2a2d45",
        }}
      >
        Sessions
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        {sessions.length === 0 && (
          <div style={{ padding: "12px 14px", color: "#64748b", fontSize: "11px" }}>
            Aucune session sauvegardée
          </div>
        )}
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => onLoad(s.id)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "8px 14px",
              background: s.id === currentSessionId ? "#13141f" : "transparent",
              border: "none",
              borderLeft: s.id === currentSessionId ? "2px solid #22d3ee" : "2px solid transparent",
              cursor: "pointer",
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => {
              if (s.id !== currentSessionId)
                (e.currentTarget as HTMLButtonElement).style.background = "#13141f";
            }}
            onMouseLeave={(e) => {
              if (s.id !== currentSessionId)
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
          >
            <div
              style={{
                color: s.id === currentSessionId ? "#22d3ee" : "#94a3b8",
                fontSize: "11px",
                fontWeight: 600,
                marginBottom: "2px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {s.id.slice(0, 8)}
            </div>
            {s.preview && (
              <div
                style={{
                  color: "#64748b",
                  fontSize: "10px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {s.preview}
              </div>
            )}
            <div style={{ color: "#475569", fontSize: "10px", marginTop: "2px" }}>
              {fmt(s.modified)} · {s.messages} msgs
            </div>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          borderTop: "1px solid #2a2d45",
          padding: "10px 14px",
          color: "#475569",
          fontSize: "10px",
        }}
      >
        100% local · offline
      </div>
    </aside>
  );
}
