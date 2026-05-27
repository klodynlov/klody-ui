import { useState } from "react";
import { Card, Badge } from "../ui";

export interface SandboxCheck {
  command: string;
  success: boolean;
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_s: number;
  timed_out?: boolean;
}

export function SandboxCard({ check }: { check: SandboxCheck }) {
  const [expanded, setExpanded] = useState(!check.success); // ouvert par défaut si échec
  const tone = check.success ? "success" : check.timed_out ? "warning" : "danger";
  const label = check.success ? "PASS" : check.timed_out ? "TIMEOUT" : "FAIL";

  const hasOutput = check.stdout.trim() || check.stderr.trim();

  return (
    <Card tone={tone} borderLeft className="my-2 ml-11 text-xs">
      <button
        onClick={() => hasOutput && setExpanded(!expanded)}
        className={`flex items-center gap-2 w-full text-left ${hasOutput ? "cursor-pointer" : "cursor-default"}`}
        disabled={!hasOutput}
      >
        <span className="text-[var(--color-text-muted)] font-medium">🧪 Sandbox</span>
        <Badge tone={tone}>{label}</Badge>
        {check.exit_code !== 0 && !check.timed_out && (
          <span className="text-[var(--color-text-muted)] text-[10.5px]">exit={check.exit_code}</span>
        )}
        <span className="text-[var(--color-text-soft)] text-[10.5px]">{check.duration_s}s</span>
        <code className="ml-2 px-1.5 py-0.5 bg-[var(--color-bg-muted)] rounded text-[10.5px] font-mono text-[var(--color-text)] truncate max-w-md">
          {check.command}
        </code>
        {hasOutput && (
          <span className="ml-auto text-[var(--color-text-soft)] text-[10px]">
            {expanded ? "▾" : "▸"}
          </span>
        )}
      </button>

      {expanded && hasOutput && (
        <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
          {check.stdout.trim() && (
            <div>
              <div className="text-[10px] text-[var(--color-text-soft)] uppercase tracking-wider font-semibold mb-0.5">stdout</div>
              <pre className="text-[11px] font-mono text-[var(--color-text)] bg-[var(--color-bg-muted)] rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">{check.stdout.trim()}</pre>
            </div>
          )}
          {check.stderr.trim() && (
            <div>
              <div className="text-[10px] text-[var(--color-text-soft)] uppercase tracking-wider font-semibold mb-0.5">stderr</div>
              <pre className="text-[11px] font-mono text-[var(--color-danger)] bg-[var(--color-danger)]/8 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">{check.stderr.trim()}</pre>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
