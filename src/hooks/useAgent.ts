import { useCallback, useEffect, useRef, useState } from "react";

export type MessageRole = "user" | "assistant" | "tool_call" | "tool_result" | "thinking" | "error";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  name?: string;
  args?: Record<string, unknown>;
  streaming?: boolean;
}

export interface AgentStatus {
  connected: boolean;
  ollama: boolean;
  libraryBrain: boolean;
  model: string;
  sessionId: string;
  messageCount: number;
  thinking: boolean;
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
    model: "qwen2.5-coder:32b",
    sessionId: "",
    messageCount: 0,
    thinking: false,
  });
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus(s => ({ ...s, connected: true }));
      fetchStatus();
      fetchSessions();
    };

    ws.onclose = () => {
      setStatus(s => ({ ...s, connected: false, thinking: false }));
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();

    ws.onmessage = (e) => {
      const event = JSON.parse(e.data);
      handleEvent(event);
    };
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
          // Accumuler dans le message streaming en cours, ou en créer un
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
        // Texte + JSON mélangés : garder uniquement la partie texte
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

      case "done":
        setStatus(s => ({ ...s, thinking: false }));
        fetchSessions();
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
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/status`);
      const data = await r.json();
      setStatus(s => ({
        ...s,
        ollama: data.ollama,
        libraryBrain: data.librarybrain?.up ?? false,
        model: data.model,
      }));
      setAvailableModels(data.models ?? []);
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

  useEffect(() => {
    connect();
    const ping = setInterval(() => {
      wsRef.current?.send(JSON.stringify({ type: "ping" }));
      fetchStatus();
    }, 15000);

    return () => {
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
    sendMessage,
    changeModel,
    newSession,
    loadSession,
    stopGeneration,
  };
}

export interface SessionSummary {
  id: string;
  title: string;
  messages: number;
  modified: number;
  preview: string;
}
