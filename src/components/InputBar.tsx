import { useCallback, useRef, useState } from "react";

interface Props {
  disabled: boolean;
  thinking: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

const MAX_FILE_SIZE = 50 * 1024; // 50 KB

const ACCEPTED_EXTENSIONS = ".py,.js,.ts,.tsx,.jsx,.md,.txt,.json,.yaml,.yml,.toml,.rs,.go,.sh,.bash,.zsh,.css,.html,.xml,.sql,.env,.cfg,.ini,.log";

export function InputBar({ disabled, thinking, onSend, onStop }: Props) {
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<{ name: string; content: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submit = useCallback(() => {
    const trimmed = text.trim();
    if ((!trimmed && !attachment) || disabled) return;

    let finalMessage = trimmed;
    if (attachment) {
      const ext = attachment.name.split(".").pop() || "";
      const codeBlock = `\`\`\`${ext}\n# ${attachment.name}\n${attachment.content}\n\`\`\``;
      finalMessage = trimmed ? `${codeBlock}\n\n${trimmed}` : codeBlock;
    }

    onSend(finalMessage);
    setText("");
    setAttachment(null);
    setFileError(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, attachment, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);

    if (file.size > MAX_FILE_SIZE) {
      setFileError(`Fichier trop lourd (max 50 Ko) — ${file.name} fait ${Math.round(file.size / 1024)} Ko`);
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setAttachment({ name: file.name, content });
    };
    reader.onerror = () => {
      setFileError("Impossible de lire ce fichier.");
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const canSend = !disabled && (text.trim().length > 0 || attachment !== null);

  return (
    <div
      style={{
        borderTop: "1px solid #2a2d45",
        padding: "12px 16px",
        background: "#0d0e16",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        flexShrink: 0,
      }}
    >
      {/* File error */}
      {fileError && (
        <div style={{ color: "#f87171", fontSize: "11px", padding: "4px 2px" }}>
          ⚠ {fileError}
        </div>
      )}

      {/* Attachment chip */}
      {attachment && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "#1a1b28",
              border: "1px solid #2a2d45",
              borderRadius: "6px",
              padding: "4px 10px",
              fontSize: "11px",
              color: "#94a3b8",
            }}
          >
            <span style={{ color: "#22d3ee" }}>📄</span>
            <span>{attachment.name}</span>
            <span style={{ color: "#475569" }}>
              ({Math.round(attachment.content.length / 1024 * 10) / 10} Ko)
            </span>
            <button
              onClick={() => setAttachment(null)}
              style={{
                background: "none",
                border: "none",
                color: "#475569",
                cursor: "pointer",
                fontSize: "12px",
                padding: "0 0 0 4px",
                lineHeight: 1,
              }}
              title="Supprimer le fichier"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Input row */}
      <div style={{ display: "flex", gap: "10px", alignItems: "flex-end" }}>
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleFileChange}
          style={{ display: "none" }}
        />

        {/* Attach button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || thinking}
          title="Joindre un fichier (texte, code, …)"
          style={{
            background: "transparent",
            border: "1px solid #2a2d45",
            borderRadius: "8px",
            color: attachment ? "#22d3ee" : "#475569",
            fontSize: "16px",
            width: "40px",
            height: "40px",
            cursor: disabled || thinking ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "border-color 0.15s, color 0.15s",
            opacity: disabled || thinking ? 0.4 : 1,
          }}
          onMouseEnter={(e) => {
            if (!disabled && !thinking) {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#22d3ee55";
              (e.currentTarget as HTMLButtonElement).style.color = "#22d3ee";
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#2a2d45";
            (e.currentTarget as HTMLButtonElement).style.color = attachment ? "#22d3ee" : "#475569";
          }}
        >
          📎
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? "Klody réfléchit…" : "Message… (Entrée pour envoyer, Shift+Entrée pour saut de ligne)"}
          rows={1}
          style={{
            flex: 1,
            background: "#13141f",
            border: "1px solid #2a2d45",
            borderRadius: "8px",
            color: "#cbd5e1",
            fontSize: "13px",
            padding: "10px 14px",
            resize: "none",
            outline: "none",
            fontFamily: "inherit",
            lineHeight: "1.5",
            transition: "border-color 0.15s",
            minHeight: "40px",
            maxHeight: "160px",
            opacity: disabled ? 0.5 : 1,
          }}
          onFocus={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = "#22d3ee55"; }}
          onBlur={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = "#2a2d45"; }}
        />

        {thinking ? (
          <button
            onClick={onStop}
            style={{
              background: "rgba(239,68,68,0.15)",
              border: "1px solid rgba(239,68,68,0.4)",
              borderRadius: "8px",
              color: "#f87171",
              fontSize: "14px",
              width: "40px",
              height: "40px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.28)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.15)"; }}
            title="Arrêter la génération"
          >
            ■
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!canSend}
            style={{
              background: canSend ? "#f59e0b" : "#1a1b28",
              border: "none",
              borderRadius: "8px",
              color: canSend ? "#0a0b0f" : "#475569",
              fontSize: "16px",
              width: "40px",
              height: "40px",
              cursor: canSend ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "background 0.15s",
              fontWeight: 700,
            }}
            title="Envoyer (Entrée)"
          >
            ▲
          </button>
        )}
      </div>
    </div>
  );
}
