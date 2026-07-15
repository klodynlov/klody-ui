import { useCallback, useEffect, useState } from "react";
import { Card } from "./ui/Card";
import { Chip } from "./ui/Chip";
import { Button } from "./ui/Button";

// Cartes de proposition de l'assistant proactif (brique 3).
// Le habit miner (nightly, klody-core) remplit une file ; au démarrage on
// affiche les propositions OUVERTES (new + shown), cap dur 3 — anti-Clippy :
//   - « Accepter »  → statut accepted + l'action part comme message agent ;
//   - « Rejeter »   → statut rejected, ne reviendra jamais ;
//   - « Plus tard » → carte masquée pour CETTE session (reste `shown` en base,
//                     re-proposée au prochain démarrage).
// Tout est best-effort : api/gateway down → aucune carte, jamais une erreur.

const API_BASE = "http://127.0.0.1:8000";
const MAX_CARDS = 3;

export interface Proposal {
  id: number;
  habit_key: string;
  kind: string;
  title: string;
  body: string;
  score: number;
  status: string;
}

const KIND_TONE: Record<string, "violet" | "cyan" | "warning" | "info"> = {
  distill: "violet",
  workflow: "cyan",
  hygiene: "warning",
  perf: "info",
};

const KIND_LABEL: Record<string, string> = {
  distill: "distillation",
  workflow: "routine",
  hygiene: "hygiène",
  perf: "perf",
};

async function postStatus(id: number, status: string): Promise<void> {
  await fetch(`${API_BASE}/api/proposals/${id}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

interface Props {
  onAccept: (text: string) => void;
}

export function ProposalCards({ onAccept }: Props) {
  const [cards, setCards] = useState<Proposal[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(
          `${API_BASE}/api/proposals?status=open&limit=${MAX_CARDS}`,
        );
        if (!r.ok) return;
        const data = await r.json();
        const list: Proposal[] = (data.proposals ?? []).slice(0, MAX_CARDS);
        if (!alive || list.length === 0) return;
        setCards(list);
        // Les fraîches passent `shown` — fire-and-forget, l'affichage n'attend pas.
        for (const p of list.filter(p => p.status === "new")) {
          void postStatus(p.id, "shown").catch(() => {});
        }
      } catch {
        // api/gateway down : pas de cartes — les propositions sont un bonus,
        // jamais une dépendance du démarrage.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const decide = useCallback(
    (p: Proposal, decision: "accepted" | "rejected") => {
      setCards(cs => cs.filter(c => c.id !== p.id)); // optimiste
      void postStatus(p.id, decision).catch(() => {});
      if (decision === "accepted") onAccept(p.body);
    },
    [onAccept],
  );

  const later = useCallback((p: Proposal) => {
    setCards(cs => cs.filter(c => c.id !== p.id)); // local : reviendra demain
  }, []);

  if (cards.length === 0) return null;

  return (
    <section
      aria-label="Propositions de l'assistant"
      className="px-4 pt-3 flex flex-col gap-2"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">
          💡 Klody a remarqué…
        </span>
        <Button variant="ghost" size="sm" onClick={() => setCards([])}>
          Tout masquer
        </Button>
      </div>
      {cards.map(p => (
        <Card key={p.id} tone="violet" borderLeft padding="md">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{p.title}</span>
                <Chip tone={KIND_TONE[p.kind] ?? "neutral"} title={p.habit_key}>
                  {KIND_LABEL[p.kind] ?? p.kind}
                </Chip>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-1 whitespace-pre-wrap">
                {p.body}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="primary"
                size="sm"
                onClick={() => decide(p, "accepted")}
                title="Lancer cette action dans le chat"
              >
                Accepter
              </Button>
              <Button variant="ghost" size="sm" onClick={() => later(p)}>
                Plus tard
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => decide(p, "rejected")}
                title="Ne plus jamais proposer"
              >
                ✕
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </section>
  );
}
