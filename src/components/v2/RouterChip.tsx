import { Badge } from "../ui";

export interface RouterDecision {
  difficulty: "easy" | "medium" | "hard";
  task_type: "edit" | "refactor" | "bug_fix" | "feature" | "explain";
  max_iterations: number;
  use_planner: boolean;
  use_best_of_n: boolean;
  reasoning: string;
}

const DIFF_TONES = {
  easy:   "success" as const,
  medium: "info" as const,
  hard:   "warning" as const,
};

const TASK_LABELS: Record<RouterDecision["task_type"], string> = {
  edit:     "édit",
  refactor: "refactor",
  bug_fix:  "bug fix",
  feature:  "feature",
  explain:  "explain",
};

export function RouterChip({ decision }: { decision: RouterDecision }) {
  // Aligné avec les autres meta-events (sous l'avatar Klody : margin-left 44px)
  return (
    <div className="mt-3 mb-1 ml-11 flex flex-wrap items-center gap-2 text-[11px]">
      <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-soft)] font-medium">
        🎯
      </span>
      <Badge tone={DIFF_TONES[decision.difficulty]}>{decision.difficulty}</Badge>
      <Badge tone="violet">{TASK_LABELS[decision.task_type]}</Badge>
      <span className="text-[10.5px] text-[var(--color-text-soft)]">
        max_iter={decision.max_iterations}
      </span>
      {decision.use_planner && (
        <Badge tone="cyan" title="Planner activé">planner</Badge>
      )}
      {decision.use_best_of_n && (
        <Badge tone="amber" title="Best-of-N activé">best-of-N</Badge>
      )}
      {decision.reasoning && (
        <span className="text-[10.5px] text-[var(--color-text-soft)] italic line-clamp-1 max-w-md">
          — {decision.reasoning}
        </span>
      )}
    </div>
  );
}
