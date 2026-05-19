import { useCallback, useRef, useState } from "react";

interface Props {
  disabled: boolean;
  onSend: (text: string) => void;
}

export function InputBar({ disabled, onSend }: Props) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, disabled, onSend]);

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

  return (
    <div
      style={{
        borderTop: "1px solid #2a2d45",
        padding: "12px 16px",
        background: "#0d0e16",
        display: "flex",
        gap: "10px",
        alignItems: "flex-end",
        flexShrink: 0,
      }}
    >
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
      <button
        onClick={submit}
        disabled={disabled || !text.trim()}
        style={{
          background: disabled || !text.trim() ? "#1a1b28" : "#22d3ee",
          border: "none",
          borderRadius: "8px",
          color: disabled || !text.trim() ? "#475569" : "#0a0b0f",
          fontSize: "16px",
          width: "40px",
          height: "40px",
          cursor: disabled || !text.trim() ? "not-allowed" : "pointer",
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
    </div>
  );
}
