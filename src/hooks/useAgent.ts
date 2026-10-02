import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE, apiError, requestApi, mutateApi, readSessionValue, writeSessionValue } from "../api";
import type {
  RouterDecision,
  SandboxCheck,
  BestOfNResult,
  ProjectInfo,
  PreviewFeedback,
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
  | "best_of_n"
  | "skills"
  | "preview"
  | "approval"
  | "question";

export interface MessageStats {
  latency_s: number;
  tokens: number;
  prompt_tokens?: number;
  total_tokens?: number;
  context_window?: number;
  model?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  name?: string;
  args?: Record<string, unknown>;
  streaming?: boolean;
  // CoT (mode thinking) diffusé en direct AVANT la réponse — panneau « Raisonnement… »
  reasoning?: string;
  // Payloads v2 spécifiques (selon role)
  router?: RouterDecision;
  sandbox?: SandboxCheck;
  bestOfN?: BestOfNResult;
  stats?: MessageStats;
  skills?: string[];
  previewFeedback?: PreviewFeedback;
  // Images jointes par l'utilisateur (vision B-lite) — chemins serveur sous _uploads
  imagePaths?: string[];
  // Approbation humaine (human-in-the-loop) — role "approval"
  approvalId?: string;
  approvalState?: "pending" | "approved" | "denied" | "timeout";
  questionId?: string;
  questionOptions?: string[];
  allowFreeText?: boolean;
  questionState?: "pending" | "answered" | "timeout";
  answer?: string;
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
  contextTokens?: number;
  contextWindow?: number;
}

const WS_URL = "ws://127.0.0.1:8000/api/ws";

// Le backend a un mode de panne « hung, pas down » : le process garde la socket
// :8000 en LISTEN mais n'accepte plus les connexions. Le noyau complète seul le
// handshake TCP depuis le backlog → tout *paraît* joignable, mais rien ne répond
// jamais. Sans borne de temps explicite, un fetch et un WebSocket restent en
// attente indéfiniment au lieu d'échouer : c'est ce qui cassait la reconnexion
// automatique. Ces deux timeouts sont ce qui transforme « pend » en « échoue »,
// seul état depuis lequel le retry peut repartir.
const HTTP_TIMEOUT_MS = 5000;
// Plus permissif que HTTP : sous forte charge MLX le handshake ws peut traîner.
// Reste très en deçà du cycle de relance du watchdog backend (~2 min), donc on
// re-tente plusieurs fois avant que l'API ne redevienne saine.
const WS_OPEN_TIMEOUT_MS = 8000;

let msgCounter = 0;
const uid = () => `m${++msgCounter}`;

export function useAgent() {
  const [operationError, setOperationError] = useState<string | null>(null);
  const dismissOperationError = useCallback(() => setOperationError(null), []);
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
  const runActiveRef = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Flag : true quand l'app se démonte volontairement (cleanup useEffect).
  // Empêche ws.onclose de re-déclencher un reconnect inutile.
  const isUnmounting = useRef(false);
  // Nombre de tentatives de reconnexion WS échouées d'affilée (remis à 0 dès
  // qu'une connexion aboutit). Retry toutes les 3 s → sert d'horloge grossière
  // de la durée de coupure : l'UI reste sobre tant que la relance auto du
  // backend (LaunchAgent, ThrottleInterval 30 s + reload MLX) peut aboutir, et
  // n'escalade vers la commande manuelle qu'au-delà.
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  // Session dont on a demandé la reprise auto au (re)connect ws. Sert à
  // distinguer un échec de reprise (session absente côté backend après un
  // redémarrage) d'une vraie erreur agent : le 1er `error` reçu tant que cette
  // ref est armée purge l'id périmé et retombe sur l'accueil, sans polluer le
  // fil. Remise à null dès qu'une session est établie (session_init/loaded).
  const pendingResumeRef = useRef<string | null>(null);
  const resumeFallbackRef = useRef<Record<string, unknown> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await requestApi("/api/status", {
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      const data = await r.json();
      setStatus(s => ({
        ...s,
        ollama: data.ollama,
        libraryBrain: data.librarybrain?.up ?? false,
        // NE PAS écraser `model` ici : le modèle sélectionné/épinglé est un état
        // PAR CONNEXION WS (session_init / model_changed en sont la source de
        // vérité). /api/status est HTTP stateless et renvoie config.LLM_MODEL
        // (le brain) → ce poll périodique (15 s) réécrasait le pin manuel, d'où
        // « le modèle change tout seul au bout de quelques secondes ».
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
      // `filter=all` : actives + archivées en un seul appel — la sidebar les
      // ventile via le drapeau `archived`. Le backend borne à 50 par vue.
      const r = await requestApi("/api/sessions?filter=all");
      const data = await r.json();
      if (!Array.isArray(data)) throw new Error("Liste de sessions invalide.");
      setSessions(data);
    } catch (error) { setOperationError(`Sessions : ${apiError(error)}`); }
  }, []);

  const fetchMemories = useCallback(async () => {
    try {
      const r = await requestApi("/api/memories");
      const data = await r.json();
      if (!Array.isArray(data)) throw new Error("Liste de souvenirs invalide.");
      setMemories(data);
    } catch (error) { setOperationError(`Mémoire : ${apiError(error)}`); }
  }, []);

  const forgetMemory = useCallback(async (key: string) => {
    try {
      await mutateApi(`/api/memories/${encodeURIComponent(key)}`, { method: "DELETE" });
      // Retrait après confirmation…
      setMemories(prev => prev.filter(m => m.key !== key));
      // …puis réconciliation (le backend normalise la clé : casse/espaces).
      fetchMemories();
      return true;
    } catch (error) { setOperationError(`Oubli impossible : ${apiError(error)}`); return false; }
  }, [fetchMemories]);

  const addMemory = useCallback(
    async (key: string, content: string, category: MemoryEntry["category"] = "context") => {
      try {
        const r = await requestApi("/api/memories", {
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
      const r = await requestApi("/api/skills");
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
        // La session provisoire du handshake ne remplace pas la session en
        // cours de reprise : une seconde coupure doit retenter le même id.
        if (event.type === "session_init" && pendingResumeRef.current) {
          resumeFallbackRef.current = event;
          break;
        }
        // session_loaded = reprise réussie → on désarme. session_init est émis à
        // CHAQUE (re)connexion (session neuve par défaut) AVANT le résultat du
        // session_load de reprise : ne PAS désarmer ici, sinon l'échec de reprise
        // qui suit ne serait plus reconnu et l'erreur brute s'afficherait.
        if (event.type === "session_loaded") {
          pendingResumeRef.current = null;
          resumeFallbackRef.current = null;
        }
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
        runActiveRef.current = true;
        setStatus(s => ({ ...s, thinking: true }));
        break;

      case "reasoning":
        // CoT (mode thinking) diffusé en direct : on l'accumule sur le message
        // assistant en cours (panneau « Raisonnement… »). Le 1er `token` ajoutera
        // ensuite le `content` sur LA MÊME bulle. Évite l'écran figé pendant le CoT.
        setStatus(s => ({ ...s, thinking: true }));
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.streaming) {
            return [
              ...prev.slice(0, -1),
              { ...last, reasoning: (last.reasoning ?? "") + (event.content as string) },
            ];
          }
          return [
            ...prev,
            {
              id: uid(),
              role: "assistant",
              content: "",
              streaming: true,
              reasoning: event.content as string,
            },
          ];
        });
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

      case "message_stats": {
        const stats: MessageStats = {
          latency_s: event.latency_s as number,
          tokens: event.tokens as number,
          prompt_tokens: event.prompt_tokens as number | undefined,
          total_tokens: event.total_tokens as number | undefined,
          context_window: event.context_window as number | undefined,
          model: event.model as string | undefined,
        };
        // Attache les stats au dernier message assistant non-streaming
        setMessages(prev => {
          for (let i = prev.length - 1; i >= 0; i--) {
            if (prev[i].role === "assistant" && !prev[i].streaming) {
              const updated = [...prev];
              updated[i] = { ...prev[i], stats };
              return updated;
            }
          }
          return prev;
        });
        // Jauge de contexte : total_tokens du dernier tour ≈ contexte du prochain
        if (stats.total_tokens && stats.context_window) {
          setStatus(s => ({ ...s, contextTokens: stats.total_tokens, contextWindow: stats.context_window }));
        }
        break;
      }

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

      // ── Approbation humaine (human-in-the-loop) ──────────────────────
      case "approval_request":
        runActiveRef.current = true;
        // L'agent attend ta décision : on coupe le spinner et on affiche la carte.
        setStatus(s => ({ ...s, thinking: false }));
        setMessages(prev => [
          ...prev,
          {
            id: uid(),
            role: "approval",
            content: (event.reason as string) ?? "",
            name: event.name as string,
            args: event.args as Record<string, unknown>,
            approvalId: event.id as string,
            approvalState: "pending",
          },
        ]);
        break;

      case "approval_timeout":
        setMessages(prev =>
          prev.map(m =>
            m.approvalId === (event.id as string) && m.approvalState === "pending"
              ? { ...m, approvalState: "timeout" }
              : m,
          ),
        );
        break;

      case "question_request":
        if (typeof event.id !== "string" || typeof event.question !== "string") break;
        runActiveRef.current = true;
        setStatus(s => ({ ...s, thinking: false }));
        setMessages(prev => [...prev, {
          id: uid(), role: "question", content: event.question as string,
          questionId: event.id as string,
          questionOptions: Array.isArray(event.options) ? event.options.filter((o): o is string => typeof o === "string") : [],
          allowFreeText: event.allow_free_text !== false,
          questionState: "pending",
        }]);
        break;

      case "question_timeout":
        setMessages(prev => prev.map(m => m.questionId === event.id && m.questionState === "pending"
          ? { ...m, questionState: "timeout" } : m));
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

      case "skills_used":
        setMessages(prev => [
          ...prev,
          { id: uid(), role: "skills", content: "", skills: event.skills as string[] },
        ]);
        break;

      case "preview_feedback":
        setMessages(prev => [
          ...prev,
          {
            id: uid(),
            role: "preview",
            content: "",
            previewFeedback: {
              url: event.url as string,
              count: event.count as number,
              attempt: event.attempt as number,
              max: event.max as number,
              errors: (event.errors as PreviewFeedback["errors"]) ?? [],
            },
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
        runActiveRef.current = false;
        setStatus(s => ({ ...s, thinking: false }));
        fetchSessions();
        fetchMemories();
        break;

      case "error":
        runActiveRef.current = false;
        // Reprise auto échouée : la session persistée n'existe plus côté backend
        // (redémarré / purgée). Le serveur a déjà émis un `session_init` neuf à la
        // connexion (sessionStorage s'auto-répare via l'effet ci-dessous), donc on
        // ignore juste l'erreur brute au lieu de polluer le fil.
        if (pendingResumeRef.current) {
          pendingResumeRef.current = null;
          const fallback = resumeFallbackRef.current;
          resumeFallbackRef.current = null;
          if (fallback) {
            setStatus(s => ({ ...s, thinking: false, sessionId: fallback.session_id as string }));
            setMessages([]);
          }
          setOperationError("La session précédente est introuvable. Une nouvelle session est ouverte.");
          break;
        }
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

  // Persiste la session active dans sessionStorage : survit à un reload du
  // webview ET à une reconnexion ws, mais est vidée à la fermeture complète de
  // l'app → un lancement neuf repart vierge (pas de reprise intempestive).
  useEffect(() => {
    if (status.sessionId) writeSessionValue("klody_active_session", status.sessionId);
  }, [status.sessionId]);

  const connect = useCallback(() => {
    // On sort aussi sur CONNECTING : contre un backend hung une socket peut
    // rester bloquée là plusieurs minutes, et sans ce garde chaque retry en
    // empilait une nouvelle (fuite, et wsRef qui perd la trace des précédentes).
    // Le watchdog ci-dessous garantit qu'un CONNECTING se résout toujours, donc
    // ce garde ne peut pas bloquer la reconnexion durablement.
    const current = wsRef.current?.readyState;
    if (current === WebSocket.OPEN || current === WebSocket.CONNECTING) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    // Chien de garde d'ouverture. C'est `onclose` qui arme le retry 3 s — or
    // face à un backend hung le handshake d'upgrade n'aboutit jamais et AUCUN
    // événement ne part : ni onopen, ni onerror, ni onclose (le navigateur
    // n'impose pas de timeout de handshake). La boucle de reconnexion mourait
    // donc silencieusement, socket figée en CONNECTING. Ce close() forcé est ce
    // qui produit le onclose manquant et relance le cycle.
    const openWatchdog = setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) ws.close();
    }, WS_OPEN_TIMEOUT_MS);

    ws.onopen = () => {
      clearTimeout(openWatchdog);
      if (wsRef.current !== ws || isUnmounting.current) return;
      // Reprise d'une session active (reconnexion ws OU reload du webview sous
      // forte charge MLX) : le backend recrée une mémoire VIDE à chaque
      // connexion → on lui renvoie session_load pour restaurer l'historique
      // (persisté à chaque tour côté serveur). sessionStorage est null au tout
      // premier lancement → pas de reprise, on garde l'écran d'accueil vierge.
      const resume = readSessionValue("klody_active_session");
      if (resume) {
        pendingResumeRef.current = resume;
        ws.send(JSON.stringify({ type: "session_load", session_id: resume }));
      }
      setStatus(s => ({ ...s, connected: true }));
      setReconnectAttempts(0);
      fetchStatus();
      fetchSessions();
      fetchMemories();
    };

    ws.onclose = () => {
      clearTimeout(openWatchdog);
      if (wsRef.current !== ws || isUnmounting.current) return;
      setStatus(s => ({ ...s, connected: false, thinking: false }));
      runActiveRef.current = false;
      setMessages(prev => prev.map(m => ({
        ...m, streaming: false,
        approvalState: m.approvalState === "pending" ? "timeout" : m.approvalState,
        questionState: m.questionState === "pending" ? "timeout" : m.questionState,
      })));
      // Ne reconnect PAS si l'app se démonte volontairement (cleanup useEffect)
      if (!isUnmounting.current) {
        setReconnectAttempts(n => n + 1);
        reconnectTimer.current = setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => ws.close();

    ws.onmessage = (e) => {
      if (wsRef.current !== ws || isUnmounting.current) return;
      try {
        const event = JSON.parse(e.data);
        if (!event || typeof event !== "object" || typeof event.type !== "string") throw new Error();
        handleEvent(event);
      } catch {
        setOperationError("Événement du serveur illisible. La connexion reste ouverte.");
      }
    };
  }, [fetchStatus, fetchSessions, fetchMemories, handleEvent]);

  // Upload d'une image vers le backend (vision B-lite). Renvoie le chemin serveur
  // (_uploads) à joindre au prochain message chat dans `image_paths`. Pas de header
  // Content-Type : le navigateur pose la frontière multipart lui-même.
  const uploadImage = useCallback(async (file: File): Promise<{ name: string; path: string }> => {
    const form = new FormData();
    form.append("file", file);
    const r = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: form, signal: AbortSignal.timeout(60000) });
    if (!r.ok) {
      let detail = `HTTP ${r.status}`;
      try { detail = (await r.json()).detail || detail; } catch { /* corps non-JSON */ }
      throw new Error(detail);
    }
    const body = await r.json();
    if (typeof body.path !== "string" || !body.path) throw new Error("Le serveur n'a pas confirmé l'image.");
    return { name: file.name, path: body.path as string };
  }, []);

  const sendControl = useCallback((payload: Record<string, unknown>): boolean => {
    if (pendingResumeRef.current) {
      setOperationError("Reprise de la session en cours. Ton message reste dans le brouillon.");
      return false;
    }
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setOperationError("Connexion interrompue. L'action n'a pas été envoyée.");
      return false;
    }
    try {
      ws.send(JSON.stringify(payload));
      setOperationError(null);
      return true;
    } catch {
      setOperationError("Envoi impossible. Réessaie après la reconnexion.");
      return false;
    }
  }, []);

  const respondQuestion = useCallback((id: string, answer: string): boolean => {
    if (!answer.trim() || !sendControl({ type: "question_response", id, answer: answer.trim() })) return false;
    setMessages(prev => prev.map(m => m.questionId === id && m.questionState === "pending"
      ? { ...m, questionState: "answered", answer: answer.trim() } : m));
    setStatus(s => ({ ...s, thinking: true }));
    return true;
  }, [sendControl]);

  const sendMessage = useCallback((content: string, imagePaths?: string[]) => {
    const question = messages.find(m => m.questionState === "pending");
    if (question) {
      if (imagePaths?.length || !question.allowFreeText) {
        setOperationError("Utilise les choix de la question en cours ; les images restent jointes au brouillon.");
        return false;
      }
      return respondQuestion(question.questionId!, content);
    }
    const imgs = imagePaths && imagePaths.length ? imagePaths : undefined;
    const payload: { type: string; content: string; image_paths?: string[] } = { type: "chat", content };
    if (imgs) payload.image_paths = imgs;
    if (!sendControl(payload)) return false;
    runActiveRef.current = true;
    setMessages(prev => [...prev, { id: uid(), role: "user", content, imagePaths: imgs }]);
    return true;
  }, [sendControl, respondQuestion, messages]);

  const changeModel = useCallback((model: string) => {
    sendControl({ type: "model_change", model });
  }, [sendControl]);

  const stopGeneration = useCallback(async () => {
    try {
      await mutateApi("/api/stop", { method: "POST" });
      // Le POST confirme la demande d'arrêt ; seul `done` confirme que le
      // serveur accepte un changement de session après son tour en cours.
      setStatus(s => ({ ...s, thinking: false }));
      setMessages(prev => prev.map(m => ({ ...m, streaming: false,
        questionState: m.questionState === "pending" ? "timeout" : m.questionState,
        approvalState: m.approvalState === "pending" ? "timeout" : m.approvalState,
      })));
    } catch (error) { setOperationError(`Arrêt non confirmé : ${apiError(error)}`); }
  }, []);

  // Réponse à une demande d'approbation (human-in-the-loop) : débloque le
  // thread orchestrator côté backend et marque la carte comme résolue.
  const respondApproval = useCallback((id: string, approved: boolean) => {
    if (!sendControl({ type: "approval_response", id, approved })) return;
    setMessages(prev =>
      prev.map(m =>
        m.approvalId === id && m.approvalState === "pending"
          ? { ...m, approvalState: approved ? "approved" : "denied" }
          : m,
      ),
    );
    // Si autorisé, l'agent reprend (exécute l'action) → on réaffiche le spinner.
    if (approved) setStatus(s => ({ ...s, thinking: true }));
  }, [sendControl]);



  const newSession = useCallback(() => {
    if (runActiveRef.current) {
      setOperationError("Attends la fin du tour avant de changer de session. Tu peux répondre à la demande ou demander l'arrêt.");
      return;
    }
    if (!sendControl({ type: "session_new" })) return;
    setMessages([]);
  }, [sendControl]);

  const loadSession = useCallback((sessionId: string) => {
    if (runActiveRef.current) {
      setOperationError("Attends la fin du tour avant de changer de session. Tu peux répondre à la demande ou demander l'arrêt.");
      return;
    }
    sendControl({ type: "session_load", session_id: sessionId });
  }, [sendControl]);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await mutateApi(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      fetchSessions();
    } catch (error) { setOperationError(`Session non modifiée : ${apiError(error)}`); }
  }, [fetchSessions]);

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    const t = title.trim();
    if (!t) return;
    try {
      const result = await mutateApi(`/api/sessions/${encodeURIComponent(sessionId)}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t }),
      });
      setSessions(prev => prev.map(s => (s.id === sessionId ? { ...s, title: typeof result.title === "string" ? result.title : t } : s)));
      fetchSessions();
    } catch (error) { setOperationError(`Session non modifiée : ${apiError(error)}`); }
  }, [fetchSessions]);

  // Archive (range) ou désarchive (réactive) une session. Elle reste sur disque
  // et chargeable → « réutiliser » = simplement la recharger. Mise à jour
  // du drapeau après confirmation, puis réconciliation.
  const archiveSession = useCallback(async (sessionId: string, archived: boolean) => {
    try {
      await mutateApi(`/api/sessions/${encodeURIComponent(sessionId)}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      setSessions(prev => prev.map(s => (s.id === sessionId ? { ...s, archived } : s)));
      fetchSessions();
    } catch (error) { setOperationError(`Session non modifiée : ${apiError(error)}`); }
  }, [fetchSessions]);

  useEffect(() => {
    isUnmounting.current = false;
    connect();
    const ping = setInterval(() => {
      // send() sur une socket en CONNECTING lève InvalidStateError — ce qui
      // faisait sauter le fetchStatus() suivant à CHAQUE tick tant que la
      // connexion était figée, juste au moment où l'on a le plus besoin de
      // savoir où en est le backend. On ne parle qu'à une socket ouverte ;
      // la sonde de statut, elle, tourne dans tous les cas.
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
      fetchStatus();
    }, 15000);

    return () => {
      isUnmounting.current = true;
      clearInterval(ping);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
    };
  }, [connect, fetchStatus]);

  return {
    messages,
    status,
    reconnectAttempts,
    sessions,
    availableModels,
    memories,
    skills,
    projectInfo,
    sendMessage,
    uploadImage,
    changeModel,
    newSession,
    loadSession,
    deleteSession,
    renameSession,
    archiveSession,
    stopGeneration,
    respondApproval,
    respondQuestion,
    operationError,
    dismissOperationError,
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
  archived: boolean;
}

export interface SkillEntry {
  name: string;
  slug: string;
  description: string;
  content: string;
  updated: string;
}
