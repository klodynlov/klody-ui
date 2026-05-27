import { useState } from "react";
import { Card, Badge } from "../ui";

export interface BoNCandidate {
  idx: number;
  temperature: number;
  content: string;
  tool_calls?: Array<{ name: string }>;
  latency_s: number;
}

export interface BestOfNResult {
  winner_idx: number;
  reasoning: string;
  candidates: BoNCandidate[];
}

export function BestOfNDrawer({ result }: { result: BestOfNResult }) {
  const [open, setOpen] = useState(false);
  const winner = result.candidates[result.winner_idx];

  return (
    <Card tone="amber" borderLeft className="my-2 ml-11 text-xs">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left cursor-pointer"
      >
        <span className="text-[var(--color-text-muted)] font-medium">🎲 Best-of-{result.candidates.length}</span>
        <Badge tone="amber">candidat {result.winner_idx + 1} retenu</Badge>
        {winner && (
          <span className="text-[10.5px] text-[var(--color-text-soft)]">T={winner.temperature.toFixed(1)} · {winner.latency_s}s</span>
        )}
        <span className="ml-auto text-[var(--color-text-soft)] text-[10px]">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          {result.candidates.map(c => {
            const isWinner = c.idx === result.winner_idx;
            return (
              <div
                key={c.idx}
                className={`p-2 rounded border ${isWinner ? "bg-[var(--color-amber)]/12 border-[var(--color-amber)]/40" : "bg-[var(--color-bg-muted)] border-[var(--color-border)]"}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`font-bold text-[11px] ${isWinner ? "text-[var(--color-amber)]" : "text-[var(--color-text-muted)]"}`}>
                    {isWinner && "🏆 "}[{c.idx + 1}]
                  </span>
                  <span className="text-[10.5px] text-[var(--color-text-soft)]">T={c.temperature.toFixed(1)}</span>
                  <span className="text-[10.5px] text-[var(--color-text-soft)]">{c.latency_s}s</span>
                  {c.tool_calls && c.tool_calls.length > 0 && (
                    <span className="text-[10.5px] text-[var(--color-violet)]">
                      → {c.tool_calls.map(tc => tc.name).join(", ")}
                    </span>
                  )}
                </div>
                {c.content && (
                  <div className="text-[11px] text-[var(--color-text)] line-clamp-2 italic">
                    « {c.content.trim().slice(0, 200)}{c.content.length > 200 ? "…" : ""} »
                  </div>
                )}
              </div>
            );
          })}
          {result.reasoning && (
            <div className="text-[11px] text-[var(--color-text-muted)] italic pt-1 border-t border-[var(--color-border-soft)]">
              Reranker : {result.reasoning}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
