import { useRef, useState } from "react";
import type { ChatMessage } from "../hooks/useAgent";
import { colors, radii } from "../theme";

export function QuestionCard({ message, onAnswer }: {
  message: ChatMessage;
  onAnswer: (id: string, answer: string) => boolean;
}) {
  const [answer, setAnswer] = useState("");
  const sent = useRef(false);
  const pending = message.questionState === "pending";
  const submit = (value: string) => {
    if (!pending || sent.current || !value.trim()) return;
    sent.current = onAnswer(message.questionId!, value);
  };
  const labelId = `question-${message.id}`;
  return (
    <section aria-labelledby={labelId} style={{ margin: "12px 0", padding: "18px", border: `1px solid ${colors.borderStrong}`, borderRadius: radii.lg, background: colors.bgSurface }}>
      <p style={{ color: colors.primaryText, fontSize: 12, marginBottom: 6 }}>Klody a besoin de ta réponse</p>
      <h2 id={labelId} style={{ fontSize: 15, fontWeight: 600 }}>{message.content}</h2>
      {pending ? <>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {message.questionOptions?.map((option, i) => (
            <button key={i} className="question-option" onClick={() => submit(option)}>{option}</button>
          ))}
        </div>
        {message.allowFreeText && <form onSubmit={e => { e.preventDefault(); submit(answer); }} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          <input aria-label="Ta réponse" value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Précise ta réponse…" style={{ flex: 1, minWidth: 140, padding: 8, border: `1px solid ${colors.borderStrong}`, borderRadius: radii.md }} />
          <button className="question-option" type="submit" disabled={!answer.trim()}>Répondre</button>
        </form>}
      </> : <p role="status" style={{ fontSize: 13, marginTop: 10, color: colors.textMuted }}>
        {message.questionState === "answered" ? `Réponse envoyée : ${message.answer}` : "Question expirée ou interrompue. Relance la demande si nécessaire."}
      </p>}
    </section>
  );
}
