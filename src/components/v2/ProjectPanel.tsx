import { Badge } from "../ui";

export interface Convention {
  name: string;
  value: string;
  evidence: string;
  confidence: number;
}

export interface RecurrentError {
  signature: string;
  count: number;
}

export interface ProjectInfo {
  workdir?: string;
  backend?: "ollama" | "mlx";
  model?: string;
  mcp_server_active?: boolean;
  conventions: Convention[];
  recurrent_errors: RecurrentError[];
}

export function ProjectPanel({ info }: { info: ProjectInfo }) {
  return (
    <div className="px-3 py-2 space-y-3 overflow-y-auto">

      {/* Backend status */}
      {info.backend && (
        <section>
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-soft)] font-semibold mb-1.5">Backend</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={info.backend === "mlx" ? "primary" : "info"}>
              {info.backend}
            </Badge>
            {info.model && (
              <span className="text-[10.5px] text-[var(--color-text-muted)] truncate max-w-[160px]" title={info.model}>
                {info.model}
              </span>
            )}
          </div>
          {info.mcp_server_active !== undefined && (
            <div className="text-[10px] text-[var(--color-text-soft)] mt-1">
              MCP : <span className={info.mcp_server_active ? "text-[var(--color-success)] font-medium" : "text-[var(--color-text-soft)]"}>
                {info.mcp_server_active ? "✓ actif" : "○ inactif"}
              </span>
            </div>
          )}
        </section>
      )}

      {/* Conventions */}
      <section>
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-soft)] font-semibold mb-1.5">
          Conventions {info.conventions.length > 0 && `(${info.conventions.length})`}
        </div>
        {info.conventions.length === 0 ? (
          <p className="text-[11px] text-[var(--color-text-soft)] italic">Aucune convention détectée — index .klody/ absent ou projet vide.</p>
        ) : (
          <ul className="space-y-1.5">
            {info.conventions.map(c => (
              <li key={c.name} className="text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--color-text)] font-semibold">{c.name}</span>
                  <span className="text-[var(--color-primary)] font-medium">{c.value}</span>
                  <span className="text-[9.5px] text-[var(--color-text-soft)] ml-auto">{Math.round(c.confidence * 100)}%</span>
                </div>
                <div className="text-[10.5px] text-[var(--color-text-muted)] italic mt-0.5 leading-snug">
                  {c.evidence}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recurrent errors */}
      <section>
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-soft)] font-semibold mb-1.5">
          Erreurs récurrentes {info.recurrent_errors.length > 0 && `(${info.recurrent_errors.length})`}
        </div>
        {info.recurrent_errors.length === 0 ? (
          <p className="text-[11px] text-[var(--color-text-soft)] italic">Aucune erreur fréquente.</p>
        ) : (
          <ul className="space-y-1">
            {info.recurrent_errors.map(e => (
              <li key={e.signature} className="flex items-center gap-2 text-[11px]">
                <span className="text-[var(--color-danger)] font-mono truncate flex-1" title={e.signature}>{e.signature}</span>
                <Badge tone="danger">{e.count}×</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      {info.workdir && (
        <div className="text-[10px] text-[var(--color-text-soft)] pt-2 border-t border-[var(--color-border-soft)] truncate" title={info.workdir}>
          📁 {info.workdir.split("/").slice(-2).join("/")}
        </div>
      )}
    </div>
  );
}
