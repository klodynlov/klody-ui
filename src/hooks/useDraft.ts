import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { readSessionValue, writeSessionValue } from "../api";

/** Brouillon texte par session, limité à la durée de vie de cet onglet. */
export function useDraft(sessionId: string) {
  const keyFor = (id: string) => `klody_draft:${id || readSessionValue("klody_active_session") || "new"}`;
  const activeKey = useRef(keyFor(sessionId));
  const [text, setText] = useState(() => readSessionValue(activeKey.current) ?? "");
  useLayoutEffect(() => {
    const key = keyFor(sessionId);
    if (key !== activeKey.current) {
      activeKey.current = key;
      setText(readSessionValue(key) ?? "");
    }
  }, [sessionId]);
  const updateText = useCallback((value: string) => {
    setText(value);
    writeSessionValue(activeKey.current, value);
  }, []);
  return [text, updateText] as const;
}
