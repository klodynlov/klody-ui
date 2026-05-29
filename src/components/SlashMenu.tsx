import { colors, radii, shadows } from "../theme";
import type { SlashCommand } from "../slashCommands";

interface Props {
  commands: SlashCommand[];
  activeIndex: number;
  onSelect: (cmd: SlashCommand) => void;
  onHover: (index: number) => void;
}

/** Dropdown filtrable des commandes "/" affiché au-dessus de l'input. */
export function SlashMenu({ commands, activeIndex, onSelect, onHover }: Props) {
  if (commands.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Commandes"
      style={{
        position: "absolute",
        bottom: "calc(100% + 6px)",
        left: 0,
        right: 0,
        background: colors.bgAlt,
        border: `1px solid ${colors.borderStrong}`,
        borderRadius: radii.md,
        boxShadow: shadows.focus,
        overflow: "hidden",
        zIndex: 50,
      }}
    >
      <div
        style={{
          fontSize: "10px",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: colors.textMuted,
          padding: "8px 12px 4px",
          fontWeight: 600,
        }}
      >
        Commandes
      </div>
      {commands.map((cmd, i) => {
        const active = i === activeIndex;
        return (
          <button
            key={cmd.name}
            role="option"
            aria-selected={active}
            // onMouseDown (pas onClick) pour éviter le blur du textarea avant le clic.
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(cmd);
            }}
            onMouseEnter={() => onHover(i)}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "10px",
              width: "100%",
              textAlign: "left",
              background: active ? colors.bgMuted : "transparent",
              border: "none",
              borderLeft: active ? `2px solid ${colors.primary}` : "2px solid transparent",
              padding: "8px 12px",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <span
              style={{
                color: active ? colors.primary : colors.text,
                fontSize: "13px",
                fontWeight: 600,
                fontVariantLigatures: "none",
                whiteSpace: "nowrap",
              }}
            >
              {cmd.usage}
            </span>
            <span
              style={{
                color: colors.textMuted,
                fontSize: "11.5px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {cmd.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
