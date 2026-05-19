import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, AgentStatus } from "../hooks/useAgent";

// ── Parsing markdown code blocks ──────────────────────────────────────────────

interface Segment {
  type: "text" | "code";
  content: string;
  lang?: string;
}

function parseContent(text: string): Segment[] {
  const segments: Segment[] = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ type: "text", content: text.slice(last, m.index) });
    }
    segments.push({ type: "code", lang: m[1] || "text", content: m[2].trimEnd() });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    segments.push({ type: "text", content: text.slice(last) });
  }
  return segments.length > 0 ? segments : [{ type: "text", content: text }];
}

// ── Code block avec bouton Copier ─────────────────────────────────────────────

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
      {/* Header */}
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
      {/* Code with line numbers */}
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
                    padding: `${i === 0 ? "14px" : "0"} 12px ${i === lines.length - 1 ? "14px" : "0"} 16px`,
                    color: "#3d4466",
                    minWidth: "40px",
                  }}
                >
                  {i + 1}
                </td>
                <td
                  style={{
                    padding: `${i === 0 ? "14px" : "0"} 16px ${i === lines.length - 1 ? "14px" : "0"} 0`,
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

// ── Rendu du contenu mixte texte / code ───────────────────────────────────────

function MessageContent({ text, streaming }: { text: string; streaming?: boolean }) {
  const segments = parseContent(text);
  const hasCode = segments.some((s) => s.type === "code");

  if (!hasCode) {
    return (
      <span className={streaming ? "cursor-blink" : ""} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {text}
      </span>
    );
  }

  return (
    <div className={streaming && segments[segments.length - 1]?.type === "text" ? "cursor-blink" : ""}>
      {segments.map((seg, i) =>
        seg.type === "code" ? (
          <CodeBlock key={i} lang={seg.lang!} content={seg.content} />
        ) : (
          <span key={i} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {seg.content}
          </span>
        )
      )}
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
        <MessageContent text={msg.content} streaming={msg.streaming} />
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
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#475569", gap: "8px" }}>
          <div style={{ fontSize: "28px", color: "#22d3ee22" }}>◆</div>
          <div style={{ fontSize: "13px" }}>Nouvelle session — décris ta tâche</div>
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
