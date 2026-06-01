import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import type { ChatMessage, AgentStatus, SessionSummary } from "../hooks/useAgent";
import { alpha, colors, radii, shadows, fonts } from "../theme";
import { highlightToLines, colorOf, isComment } from "../syntax";
import { RouterChip, SandboxCard, BestOfNDrawer } from "./v2";

// ── Code block avec numéros de ligne et bouton Copier ─────────────────────────

function CodeBlock({ lang, content }: { lang: string; content: string }) {
  const [copied, setCopied] = useState(false);
  const lines = content.split("\n");
  // Coloration purement visuelle (le contenu copié reste `content` intact).
  const hl = highlightToLines(content, lang);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, [content]);

  return (
    <div
      style={{
        margin: "10px 0",
        borderRadius: radii.md,
        border: `1px solid ${colors.border}`,
        overflow: "hidden",
        background: colors.bgAlt,
        boxShadow: shadows.sm,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          background: colors.bgMuted,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <span style={{ color: colors.textMuted, fontSize: "10px", letterSpacing: "0.05em", fontWeight: 600, textTransform: "uppercase" }}>
          {lang || "code"}
        </span>
        <button
          onClick={copy}
          style={{
            background: copied ? colors.success : colors.bg,
            border: `1px solid ${copied ? colors.success : colors.borderStrong}`,
            borderRadius: radii.sm,
            color: copied ? colors.textInvert : colors.text,
            fontSize: "10px",
            padding: "3px 10px",
            cursor: "pointer",
            transition: "all 0.15s",
            fontFamily: "inherit",
            fontWeight: 500,
          }}
        >
          {copied ? "✓ Copié" : "Copier"}
        </button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            borderCollapse: "collapse",
            width: "100%",
            fontSize: "12px",
            lineHeight: "1.6",
            fontFamily: fonts.mono,
          }}
        >
          <tbody>
            {lines.map((_line, i) => (
              <tr key={i} style={{ verticalAlign: "top" }}>
                <td
                  style={{
                    userSelect: "none",
                    textAlign: "right",
                    padding: `${i === 0 ? "12px" : "0"} 12px ${i === lines.length - 1 ? "12px" : "0"} 16px`,
                    color: colors.textSoft,
                    minWidth: "40px",
                  }}
                >
                  {i + 1}
                </td>
                <td
                  style={{
                    padding: `${i === 0 ? "12px" : "0"} 16px ${i === lines.length - 1 ? "12px" : "0"} 0`,
                    color: colors.text,
                    whiteSpace: "pre",
                  }}
                >
                  {hl[i] && hl[i].length
                    ? hl[i].map((tok, k) => (
                        <span
                          key={k}
                          style={{ color: colorOf(tok.t), fontStyle: isComment(tok.t) ? "italic" : undefined }}
                        >
                          {tok.v}
                        </span>
                      ))
                    : " "}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Composants react-markdown ─────────────────────────────────────────────────

const MD_COMPONENTS: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const isBlock = !props.ref && String(children).includes("\n");
    if (isBlock || match) {
      return <CodeBlock lang={match?.[1] ?? ""} content={String(children).replace(/\n$/, "")} />;
    }
    return (
      <code
        style={{
          background: colors.bgMuted,
          border: `1px solid ${colors.border}`,
          borderRadius: radii.sm,
          padding: "1px 6px",
          fontSize: "12px",
          fontFamily: fonts.mono,
          color: colors.accentViolet,
        }}
      >
        {children}
      </code>
    );
  },
  h1: ({ children }) => <div style={{ fontSize: "18px", fontWeight: 700, color: colors.text, margin: "14px 0 6px" }}>{children}</div>,
  h2: ({ children }) => <div style={{ fontSize: "16px", fontWeight: 700, color: colors.text, margin: "12px 0 5px" }}>{children}</div>,
  h3: ({ children }) => <div style={{ fontSize: "14px", fontWeight: 700, color: colors.text, margin: "10px 0 4px" }}>{children}</div>,
  p: ({ children }) => <p style={{ margin: "4px 0", lineHeight: 1.65 }}>{children}</p>,
  ul: ({ children }) => <ul style={{ margin: "4px 0", paddingLeft: "22px" }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ margin: "4px 0", paddingLeft: "22px" }}>{children}</ol>,
  li: ({ children }) => <li style={{ margin: "2px 0", lineHeight: 1.6 }}>{children}</li>,
  strong: ({ children }) => <strong style={{ color: colors.text, fontWeight: 600 }}>{children}</strong>,
  em: ({ children }) => <em style={{ color: colors.textMuted }}>{children}</em>,
  blockquote: ({ children }) => (
    <blockquote style={{ borderLeft: `3px solid ${colors.primary}`, paddingLeft: "12px", margin: "8px 0", color: colors.textMuted, background: colors.primarySoft, padding: "6px 12px", borderRadius: radii.sm }}>
      {children}
    </blockquote>
  ),
  hr: () => <hr style={{ border: "none", borderTop: `1px solid ${colors.border}`, margin: "12px 0" }} />,
  a: ({ href, children }) => (
    <a href={href} style={{ color: colors.primary, textDecoration: "underline" }} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

// ── Rendu du contenu message ──────────────────────────────────────────────────

function MessageContent({ text, streaming, isUser }: { text: string; streaming?: boolean; isUser?: boolean }) {
  if (isUser) {
    return (
      <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {text}
      </span>
    );
  }

  return (
    <div className={streaming ? "cursor-blink" : ""} style={{ wordBreak: "break-word" }}>
      <ReactMarkdown components={MD_COMPONENTS}>{text}</ReactMarkdown>
    </div>
  );
}

// ── Bouton copier réponse complète ────────────────────────────────────────────

function CopyResponseButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, [content]);

  return (
    <button
      onClick={copy}
      title="Copier la réponse"
      style={{
        background: "transparent",
        border: "none",
        color: copied ? colors.success : colors.textMuted,
        fontSize: "11px",
        cursor: "pointer",
        padding: "4px 6px",
        marginTop: "4px",
        transition: "color 0.15s",
        fontFamily: "inherit",
      }}
    >
      {copied ? "✓ copié" : "⎘ copier"}
    </button>
  );
}

// ── Tool cards — discrètes, alignées sur l'axe assistant ────────────────────

// Récap compact des arguments d'un tool call.
// - Petits paramètres (≤40 chars) → affichés tels quels (path, query, etc.)
// - Gros paramètres (html, css, js, content, …) → juste leur nom + taille
function _summarizeArgs(args: Record<string, unknown> | undefined): ReactNode {
  if (!args || Object.keys(args).length === 0) return null;
  return Object.entries(args).map(([k, v], i) => {
    const isString = typeof v === "string";
    const len = isString ? (v as string).length : 0;
    const showInline = !isString || len <= 40;
    return (
      <span key={k} style={{ marginLeft: i > 0 ? "10px" : 0 }}>
        <span style={{ color: colors.textSoft }}>{k}=</span>
        {showInline ? (
          <span style={{ color: colors.text }}>
            {isString ? `"${v}"` : JSON.stringify(v).slice(0, 40)}
          </span>
        ) : (
          <span
            title={(v as string).slice(0, 300) + ((v as string).length > 300 ? "…" : "")}
            style={{
              color: colors.accentViolet,
              fontStyle: "italic",
              fontSize: "10.5px",
            }}
          >
            ⟨{len.toLocaleString("fr-FR")} chars⟩
          </span>
        )}
      </span>
    );
  });
}

function ToolCallCard({ msg }: { msg: ChatMessage }) {
  return (
    <div
      style={{
        margin: "4px 0 4px 44px",
        padding: "6px 12px",
        background: "transparent",
        borderLeft: `2px solid ${colors.accentViolet}`,
        fontSize: "11.5px",
        color: colors.textMuted,
        fontFamily: fonts.mono,
        lineHeight: 1.5,
      }}
    >
      <span style={{ color: colors.accentViolet, fontWeight: 600 }}>❯ {msg.name}</span>
      <span style={{ marginLeft: "10px" }}>{_summarizeArgs(msg.args)}</span>
    </div>
  );
}

// URL de preview locale (servie par le HTTP server du preview_tool)
function _extractPreviewUrl(content: string): string | null {
  const m = content.match(/https?:\/\/localhost:\d+\/[^\s)\]]+/);
  return m ? m[0] : null;
}

// ── Rendu de diff (résultat de write_file) ──────────────────────────────────
// Le backend renvoie « Fichier {créé|modifié} avec succès: <path> » suivi, en
// cas de modification, d'un diff unifié difflib (---/+++/@@/+/-). On colore
// chaque ligne par tons du thème (donc réactif clair/sombre).

function _diffLineStyle(line: string): { color: string; bg: string; italic?: boolean } {
  if (line.startsWith("+++") || line.startsWith("---")) return { color: colors.textSoft, bg: "transparent" };
  if (line.startsWith("@@")) return { color: colors.infoText, bg: colors.infoSoft };
  if (line.startsWith("+")) return { color: colors.successText, bg: colors.successSoft };
  if (line.startsWith("-")) return { color: colors.dangerText, bg: colors.dangerSoft };
  if (line.startsWith("…")) return { color: colors.textSoft, bg: "transparent", italic: true };
  return { color: colors.textMuted, bg: "transparent" }; // ligne de contexte
}

function WriteFileDiff({ content }: { content: string }) {
  const sep = content.indexOf("\n\n");
  const header = (sep === -1 ? content : content.slice(0, sep)).trim();
  const body = sep === -1 ? "" : content.slice(sep + 2);
  const lines = body.length ? body.split("\n") : [];

  return (
    <div style={{ fontFamily: "inherit" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          color: colors.successText,
          fontWeight: 600,
          fontSize: "11.5px",
          marginBottom: lines.length ? "8px" : 0,
        }}
      >
        <span style={{ color: colors.success }}>✓</span>
        <span>{header}</span>
      </div>
      {lines.length > 0 && (
        <div
          style={{
            border: `1px solid ${colors.border}`,
            borderRadius: radii.sm,
            overflow: "auto",
            maxHeight: "340px",
            background: colors.bgAlt,
          }}
        >
          {lines.map((line, i) => {
            const st = _diffLineStyle(line);
            return (
              <div
                key={i}
                style={{
                  color: st.color,
                  background: st.bg,
                  fontStyle: st.italic ? "italic" : undefined,
                  fontFamily: fonts.mono,
                  fontSize: "11.5px",
                  lineHeight: 1.55,
                  padding: "0 10px",
                  whiteSpace: "pre",
                }}
              >
                {line || " "}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ToolResultCard({ msg }: { msg: ChatMessage }) {
  const [expanded, setExpanded] = useState(false);
  const content = msg.content || "";
  const previewUrl = (msg.name === "preview_code" || msg.name === "preview_file")
    ? _extractPreviewUrl(content)
    : null;
  const isError = content.startsWith("ERREUR") || content.toLowerCase().includes("timeout");
  const hasWarning = !isError && (content.includes("⚠") || content.toLowerCase().includes("avertissement"));
  const tone = isError ? "danger" : hasWarning ? "warning" : "neutral";
  const isWriteFile = msg.name === "write_file" && !isError;

  const bgMap = { danger: colors.dangerSoft, warning: colors.warningSoft, neutral: colors.bgAlt };
  const borderMap = { danger: colors.danger, warning: colors.warning, neutral: colors.borderStrong };
  const colorMap = { danger: colors.dangerText, warning: colors.warningText, neutral: colors.textMuted };

  const isLong = content.length > 240;
  const display = expanded || !isLong ? content : content.slice(0, 240) + "…";
  const lineCount = display.split("\n").length;

  return (
    <div
      style={{
        margin: "2px 0 10px 44px",
        padding: "10px 14px",
        minHeight: "32px",  // ← garantit hauteur minimum visible
        background: bgMap[tone],
        borderLeft: `3px solid ${borderMap[tone]}`,
        fontSize: "11.5px",
        color: colorMap[tone],
        maxHeight: isWriteFile ? "none" : expanded ? "400px" : lineCount > 8 ? "180px" : "none",
        overflowY: "auto",
        whiteSpace: "pre-wrap",
        fontFamily: fonts.mono,
        wordBreak: "break-word",
        borderRadius: `0 ${radii.sm} ${radii.sm} 0`,
        lineHeight: 1.5,
      }}
    >
      {previewUrl && (
        <div style={{ marginBottom: "8px", fontFamily: "inherit" }}>
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              color: colors.primary,
              fontWeight: 500,
              fontSize: "12px",
              textDecoration: "none",
              padding: "6px 12px",
              background: colors.primarySoft,
              border: `1px solid ${alpha(colors.primary, 33)}`,
              borderRadius: radii.md,
            }}
          >
            👁 Ouvrir l'aperçu
            <code style={{ fontFamily: fonts.mono, fontSize: "11px", opacity: 0.85 }}>{previewUrl}</code>
          </a>
        </div>
      )}
      {isWriteFile && <WriteFileDiff content={content} />}
      {!isWriteFile && <div style={{ display: content ? "block" : "none" }}>{display}</div>}
      {!content && !previewUrl && (
        <span style={{ color: colors.textSoft, fontStyle: "italic" }}>(résultat vide)</span>
      )}
      {!isWriteFile && isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            display: "inline-block",
            marginTop: "6px",
            background: colors.bg,
            border: `1px solid ${colors.borderStrong}`,
            color: colors.primary,
            fontSize: "11px",
            cursor: "pointer",
            padding: "2px 10px",
            borderRadius: radii.pill,
            fontFamily: "inherit",
            fontWeight: 500,
          }}
        >
          {expanded ? "▴ réduire" : `▾ tout voir (${content.length.toLocaleString("fr-FR")} chars)`}
        </button>
      )}
    </div>
  );
}

// ── Thinking indicator ────────────────────────────────────────────────────────

function ThinkingIndicator() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const fmt = (s: number) =>
    s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0 8px 44px", color: colors.textMuted, fontSize: "12px" }}>
      <div style={{ display: "flex", gap: "4px" }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="thinking-dot" style={{ width: "6px", height: "6px", borderRadius: radii.pill, background: colors.primary, animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
      <span>Klody réfléchit…</span>
      {elapsed >= 5 && <span style={{ color: colors.textSoft, fontSize: "11px" }}>{fmt(elapsed)}</span>}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageStats({ stats, inline = false }: { stats: NonNullable<ChatMessage["stats"]>; inline?: boolean }) {
  const fmt = (s: number) =>
    s >= 60 ? `${Math.floor(s / 60)}m${(s % 60).toFixed(0)}s` : `${s.toFixed(1)}s`;
  return (
    <span
      title={stats.model ?? ""}
      style={{
        color: colors.textSoft,
        fontSize: "10.5px",
        fontFamily: fonts.mono,
        marginLeft: inline ? "8px" : "0",
      }}
    >
      ⏱ {fmt(stats.latency_s)} · ~{stats.tokens} tok
    </span>
  );
}

// ── Avatar circulaire ─────────────────────────────────────────────────────────

function Avatar({ kind }: { kind: "user" | "klody" | "error" }) {
  const config = {
    user:  { letter: "U", bg: colors.bgMuted, fg: colors.text, border: colors.borderStrong },
    klody: { letter: "K", bg: colors.primary, fg: colors.textInvert, border: colors.primaryHover },
    error: { letter: "!", bg: colors.dangerSoft, fg: colors.dangerText, border: colors.danger },
  }[kind];
  return (
    <div
      aria-hidden
      style={{
        width: "32px",
        height: "32px",
        borderRadius: radii.pill,
        background: config.bg,
        color: config.fg,
        border: `1px solid ${config.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "13px",
        fontWeight: 600,
        flexShrink: 0,
        fontFamily: "Georgia, serif",
      }}
    >
      {config.letter}
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  const isError = msg.role === "error";

  if (msg.role === "tool_call") return <ToolCallCard msg={msg} />;
  if (msg.role === "tool_result") return <ToolResultCard msg={msg} />;
  if (msg.role === "router" && msg.router) return <RouterChip decision={msg.router} />;
  if (msg.role === "sandbox" && msg.sandbox) return <SandboxCard check={msg.sandbox} />;
  if (msg.role === "best_of_n" && msg.bestOfN) return <BestOfNDrawer result={msg.bestOfN} />;

  // ── Style USER : bulle compacte à droite avec avatar
  if (isUser) {
    return (
      <div
        style={{
          display: "flex",
          gap: "12px",
          alignItems: "flex-start",
          marginBottom: "20px",
          justifyContent: "flex-end",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", maxWidth: "75%" }}>
          <div
            style={{
              color: colors.textMuted,
              fontSize: "11px",
              marginBottom: "4px",
              fontWeight: 500,
            }}
          >
            Vous
          </div>
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "14px 14px 4px 14px",
              background: colors.primarySoft,
              border: `1px solid ${alpha(colors.primary, 33)}`,
              color: colors.text,
              fontSize: "13.5px",
              lineHeight: "1.6",
              boxShadow: shadows.sm,
            }}
          >
            <MessageContent text={msg.content} isUser />
          </div>
          {msg.content && (
            <div style={{ marginTop: "2px" }}>
              <CopyResponseButton content={msg.content} />
            </div>
          )}
        </div>
        <Avatar kind="user" />
      </div>
    );
  }

  // ── Style KLODY / ERROR : flow pleine largeur avec avatar à gauche
  return (
    <div
      style={{
        display: "flex",
        gap: "12px",
        alignItems: "flex-start",
        marginBottom: "24px",
      }}
    >
      <Avatar kind={isError ? "error" : "klody"} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: colors.textMuted,
            fontSize: "11px",
            marginBottom: "6px",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <span style={{ color: isError ? colors.dangerText : colors.text, fontWeight: 600 }}>
            {isError ? "Erreur" : "Klody"}
          </span>
          {!isUser && msg.stats && <MessageStats stats={msg.stats} inline />}
        </div>
        <div
          style={{
            padding: "0",
            color: isError ? colors.dangerText : colors.text,
            fontSize: "13.5px",
            lineHeight: "1.7",
            background: "transparent",
            // Pas de bulle — flow pleine largeur. Distinction via avatar + header.
            ...(isError && {
              padding: "10px 14px",
              background: colors.dangerSoft,
              border: `1px solid ${colors.danger}`,
              borderRadius: radii.md,
            }),
          }}
        >
          <MessageContent text={msg.content} streaming={msg.streaming} />
        </div>
        {!msg.streaming && msg.content && (
          <div style={{ marginTop: "4px" }}>
            <CopyResponseButton content={msg.content} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Écran d'accueil (session vide) ────────────────────────────────────────────

const STARTERS = [
  { icon: "📂", label: "Liste les fichiers du projet", prompt: "Liste les fichiers du projet." },
  { icon: "🔎", label: "Trouve les TODO et FIXME", prompt: "Cherche tous les TODO et FIXME dans le code et liste-les par fichier." },
  { icon: "📖", label: "Distiller un livre en méthode", prompt: "Propose-moi 3 livres de ma bibliothèque à distiller en méthode actionnable." },
  { icon: "✨", label: "Que peux-tu faire ?", prompt: "Explique en quelques points concrets ce que tu peux faire pour moi." },
];

function WelcomeScreen({ sessions, onSend, onLoad }: { sessions: SessionSummary[]; onSend: (t: string) => void; onLoad: (id: string) => void }) {
  const h = new Date().getHours();
  const greeting = h < 6 ? "Bonne nuit" : h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";
  const recent = sessions.filter((s) => s.messages > 0).slice(0, 4);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "22px", padding: "24px", maxWidth: "680px", margin: "0 auto", width: "100%" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "44px", fontWeight: 300, letterSpacing: "0.04em", color: colors.text, fontFamily: "Georgia, 'Times New Roman', serif" }}>
          {greeting}
        </div>
        <div style={{ color: colors.textMuted, fontSize: "14px", marginTop: "8px", letterSpacing: "0.04em" }}>
          Que puis-je faire pour toi&nbsp;?
        </div>
      </div>

      {/* Amorces cliquables */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", width: "100%" }}>
        {STARTERS.map((s) => (
          <button
            key={s.label}
            onClick={() => onSend(s.prompt)}
            style={{ display: "flex", alignItems: "center", gap: "10px", textAlign: "left", padding: "12px 14px", background: colors.bgAlt, border: `1px solid ${colors.border}`, borderRadius: radii.lg, color: colors.text, fontSize: "12.5px", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", boxShadow: shadows.sm }}
            onMouseEnter={(e) => { const t = e.currentTarget as HTMLButtonElement; t.style.borderColor = colors.primary; t.style.background = colors.bgHover; }}
            onMouseLeave={(e) => { const t = e.currentTarget as HTMLButtonElement; t.style.borderColor = colors.border; t.style.background = colors.bgAlt; }}
          >
            <span style={{ fontSize: "16px", flexShrink: 0 }}>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {/* Reprise des sessions récentes */}
      {recent.length > 0 && (
        <div style={{ width: "100%" }}>
          <div style={{ color: colors.textSoft, fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "10px", textAlign: "center" }}>
            Reprendre
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center" }}>
            {recent.map((s) => (
              <button
                key={s.id}
                onClick={() => onLoad(s.id)}
                title={s.title || s.preview}
                style={{ maxWidth: "260px", padding: "7px 12px", background: "transparent", border: `1px solid ${colors.borderStrong}`, borderRadius: radii.pill, color: colors.textMuted, fontSize: "11.5px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", transition: "all 0.15s" }}
                onMouseEnter={(e) => { const t = e.currentTarget as HTMLButtonElement; t.style.color = colors.primary; t.style.borderColor = colors.primary; }}
                onMouseLeave={(e) => { const t = e.currentTarget as HTMLButtonElement; t.style.color = colors.textMuted; t.style.borderColor = colors.borderStrong; }}
              >
                ↩ {s.title || s.preview || "Session"}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ChatPanel ─────────────────────────────────────────────────────────────────

interface Props {
  messages: ChatMessage[];
  status: AgentStatus;
  sessions: SessionSummary[];
  onSend: (text: string) => void;
  onLoad: (id: string) => void;
}

export function ChatPanel({ messages, status, sessions, onSend, onLoad }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const lastMessageCount = useRef(0);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Detect manual scroll-up + show "↑ Haut" button when scrolled past 300px
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUp.current = distFromBottom > 80;
    setShowScrollTop(el.scrollTop > 300);
  }, []);

  const scrollToTop = useCallback(() => {
    containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    userScrolledUp.current = true; // évite auto-scroll juste après
  }, []);

  useEffect(() => {
    // A new user message was added → always scroll to bottom
    const userMsgs = messages.filter(m => m.role === "user").length;
    if (userMsgs > lastMessageCount.current) {
      userScrolledUp.current = false;
      lastMessageCount.current = userMsgs;
    }

    if (!userScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, status.thinking]);

  return (
    <div style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "32px 36px 24px",
          display: "flex",
          flexDirection: "column",
          background: colors.bg,
        }}
      >
        {messages.length === 0 && (
          <WelcomeScreen sessions={sessions} onSend={onSend} onLoad={onLoad} />
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {status.thinking && <ThinkingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Bouton flottant "↑ Haut" quand scrollé loin du début */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          title="Remonter au début"
          style={{
            position: "absolute",
            top: "16px",
            right: "20px",
            background: colors.bg,
            border: `1px solid ${colors.borderStrong}`,
            borderRadius: radii.pill,
            color: colors.text,
            fontSize: "12px",
            fontWeight: 500,
            padding: "6px 14px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            boxShadow: shadows.md,
            transition: "all 0.15s",
            zIndex: 10,
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = colors.primary;
            (e.currentTarget as HTMLButtonElement).style.color = colors.textInvert;
            (e.currentTarget as HTMLButtonElement).style.borderColor = colors.primary;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = colors.bg;
            (e.currentTarget as HTMLButtonElement).style.color = colors.text;
            (e.currentTarget as HTMLButtonElement).style.borderColor = colors.borderStrong;
          }}
        >
          ↑ Haut
        </button>
      )}
    </div>
  );
}
