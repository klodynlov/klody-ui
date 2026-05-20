import { useState } from "react";
import type { SessionSummary, MemoryEntry } from "../hooks/useAgent";

const CATEGORY_LABELS: Record<string, string> = {
  user: "Utilisateur",
  project: "Projets",
  preference: "Préférences",
  context: "Contexte",
};

const CATEGORY_COLORS: Record<string, string> = {
  user: "#22d3ee",
  project: "#a78bfa",
  preference: "#34d399",
  context: "#94a3b8",
};

interface Props {
  sessions: SessionSummary[];
  currentSessionId: string;
  memories: MemoryEntry[];
  onLoad: (id: string) => void;
  onForget: (key: string) => void;
}

export function Sidebar({ sessions, currentSessionId, memories, onLoad, onForget }: Props) {
  const [tab, setTab] = useState<"sessions" | "memory">("sessions");
  const [search, setSearch] = useState("");
  const fmtLabel = (ts: number) => {
    const d = new Date(ts * 1000);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    if (isToday) return `Aujourd'hui · ${time}`;
    if (isYesterday) return `Hier · ${time}`;
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} · ${time}`;
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
      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #2a2d45", flexShrink: 0 }}>
        {(["sessions", "memory"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              borderBottom: tab === t ? "2px solid #22d3ee" : "2px solid transparent",
              color: tab === t ? "#22d3ee" : "#64748b",
              fontSize: "10px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "10px 0 8px",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "color 0.15s",
            }}
          >
            {t === "sessions" ? "Sessions" : `Mémoire ${memories.length > 0 ? `(${memories.length})` : ""}`}
          </button>
        ))}
      </div>

      {/* Barre de recherche sessions */}
      {tab === "sessions" && (
        <div style={{ padding: "6px 10px", borderBottom: "1px solid #2a2d45" }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Chercher…"
            style={{
              width: "100%",
              background: "#13141f",
              border: "1px solid #2a2d45",
              borderRadius: "6px",
              color: "#cbd5e1",
              fontSize: "11px",
              padding: "5px 10px",
              outline: "none",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
            onFocus={e => { (e.target as HTMLInputElement).style.borderColor = "#22d3ee55"; }}
            onBlur={e => { (e.target as HTMLInputElement).style.borderColor = "#2a2d45"; }}
          />
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        {/* ── Onglet Mémoire ── */}
        {tab === "memory" && memories.length === 0 && (
          <div style={{ padding: "14px", color: "#64748b", fontSize: "11px", lineHeight: 1.5 }}>
            Aucun souvenir.{" "}
            <span style={{ color: "#475569" }}>
              Dis à Klody « souviens-toi que… » pour mémoriser quelque chose.
            </span>
          </div>
        )}
        {tab === "memory" && memories.map(entry => (
          <div
            key={entry.key}
            style={{
              padding: "8px 12px",
              borderBottom: "1px solid #13141f",
              display: "flex",
              flexDirection: "column",
              gap: "3px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4px" }}>
              <span
                style={{
                  fontSize: "9px",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: CATEGORY_COLORS[entry.category] ?? "#94a3b8",
                }}
              >
                {CATEGORY_LABELS[entry.category] ?? entry.category}
              </span>
              <button
                onClick={() => onForget(entry.key)}
                title="Oublier"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#475569",
                  fontSize: "10px",
                  cursor: "pointer",
                  padding: "0 2px",
                  lineHeight: 1,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#475569"; }}
              >
                ✕
              </button>
            </div>
            <div style={{ color: "#94a3b8", fontSize: "10px", fontWeight: 600 }}>{entry.key}</div>
            <div style={{ color: "#64748b", fontSize: "10px", lineHeight: 1.4 }}>{entry.content}</div>
          </div>
        ))}

        {/* ── Onglet Sessions ── */}
        {tab === "sessions" && (() => {
          const q = search.toLowerCase().trim();
          const filtered = q
            ? sessions.filter(s =>
                (s.title || s.id).toLowerCase().includes(q) ||
                s.preview.toLowerCase().includes(q)
              )
            : sessions;
          if (filtered.length === 0) return (
            <div style={{ padding: "12px 14px", color: "#64748b", fontSize: "11px" }}>
              {q ? `Aucun résultat pour « ${search} »` : "Aucune session sauvegardée"}
            </div>
          );
          return filtered.map((s) => (
          <div
            key={s.id}
            style={{
              display: "flex",
              alignItems: "stretch",
              borderLeft: s.id === currentSessionId ? "2px solid #f59e0b" : "2px solid transparent",
              background: s.id === currentSessionId ? "#13141f" : "transparent",
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => {
              if (s.id !== currentSessionId)
                (e.currentTarget as HTMLDivElement).style.background = "#13141f";
            }}
            onMouseLeave={(e) => {
              if (s.id !== currentSessionId)
                (e.currentTarget as HTMLDivElement).style.background = "transparent";
            }}
          >
            {/* Zone cliquable pour charger */}
            <button
              onClick={() => onLoad(s.id)}
              style={{
                flex: 1,
                textAlign: "left",
                padding: "8px 10px 8px 12px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  color: s.id === currentSessionId ? "#f59e0b" : "#64748b",
                  fontSize: "10px",
                  marginBottom: "2px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  letterSpacing: "0.02em",
                }}
              >
                {fmtLabel(s.modified)}
              </div>
              <div
                style={{
                  color: s.id === currentSessionId ? "#fde68a" : "#94a3b8",
                  fontSize: "11px",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={s.title || s.preview || s.id}
              >
                {s.title || s.preview || "Nouvelle session"}
              </div>
              <div style={{ color: "#475569", fontSize: "10px", marginTop: "2px" }}>
                {s.messages} msgs
              </div>
            </button>
            {/* Bouton export Markdown */}
            <a
              href={`http://127.0.0.1:8000/api/sessions/${s.id}/export`}
              download
              title="Exporter en Markdown"
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0 10px",
                color: "#475569",
                fontSize: "12px",
                textDecoration: "none",
                flexShrink: 0,
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#22d3ee"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#475569"; }}
            >
              ↓
            </a>
          </div>
        ));
        })()}
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
