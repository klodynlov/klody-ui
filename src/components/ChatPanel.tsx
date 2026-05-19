import { useEffect, useRef, useState } from "react";
import type { ChatMessage, AgentStatus } from "../hooks/useAgent";

interface Props {
  messages: ChatMessage[];
  status: AgentStatus;
}

function ToolCallCard({ msg }: { msg: ChatMessage }) {
  const argsStr = msg.args
    ? Object.entries(msg.args)
        .map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 60)}`)
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
      {argsStr && <div style={{ color: "#64748b", fontFamily: "monospace" }}>{argsStr}</div>}
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
        maxHeight: "120px",
        overflowY: "auto",
        whiteSpace: "pre-wrap",
        fontFamily: "monospace",
      }}
    >
      {msg.content}
    </div>
  );
}

function ThinkingIndicator() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const timer = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const fmt = (s: number) => s >= 60 ? `${Math.floor(s/60)}m${s%60}s` : `${s}s`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "12px 0",
        color: "#64748b",
        fontSize: "12px",
      }}
    >
      <div style={{ display: "flex", gap: "4px" }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="thinking-dot"
            style={{
              width: "5px",
              height: "5px",
              borderRadius: "50%",
              background: "#22d3ee",
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </div>
      <span>Klody réfléchit…</span>
      {elapsed >= 5 && (
        <span style={{ color: "#475569", fontSize: "11px" }}>{fmt(elapsed)}</span>
      )}
    </div>
  );
}

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
      <div
        style={{
          color: "#475569",
          fontSize: "10px",
          marginBottom: "4px",
          paddingLeft: isUser ? 0 : "2px",
          paddingRight: isUser ? "2px" : 0,
        }}
      >
        {isUser ? "Vous" : msg.role === "error" ? "Erreur" : "Klody"}
      </div>
      <div
        style={{
          maxWidth: "80%",
          padding: "10px 14px",
          borderRadius: isUser ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
          background: isUser
            ? "#1a1b28"
            : msg.role === "error"
            ? "#2d1515"
            : "#13141f",
          border: `1px solid ${
            isUser ? "#2e3150" : msg.role === "error" ? "#7f1d1d" : "#2a2d45"
          }`,
          color: msg.role === "error" ? "#f87171" : "#cbd5e1",
          fontSize: "13px",
          lineHeight: "1.6",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
        className={msg.streaming ? "cursor-blink" : ""}
      >
        {msg.content}
      </div>
    </div>
  );
}

export function ChatPanel({ messages, status }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status.thinking]);

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {messages.length === 0 && (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "#475569",
            gap: "8px",
          }}
        >
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
