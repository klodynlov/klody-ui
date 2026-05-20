import { useCallback, useEffect, useRef, useState } from "react";
import klodyLogo from "../assets/klody_logo.png";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import type { ChatMessage, AgentStatus } from "../hooks/useAgent";

// ── Code block avec numéros de ligne et bouton Copier ─────────────────────────

function CodeBlock({ lang, content }: { lang: string; content: string }) {
  const [copied, setCopied] = useState(false);
  const lines = content.split("\n");

  const copy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, [content]);

  return (
    <div
      style={{
        margin: "8px 0",
        borderRadius: "6px",
        border: "1px solid #2a2d45",
        overflow: "hidden",
        background: "#0a0b10",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "5px 12px",
          background: "#13141f",
          borderBottom: "1px solid #2a2d45",
        }}
      >
        <span style={{ color: "#64748b", fontSize: "10px", letterSpacing: "0.05em" }}>
          {lang || "code"}
        </span>
        <button
          onClick={copy}
          style={{
            background: copied ? "#10b981" : "transparent",
            border: `1px solid ${copied ? "#10b981" : "#2a2d45"}`,
            borderRadius: "3px",
            color: copied ? "#fff" : "#94a3b8",
            fontSize: "10px",
            padding: "2px 8px",
            cursor: "pointer",
            transition: "all 0.15s",
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
            fontFamily: "JetBrains Mono, Fira Code, ui-monospace, monospace",
          }}
        >
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} style={{ verticalAlign: "top" }}>
                <td
                  style={{
                    userSelect: "none",
                    textAlign: "right",
                    padding: `${i === 0 ? "12px" : "0"} 12px ${i === lines.length - 1 ? "12px" : "0"} 16px`,
                    color: "#3d4466",
                    minWidth: "40px",
                  }}
                >
                  {i + 1}
                </td>
                <td
                  style={{
                    padding: `${i === 0 ? "12px" : "0"} 16px ${i === lines.length - 1 ? "12px" : "0"} 0`,
                    color: "#e2e8f0",
                    whiteSpace: "pre",
                  }}
                >
                  {line || " "}
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
          background: "#13141f",
          border: "1px solid #2a2d45",
          borderRadius: "3px",
          padding: "1px 5px",
          fontSize: "12px",
          fontFamily: "JetBrains Mono, Fira Code, ui-monospace, monospace",
          color: "#22d3ee",
        }}
      >
        {children}
      </code>
    );
  },
  h1: ({ children }) => <div style={{ fontSize: "17px", fontWeight: 700, color: "#e2e8f0", margin: "12px 0 6px" }}>{children}</div>,
  h2: ({ children }) => <div style={{ fontSize: "15px", fontWeight: 700, color: "#e2e8f0", margin: "10px 0 5px" }}>{children}</div>,
  h3: ({ children }) => <div style={{ fontSize: "13px", fontWeight: 700, color: "#cbd5e1", margin: "8px 0 4px" }}>{children}</div>,
  p: ({ children }) => <p style={{ margin: "4px 0", lineHeight: 1.65 }}>{children}</p>,
  ul: ({ children }) => <ul style={{ margin: "4px 0", paddingLeft: "20px" }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ margin: "4px 0", paddingLeft: "20px" }}>{children}</ol>,
  li: ({ children }) => <li style={{ margin: "2px 0", lineHeight: 1.6 }}>{children}</li>,
  strong: ({ children }) => <strong style={{ color: "#e2e8f0", fontWeight: 600 }}>{children}</strong>,
  em: ({ children }) => <em style={{ color: "#94a3b8" }}>{children}</em>,
  blockquote: ({ children }) => (
    <blockquote style={{ borderLeft: "3px solid #2e3150", paddingLeft: "12px", margin: "6px 0", color: "#64748b" }}>
      {children}
    </blockquote>
  ),
  hr: () => <hr style={{ border: "none", borderTop: "1px solid #2a2d45", margin: "10px 0" }} />,
  a: ({ href, children }) => (
    <a href={href} style={{ color: "#22d3ee", textDecoration: "none" }} target="_blank" rel="noopener noreferrer">
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
        color: copied ? "#34d399" : "#475569",
        fontSize: "11px",
        cursor: "pointer",
        padding: "2px 4px",
        marginTop: "4px",
        transition: "color 0.15s",
      }}
    >
      {copied ? "✓ copié" : "⎘ copier"}
    </button>
  );
}

// ── Tool cards ────────────────────────────────────────────────────────────────

function ToolCallCard({ msg }: { msg: ChatMessage }) {
  const argsStr = msg.args
    ? Object.entries(msg.args)
        .filter(([k]) => k !== "content")
        .map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 80)}`)
        .join("  ")
    : "";
  return (
    <div
      style={{
        margin: "4px 0",
        padding: "8px 12px",
        background: "#13141f",
        border: "1px solid #2e3150",
        borderLeft: "3px solid #8b5cf6",
        borderRadius: "4px",
        fontSize: "11px",
      }}
    >
      <div style={{ color: "#a78bfa", fontWeight: 600, marginBottom: "2px" }}>
        ❯ {msg.name}
      </div>
      {argsStr && (
        <div style={{ color: "#64748b", fontFamily: "monospace", wordBreak: "break-all" }}>
          {argsStr}
        </div>
      )}
    </div>
  );
}

function ToolResultCard({ msg }: { msg: ChatMessage }) {
  return (
    <div
      style={{
        margin: "4px 0 8px",
        padding: "8px 12px",
        background: "#0d0e16",
        border: "1px solid #2a2d45",
        borderLeft: "3px solid #2e3150",
        borderRadius: "4px",
        fontSize: "11px",
        color: "#64748b",
        maxHeight: "140px",
        overflowY: "auto",
        whiteSpace: "pre-wrap",
        fontFamily: "monospace",
        wordBreak: "break-word",
      }}
    >
      {msg.content}
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
    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 0", color: "#64748b", fontSize: "12px" }}>
      <div style={{ display: "flex", gap: "4px" }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="thinking-dot" style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#22d3ee", animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
      <span>Klody réfléchit…</span>
      {elapsed >= 5 && <span style={{ color: "#475569", fontSize: "11px" }}>{fmt(elapsed)}</span>}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";

  if (msg.role === "tool_call") return <ToolCallCard msg={msg} />;
  if (msg.role === "tool_result") return <ToolResultCard msg={msg} />;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        marginBottom: "12px",
      }}
    >
      <div style={{ color: "#475569", fontSize: "10px", marginBottom: "4px", paddingLeft: isUser ? 0 : "2px", paddingRight: isUser ? "2px" : 0 }}>
        {isUser ? "Vous" : msg.role === "error" ? "Erreur" : "Klody"}
      </div>
      <div
        style={{
          maxWidth: "85%",
          padding: "10px 14px",
          borderRadius: isUser ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
          background: isUser ? "#1a1b28" : msg.role === "error" ? "#2d1515" : "#13141f",
          border: `1px solid ${isUser ? "#2e3150" : msg.role === "error" ? "#7f1d1d" : "#2a2d45"}`,
          color: msg.role === "error" ? "#f87171" : "#cbd5e1",
          fontSize: "13px",
          lineHeight: "1.6",
        }}
      >
        <MessageContent text={msg.content} streaming={msg.streaming} isUser={isUser} />
      </div>
      {!isUser && !msg.streaming && msg.content && (
        <CopyResponseButton content={msg.content} />
      )}
    </div>
  );
}

// ── ChatPanel ─────────────────────────────────────────────────────────────────

interface Props {
  messages: ChatMessage[];
  status: AgentStatus;
}

export function ChatPanel({ messages, status }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const lastMessageCount = useRef(0);

  // Detect manual scroll-up
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUp.current = distFromBottom > 80;
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
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column" }}
    >
      {messages.length === 0 && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px" }}>
          <img
            src={klodyLogo}
            alt="Klody AI"
            style={{ width: "280px", height: "auto", opacity: 0.9, display: "block", mixBlendMode: "screen" }}
          />
          <div style={{ color: "#475569", fontSize: "13px", letterSpacing: "0.04em" }}>
            Nouvelle session — décris ta tâche
          </div>
        </div>
      )}
      {messages.map((msg) => (
        <MessageBubble key={msg.id} msg={msg} />
      ))}
      {status.thinking && <ThinkingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}
