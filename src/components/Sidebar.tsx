import { useState } from "react";
import type { SessionSummary, MemoryEntry } from "../hooks/useAgent";
import { alpha, colors, radii } from "../theme";
import { ProjectPanel } from "./v2";
import type { ProjectInfo } from "./v2";

const API_BASE = "http://127.0.0.1:8000";

const CATEGORY_LABELS: Record<string, string> = {
  user: "Utilisateur",
  project: "Projets",
  preference: "Préférences",
  context: "Contexte",
};

const CATEGORY_COLORS: Record<string, string> = {
  user: colors.accentCyan,
  project: colors.accentViolet,
  preference: colors.success,
  context: colors.textMuted,
};

type SidebarTab = "sessions" | "memory" | "project";

interface Props {
  sessions: SessionSummary[];
  currentSessionId: string;
  memories: MemoryEntry[];
  projectInfo: ProjectInfo;
  tab: SidebarTab;
  onTabChange: (t: SidebarTab) => void;
  onLoad: (id: string) => void;
  onForget: (key: string) => void;
}

export function Sidebar({ sessions, currentSessionId, memories, projectInfo, tab, onTabChange, onLoad, onForget }: Props) {
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
        width: "240px",
        flexShrink: 0,
        background: colors.bgAlt,
        borderRight: `1px solid ${colors.border}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Tabs façon Bootstrap nav-tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: `1px solid ${colors.border}`,
          flexShrink: 0,
          background: colors.bg,
        }}
      >
        {(["sessions", "memory", "project"] as const).map(t => {
          const active = tab === t;
          const label =
            t === "sessions" ? "Sessions" :
            t === "memory" ? `Mémoire${memories.length > 0 ? ` (${memories.length})` : ""}` :
            `Projet${projectInfo.conventions.length > 0 ? ` (${projectInfo.conventions.length})` : ""}`;
          return (
            <button
              key={t}
              onClick={() => onTabChange(t)}
              style={{
                flex: 1,
                background: active ? colors.bgAlt : "transparent",
                border: "none",
                borderBottom: active ? `2px solid ${colors.primary}` : "2px solid transparent",
                color: active ? colors.primary : colors.textMuted,
                fontSize: "10.5px",
                fontWeight: active ? 600 : 500,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                padding: "12px 0 10px",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Barre de recherche sessions */}
      {tab === "sessions" && (
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${colors.border}`, background: colors.bg }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher…"
            style={{
              width: "100%",
              background: colors.bg,
              border: `1px solid ${colors.borderStrong}`,
              borderRadius: radii.md,
              color: colors.text,
              fontSize: "12px",
              padding: "6px 10px",
              outline: "none",
              fontFamily: "inherit",
              boxSizing: "border-box",
              transition: "border-color 0.15s, box-shadow 0.15s",
            }}
            onFocus={e => {
              (e.target as HTMLInputElement).style.borderColor = colors.primary;
              (e.target as HTMLInputElement).style.boxShadow = `0 0 0 3px ${alpha(colors.primary, 13)}`;
            }}
            onBlur={e => {
              (e.target as HTMLInputElement).style.borderColor = colors.borderStrong;
              (e.target as HTMLInputElement).style.boxShadow = "none";
            }}
          />
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {/* ── Onglet Projet (v2) ── */}
        {tab === "project" && <ProjectPanel info={projectInfo} />}

        {/* ── Onglet Mémoire ── */}
        {tab === "memory" && memories.length === 0 && (
          <div style={{ padding: "16px", color: colors.textMuted, fontSize: "12px", lineHeight: 1.5 }}>
            Aucun souvenir.{" "}
            <span style={{ color: colors.textSoft }}>
              Dis à Klody « souviens-toi que… » pour mémoriser quelque chose.
            </span>
          </div>
        )}
        {tab === "memory" && memories.map(entry => (
          <div
            key={entry.key}
            style={{
              padding: "10px 14px",
              borderBottom: `1px solid ${colors.borderSoft}`,
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              background: colors.bg,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4px" }}>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: CATEGORY_COLORS[entry.category] ?? colors.textMuted,
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
                  color: colors.textSoft,
                  fontSize: "11px",
                  cursor: "pointer",
                  padding: "0 4px",
                  lineHeight: 1,
                  borderRadius: radii.sm,
                  transition: "color 0.15s, background 0.15s",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.color = colors.danger;
                  (e.currentTarget as HTMLButtonElement).style.background = colors.dangerSoft;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.color = colors.textSoft;
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ color: colors.text, fontSize: "11px", fontWeight: 600 }}>{entry.key}</div>
            <div style={{ color: colors.textMuted, fontSize: "11px", lineHeight: 1.4 }}>{entry.content}</div>
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
            <div style={{ padding: "16px", color: colors.textMuted, fontSize: "12px" }}>
              {q ? `Aucun résultat pour « ${search} »` : "Aucune session sauvegardée"}
            </div>
          );
          return filtered.map((s) => {
            const isCurrent = s.id === currentSessionId;
            return (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "stretch",
                  borderLeft: isCurrent ? `3px solid ${colors.accentAmber}` : "3px solid transparent",
                  background: isCurrent ? colors.warningSoft : "transparent",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (!isCurrent) (e.currentTarget as HTMLDivElement).style.background = colors.bgHover;
                }}
                onMouseLeave={(e) => {
                  if (!isCurrent) (e.currentTarget as HTMLDivElement).style.background = "transparent";
                }}
              >
                <button
                  onClick={() => onLoad(s.id)}
                  style={{
                    flex: 1,
                    textAlign: "left",
                    padding: "10px 10px 10px 12px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    minWidth: 0,
                    fontFamily: "inherit",
                  }}
                >
                  <div
                    style={{
                      color: isCurrent ? colors.accentAmber : colors.textMuted,
                      fontSize: "10px",
                      marginBottom: "3px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      letterSpacing: "0.02em",
                      fontWeight: 500,
                    }}
                  >
                    {fmtLabel(s.modified)}
                  </div>
                  <div
                    style={{
                      color: isCurrent ? colors.text : colors.text,
                      fontSize: "12px",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={s.title || s.preview || s.id}
                  >
                    {s.title || s.preview || "Nouvelle session"}
                  </div>
                  <div style={{ color: colors.textMuted, fontSize: "10px", marginTop: "2px" }}>
                    {s.messages} msgs
                  </div>
                </button>
                <a
                  href={`${API_BASE}/api/sessions/${s.id}/export`}
                  download
                  title="Exporter en Markdown"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "0 12px",
                    color: colors.textMuted,
                    fontSize: "13px",
                    textDecoration: "none",
                    flexShrink: 0,
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = colors.primary; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = colors.textMuted; }}
                >
                  ↓
                </a>
              </div>
            );
          });
        })()}
      </div>

      {/* Footer */}
      <div
        style={{
          borderTop: `1px solid ${colors.border}`,
          padding: "10px 14px",
          color: colors.textMuted,
          fontSize: "11px",
          background: colors.bg,
          textAlign: "center",
        }}
      >
        100% local · offline
      </div>
    </aside>
  );
}
