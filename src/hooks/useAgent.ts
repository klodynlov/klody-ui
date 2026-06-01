import { useCallback, useEffect, useRef, useState } from "react";
import type {
  RouterDecision,
  SandboxCheck,
  BestOfNResult,
  ProjectInfo,
} from "../components/v2";

export type MessageRole =
  | "user"
  | "assistant"
  | "tool_call"
  | "tool_result"
  | "thinking"
  | "error"
  | "router"
  | "sandbox"
  | "best_of_n";

export interface MessageStats {
  latency_s: number;
  tokens: number;
  model?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  name?: string;
  args?: Record<string, unknown>;
  streaming?: boolean;
  // Payloads v2 spécifiques (selon role)
  router?: RouterDecision;
  sandbox?: SandboxCheck;
  bestOfN?: BestOfNResult;
  stats?: MessageStats;
}

export interface AgentStatus {
  connected: boolean;
  ollama: boolean;
  libraryBrain: boolean;
  model: string;
  sessionId: string;
  messageCount: number;
  thinking: boolean;
  backend?: "ollama" | "mlx";
  mcpServerActive?: boolean;
}

const API_BASE = "http://127.0.0.1:8000";
const WS_URL = "ws://127.0.0.1:8000/api/ws";

let msgCounter = 0;
const uid = () => `m${++msgCounter}`;

export function useAgent() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<AgentStatus>({
    connected: false,
    ollama: false,
    libraryBrain: false,
    model: "",
    sessionId: "",
    messageCount: 0,
    thinking: false,
  });
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [projectInfo, setProjectInfo] = useState<ProjectInfo>({
    conventions: [],
    recurrent_errors: [],
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Flag : true quand l'app se démonte volontairement (cleanup useEffect).
  // Empêche ws.onclose de re-déclencher un reconnect inutile.
  const isUnmounting = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/status`);
      const data = await r.json();
      setStatus(s => ({
        ...s,
        ollama: data.ollama,
        libraryBrain: data.librarybrain?.up ?? false,
        model: data.model || s.model,
        backend: data.backend,
        mcpServerActive: data.mcp_server_active,
      }));
      setAvailableModels(data.models ?? []);
      if (data.project_info) {
        setProjectInfo(data.project_info);
      }
    } catch {
      setStatus(s => ({ ...s, ollama: false }));
    }
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/sessions`);
      setSessions(await r.json());
    } catch {}
  }, []);

  const fetchMemories = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/memories`);
      setMemories(await r.json());
    } catch {}
  }, []);

  const forgetMemory = useCallback(async (key: string) => {
    try {
      await fetch(`${API_BASE}/api/memories/${encodeURIComponent(key)}`, { method: "DELETE" });
      // Retrait optimiste immédiat…
      setMemories(prev => prev.filter(m => m.key !== key));
      // …puis réconciliation (le backend normalise la clé : casse/espaces).
      fetchMemories();
    } catch {}
  }, [fetchMemories]);

  const addMemory = useCallback(
    async (key: string, content: string, category: MemoryEntry["category"] = "context") => {
      try {
        const r = await fetch(`${API_BASE}/api/memories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, content, category }),
        });
        const data = (await r.json()) as { ok: boolean; message: string };
        fetchMemories();
        return data;
      } catch {
        return { ok: false, message: "Échec réseau (backend injoignable ?)" };
      }
    },
    [fetchMemories],
  );

  const fetchSkills = useCallback(async (): Promise<SkillEntry[]> => {
    try {
      const r = await fetch(`${API_BASE}/api/skills`);
      const data = (await r.json()) as SkillEntry[];
      setSkills(data);
      return data;
    } catch {
      return [];
    }
  }, []);

  // Message UI-only (retour de commande "/") — non envoyé au backend.
  const notify = useCallback((content: string) => {
    setMessages(prev => [...prev, { id: uid(), role: "assistant", content }]);
  }, []);

  const handleEvent = useCallback((event: Record<string, unknown>) => {
    switch (event.type) {
      case "session_init":
      case "session_loaded":
        setStatus(s => ({
          ...s,
          sessionId: event.session_id as string,
          model: (event.model as string) ?? s.model,
        }));
        if (event.messages) {
          const msgs = event.messages as Array<{ role: string; content: string }>;
          setMessages(msgs.map(m => ({
            id: uid(),
            role: m.role as MessageRole,
            content: m.content,
          })));
        }
        break;

      case "thinking":
        setStatus(s => ({ ...s, thinking: true }));
        break;

      case "token":
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.streaming) {
            return [
              ...prev.slice(0, -1),
              { ...last, content: last.content + (event.content as string) },
            ];
          }
          return [
            ...prev,
            { id: uid(), role: "assistant", content: event.content as string, streaming: true },
          ];
        });
        break;

      case "stream_end":
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.streaming) {
            return [...prev.slice(0, -1), { ...last, streaming: false }];
          }
          return prev;
        });
        setStatus(s => ({ ...s, thinking: false }));
        break;

      case "message_stats":
        // Attache les stats au dernier message assistant non-streaming
        setMessages(prev => {
          for (let i = prev.length - 1; i >= 0; i--) {
            if (prev[i].role === "assistant" && !prev[i].streaming) {
              const updated = [...prev];
              updated[i] = {
                ...prev[i],
                stats: {
                  latency_s: event.latency_s as number,
                  tokens: event.tokens as number,
                  model: event.model as string | undefined,
                },
              };
              return updated;
            }
          }
          return prev;
        });
        break;

      case "discard_stream":
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.streaming) {
            return prev.slice(0, -1);
          }
          return prev;
        });
        break;

      case "stream_trim":
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.streaming) {
            const trimmed = (event.content as string).trim();
            if (!trimmed) return prev.slice(0, -1);
            return [...prev.slice(0, -1), { ...last, content: trimmed, streaming: false }];
          }
          return prev;
        });
        setStatus(s => ({ ...s, thinking: false }));
        break;

      case "assistant":
        setStatus(s => ({ ...s, thinking: false }));
        setMessages(prev => [
          ...prev,
          { id: uid(), role: "assistant", content: event.content as string },
        ]);
        break;

      case "tool_call":
        setMessages(prev => [
          ...prev,
          {
            id: uid(),
            role: "tool_call",
            content: "",
            name: event.name as string,
            args: event.args as Record<string, unknown>,
          },
        ]);
        break;

      case "tool_result":
        setMessages(prev => [
          ...prev,
          {
            id: uid(),
            role: "tool_result",
            content: event.content as string,
            name: event.name as string,
          },
        ]);
        break;

      // ── v2 events ────────────────────────────────────────────────────
      case "router_decision":
        setMessages(prev => [
          ...prev,
          {
            id: uid(),
            role: "router",
            content: "",
            router: event.decision as RouterDecision,
          },
        ]);
        break;

      case "sandbox_check":
        setMessages(prev => [
          ...prev,
          {
            id: uid(),
            role: "sandbox",
            content: "",
            sandbox: event.check as SandboxCheck,
          },
        ]);
        break;

      case "best_of_n":
        setMessages(prev => [
          ...prev,
          {
            id: uid(),
            role: "best_of_n",
            content: "",
            bestOfN: event.result as BestOfNResult,
          },
        ]);
        break;

      case "conventions_loaded":
        setProjectInfo(prev => ({
          ...prev,
          conventions: (event.conventions as ProjectInfo["conventions"]) ?? [],
          workdir: event.workdir as string | undefined,
        }));
        break;

      case "recurrent_errors":
        setProjectInfo(prev => ({
          ...prev,
          recurrent_errors: (event.errors as ProjectInfo["recurrent_errors"]) ?? [],
        }));
        break;

      case "done":
        setStatus(s => ({ ...s, thinking: false }));
        fetchSessions();
        fetchMemories();
        break;

      case "error":
        setStatus(s => ({ ...s, thinking: false }));
        setMessages(prev => [
          ...prev,
          { id: uid(), role: "error", content: event.content as string },
        ]);
        break;

      case "status":
        setStatus(s => ({
          ...s,
          sessionId: event.session_id as string,
          model: (event.model as string) ?? s.model,
          messageCount: event.messages as number,
        }));
        break;

      case "model_changed":
        setStatus(s => ({ ...s, model: event.model as string }));
        break;
    }
  }, [fetchSessions, fetchMemories]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus(s => ({ ...s, connected: true }));
      fetchStatus();
      fetchSessions();
      fetchMemories();
    };

    ws.onclose = () => {
      setStatus(s => ({ ...s, connected: false, thinking: false }));
      // Ne reconnect PAS si l'app se démonte volontairement (cleanup useEffect)
      if (!isUnmounting.current) {
        reconnectTimer.current = setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => ws.close();

    ws.onmessage = (e) => {
      const event = JSON.parse(e.data);
      handleEvent(event);
    };
  }, [fetchStatus, fetchSessions, fetchMemories, handleEvent]);

  const sendMessage = useCallback((content: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setMessages(prev => [...prev, { id: uid(), role: "user", content }]);
    wsRef.current.send(JSON.stringify({ type: "chat", content }));
  }, []);

  const changeModel = useCallback((model: string) => {
    wsRef.current?.send(JSON.stringify({ type: "model_change", model }));
  }, []);

  const stopGeneration = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/stop`, { method: "POST" });
    } catch {}
    setStatus(s => ({ ...s, thinking: false }));
  }, []);

  const newSession = useCallback(() => {
    setMessages([]);
    wsRef.current?.send(JSON.stringify({ type: "session_new" }));
  }, []);

  const loadSession = useCallback((sessionId: string) => {
    wsRef.current?.send(JSON.stringify({ type: "session_load", session_id: sessionId }));
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await fetch(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
      setSessions(prev => prev.filter(s => s.id !== sessionId)); // retrait optimiste
      fetchSessions();
    } catch {}
  }, [fetchSessions]);

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    const t = title.trim();
    if (!t) return;
    try {
      await fetch(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t }),
      });
      setSessions(prev => prev.map(s => (s.id === sessionId ? { ...s, title: t } : s)));
      fetchSessions();
    } catch {}
  }, [fetchSessions]);

  useEffect(() => {
    isUnmounting.current = false;
    connect();
    const ping = setInterval(() => {
      wsRef.current?.send(JSON.stringify({ type: "ping" }));
      fetchStatus();
    }, 15000);

    return () => {
      isUnmounting.current = true;
      clearInterval(ping);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect, fetchStatus]);

  return {
    messages,
    status,
    sessions,
    availableModels,
    memories,
    skills,
    projectInfo,
    sendMessage,
    changeModel,
    newSession,
    loadSession,
    deleteSession,
    renameSession,
    stopGeneration,
    forgetMemory,
    addMemory,
    fetchSkills,
    notify,
  };
}

export interface MemoryEntry {
  key: string;
  content: string;
  category: "user" | "project" | "preference" | "context";
  updated_at: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  messages: number;
  modified: number;
  preview: string;
}

export interface SkillEntry {
  name: string;
  slug: string;
  description: string;
  content: string;
  updated: string;
}
