import { useState } from "react";
import { Card, Badge } from "../ui";

export interface PreviewFeedbackError {
  label: string;
  msg: string;
  src: string;
}

export interface PreviewFeedback {
  url: string;
  count: number;
  attempt: number;
  max: number;
  errors: PreviewFeedbackError[];
}

/**
 * Chip « boucle de feedback preview » : la page générée a planté à l'exécution
 * dans le navigateur (erreurs captées par l'overlay → backend) et Klody relance
 * une passe de correction. Rend visible un mécanisme sinon silencieux.
 */
export function PreviewFeedbackChip({ fb }: { fb: PreviewFeedback }) {
  const [expanded, setExpanded] = useState(false);
  const filename = fb.url.split("/").pop() || fb.url;
  const hasErrors = fb.errors.length > 0;

  return (
    <Card tone="warning" borderLeft className="my-2 ml-11 text-xs">
      <button
        onClick={() => hasErrors && setExpanded(!expanded)}
        className={`flex items-center gap-2 w-full text-left ${hasErrors ? "cursor-pointer" : "cursor-default"}`}
        disabled={!hasErrors}
      >
        <span className="text-[var(--color-text-muted)] font-medium">🔁 Preview</span>
        <Badge tone="danger">{fb.count} erreur{fb.count > 1 ? "s" : ""} JS</Badge>
        <span className="text-[var(--color-text-soft)] text-[10.5px]">
          correction auto {fb.attempt}/{fb.max}
        </span>
        <code className="ml-2 px-1.5 py-0.5 bg-[var(--color-bg-muted)] rounded text-[10.5px] font-mono text-[var(--color-text)] truncate max-w-md">
          {filename}
        </code>
        {hasErrors && (
          <span className="ml-auto text-[var(--color-text-soft)] text-[10px]">
            {expanded ? "▾" : "▸"}
          </span>
        )}
      </button>

      {expanded && hasErrors && (
        <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
          {fb.errors.map((e, i) => (
            <pre
              key={i}
              className="text-[11px] font-mono text-[var(--color-danger)] bg-[var(--color-danger)]/8 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all"
            >
              [{e.label}] {e.msg}
              {e.src ? `\n  → ${e.src}` : ""}
            </pre>
          ))}
        </div>
      )}
    </Card>
  );
}
