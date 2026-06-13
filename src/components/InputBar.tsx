import { useCallback, useRef, useState } from "react";
import { alpha, colors, radii, shadows } from "../theme";
import { SlashMenu } from "./SlashMenu";
import { slashQuery, filterCommands, parseCommand, type SlashCommand } from "../slashCommands";

interface Props {
  disabled: boolean;
  thinking: boolean;
  onSend: (text: string, imagePaths?: string[]) => void;
  onUploadImage: (file: File) => Promise<{ name: string; path: string }>;
  onStop: () => void;
  onCommand: (name: string, args: string) => void;
}

const MAX_FILE_SIZE = 50 * 1024; // 50 KB
const MAX_IMAGE_SIZE = 12 * 1024 * 1024; // 12 Mo — doit rester ≤ VL_MAX_IMAGE_MB (backend)

const ACCEPTED_EXTENSIONS = ".py,.js,.ts,.tsx,.jsx,.md,.txt,.json,.yaml,.yml,.toml,.rs,.go,.sh,.bash,.zsh,.css,.html,.xml,.sql,.env,.cfg,.ini,.log";
const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/webp,image/gif,image/bmp";

export function InputBar({ disabled, thinking, onSend, onUploadImage, onStop, onCommand }: Props) {
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<{ name: string; content: string } | null>(null);
  const [images, setImages] = useState<{ name: string; path: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // ── Menu "/" : visible tant qu'on tape le nom de commande (slash + token) ──
  const slashFilter = slashQuery(text);
  const filtered = slashFilter !== null ? filterCommands(slashFilter) : [];
  const menuVisible = !disabled && !dismissed && slashFilter !== null && filtered.length > 0;
  const safeIndex = Math.min(activeIndex, Math.max(0, filtered.length - 1));

  const resetInput = useCallback(() => {
    setText("");
    setDismissed(false);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, []);

  const selectCommand = useCallback((cmd: SlashCommand) => {
    if (cmd.takesArgs) {
      // On pré-remplit "/cmd " : l'utilisateur tape ensuite les arguments.
      setText(`/${cmd.name} `);
      setActiveIndex(0);
      textareaRef.current?.focus();
    } else {
      onCommand(cmd.name, "");
      resetInput();
    }
  }, [onCommand, resetInput]);

  const clearImages = useCallback(() => {
    setImages(prev => {
      prev.forEach(i => URL.revokeObjectURL(i.url));
      return [];
    });
  }, []);

  const submit = useCallback(() => {
    if (disabled || uploading) return;
    const trimmed = text.trim();

    // Commande "/" connue → exécution déterministe (pas d'envoi au LLM).
    const parsed = parseCommand(trimmed);
    if (parsed) {
      onCommand(parsed.name, parsed.args);
      setAttachment(null);
      clearImages();
      setFileError(null);
      resetInput();
      return;
    }

    if (!trimmed && !attachment && images.length === 0) return;

    let finalMessage = trimmed;
    if (attachment) {
      const ext = attachment.name.split(".").pop() || "";
      const codeBlock = `\`\`\`${ext}\n# ${attachment.name}\n${attachment.content}\n\`\`\``;
      finalMessage = trimmed ? `${codeBlock}\n\n${trimmed}` : codeBlock;
    }

    onSend(finalMessage, images.map(i => i.path));
    setText("");
    setAttachment(null);
    clearImages();
    setFileError(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, attachment, images, uploading, disabled, onSend, onCommand, resetInput, clearImages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuVisible) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex(i => (i + 1) % filtered.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex(i => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectCommand(filtered[safeIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissed(true);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    setDismissed(false);
    setActiveIndex(0);
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

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setFileError(null);
    setUploading(true);
    try {
      for (const file of files) {
        if (file.size > MAX_IMAGE_SIZE) {
          setFileError(`Image trop lourde (max 12 Mo) — ${file.name} fait ${Math.round(file.size / 1024 / 1024 * 10) / 10} Mo`);
          continue;
        }
        try {
          const { name, path } = await onUploadImage(file);
          setImages(prev => [...prev, { name, path, url: URL.createObjectURL(file) }]);
        } catch (err) {
          setFileError(`Échec de l'upload — ${file.name} : ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (path: string) => {
    setImages(prev => {
      const gone = prev.find(i => i.path === path);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter(i => i.path !== path);
    });
  };

  const canSend = !disabled && !uploading && (text.trim().length > 0 || attachment !== null || images.length > 0);

  return (
    <div
      style={{
        borderTop: `1px solid ${colors.border}`,
        padding: "14px 18px",
        background: colors.bgAlt,
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        flexShrink: 0,
      }}
    >
      {/* File error — Bootstrap-like alert */}
      {fileError && (
        <div
          role="alert"
          style={{
            background: colors.dangerSoft,
            color: colors.dangerText,
            border: `1px solid ${colors.danger}`,
            fontSize: "12px",
            padding: "6px 10px",
            borderRadius: radii.md,
          }}
        >
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
              background: colors.accentCyanSoft,
              border: `1px solid ${alpha(colors.accentCyan, 33)}`,
              borderRadius: radii.pill,
              padding: "4px 12px",
              fontSize: "12px",
              color: colors.text,
            }}
          >
            <span style={{ color: colors.accentCyan }}>📄</span>
            <span style={{ fontWeight: 500 }}>{attachment.name}</span>
            <span style={{ color: colors.textMuted }}>
              ({Math.round(attachment.content.length / 1024 * 10) / 10} Ko)
            </span>
            <button
              onClick={() => setAttachment(null)}
              style={{
                background: "none",
                border: "none",
                color: colors.textMuted,
                cursor: "pointer",
                fontSize: "13px",
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

      {/* Image previews (vision B-lite) */}
      {(images.length > 0 || uploading) && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
          {images.map(img => (
            <div key={img.path} style={{ position: "relative", width: "48px", height: "48px" }} title={img.name}>
              <img
                src={img.url}
                alt={img.name}
                style={{
                  width: "48px",
                  height: "48px",
                  objectFit: "cover",
                  borderRadius: radii.md,
                  border: `1px solid ${colors.borderStrong}`,
                  display: "block",
                }}
              />
              <button
                onClick={() => removeImage(img.path)}
                title="Retirer l'image"
                style={{
                  position: "absolute",
                  top: "-6px",
                  right: "-6px",
                  background: colors.danger,
                  color: colors.textInvert,
                  border: "none",
                  borderRadius: radii.pill,
                  width: "18px",
                  height: "18px",
                  fontSize: "11px",
                  lineHeight: 1,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ✕
              </button>
            </div>
          ))}
          {uploading && (
            <span style={{ fontSize: "12px", color: colors.textMuted }}>Upload de l'image…</span>
          )}
        </div>
      )}

      {/* Input row */}
      <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", position: "relative" }}>
        {menuVisible && (
          <SlashMenu
            commands={filtered}
            activeIndex={safeIndex}
            onSelect={selectCommand}
            onHover={setActiveIndex}
          />
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleFileChange}
          style={{ display: "none" }}
        />

        {/* Attach button — Bootstrap-like secondary outline */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || thinking}
          title="Joindre un fichier (texte, code, …)"
          style={{
            background: colors.bg,
            border: `1px solid ${colors.borderStrong}`,
            borderRadius: radii.md,
            color: attachment ? colors.accentCyan : colors.textMuted,
            fontSize: "16px",
            width: "42px",
            height: "42px",
            cursor: disabled || thinking ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "all 0.15s",
            opacity: disabled || thinking ? 0.4 : 1,
          }}
          onMouseEnter={(e) => {
            if (!disabled && !thinking) {
              (e.currentTarget as HTMLButtonElement).style.borderColor = colors.primary;
              (e.currentTarget as HTMLButtonElement).style.color = colors.primary;
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = colors.borderStrong;
            (e.currentTarget as HTMLButtonElement).style.color = attachment ? colors.accentCyan : colors.textMuted;
          }}
        >
          📎
        </button>

        <input
          ref={imageInputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          multiple
          onChange={handleImageChange}
          style={{ display: "none" }}
        />

        {/* Attach image button (vision B-lite) — Klody « voit » l'image via analyser_image */}
        <button
          onClick={() => imageInputRef.current?.click()}
          disabled={disabled || thinking || uploading}
          title="Joindre une image (Klody la regarde)"
          style={{
            background: colors.bg,
            border: `1px solid ${colors.borderStrong}`,
            borderRadius: radii.md,
            color: images.length > 0 ? colors.accentCyan : colors.textMuted,
            fontSize: "16px",
            width: "42px",
            height: "42px",
            cursor: disabled || thinking || uploading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "all 0.15s",
            opacity: disabled || thinking || uploading ? 0.4 : 1,
          }}
          onMouseEnter={(e) => {
            if (!disabled && !thinking && !uploading) {
              (e.currentTarget as HTMLButtonElement).style.borderColor = colors.primary;
              (e.currentTarget as HTMLButtonElement).style.color = colors.primary;
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = colors.borderStrong;
            (e.currentTarget as HTMLButtonElement).style.color = images.length > 0 ? colors.accentCyan : colors.textMuted;
          }}
        >
          🖼️
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? "Klody réfléchit…" : "Message…  (Entrée pour envoyer, Shift+Entrée pour saut de ligne)"}
          rows={1}
          style={{
            flex: 1,
            background: colors.bg,
            border: `1px solid ${colors.borderStrong}`,
            borderRadius: radii.md,
            color: colors.text,
            fontSize: "13px",
            padding: "10px 14px",
            resize: "none",
            outline: "none",
            fontFamily: "inherit",
            lineHeight: "1.5",
            transition: "all 0.15s",
            minHeight: "42px",
            maxHeight: "160px",
            opacity: disabled ? 0.5 : 1,
            boxShadow: "none",
          }}
          onFocus={(e) => {
            (e.target as HTMLTextAreaElement).style.borderColor = colors.primary;
            (e.target as HTMLTextAreaElement).style.boxShadow = shadows.focus;
          }}
          onBlur={(e) => {
            (e.target as HTMLTextAreaElement).style.borderColor = colors.borderStrong;
            (e.target as HTMLTextAreaElement).style.boxShadow = "none";
          }}
        />

        {thinking ? (
          <button
            onClick={onStop}
            style={{
              background: colors.danger,
              border: "none",
              borderRadius: radii.md,
              color: colors.textInvert,
              fontSize: "16px",
              width: "42px",
              height: "42px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "background 0.15s",
              fontWeight: 700,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#b02a37"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = colors.danger; }}
            title="Arrêter la génération"
          >
            ■
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!canSend}
            style={{
              background: canSend ? colors.primary : colors.bgMuted,
              border: "none",
              borderRadius: radii.md,
              color: canSend ? colors.textInvert : colors.textSoft,
              fontSize: "16px",
              width: "42px",
              height: "42px",
              cursor: canSend ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "background 0.15s",
              fontWeight: 700,
            }}
            onMouseEnter={(e) => {
              if (canSend) (e.currentTarget as HTMLButtonElement).style.background = colors.primaryHover;
            }}
            onMouseLeave={(e) => {
              if (canSend) (e.currentTarget as HTMLButtonElement).style.background = colors.primary;
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
