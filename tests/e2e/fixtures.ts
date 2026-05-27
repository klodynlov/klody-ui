/**
 * Helpers Playwright pour stub le backend Klody (REST + WebSocket).
 *
 * Pourquoi stuber : les tests E2E doivent tourner en CI sans MLX/Ollama. On
 * mock le `/api/*` REST via page.route() et on remplace `window.WebSocket`
 * par un fake qui rejoue des events scriptés.
 *
 * Pas d'invasion du code prod — tout passe par les hooks `init script` de
 * Playwright avant l'exécution du bundle React.
 */
import { Page, expect } from "@playwright/test";

export const API_BASE = "http://127.0.0.1:8000";
export const WS_URL = "ws://127.0.0.1:8000/api/ws";

export type WSEvent = Record<string, unknown>;

/** Mock REST `/api/status`, `/api/sessions`, `/api/memories`. */
export async function stubRest(page: Page, opts: {
  backend?: "ollama" | "mlx";
  model?: string;
  ollama?: boolean;
  libraryBrainUp?: boolean;
  mcpActive?: boolean;
  sessions?: Array<{ id: string; title: string; messages: number; modified: number; preview: string }>;
  memories?: Array<{ key: string; content: string; category: string; updated_at: string }>;
} = {}) {
  const status = {
    ollama: opts.ollama ?? true,
    librarybrain: { up: opts.libraryBrainUp ?? false },
    model: opts.model ?? "mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit-dwq-v2",
    backend: opts.backend ?? "mlx",
    mcp_server_active: opts.mcpActive ?? true,
    models: [
      "mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit-dwq-v2",
      "qwen2.5-coder:32b",
    ],
    project_info: { conventions: [], recurrent_errors: [] },
  };

  await page.route(`${API_BASE}/api/status`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(status) })
  );
  await page.route(`${API_BASE}/api/sessions`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(opts.sessions ?? []) })
  );
  await page.route(`${API_BASE}/api/memories`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(opts.memories ?? []) })
  );
  await page.route(`${API_BASE}/api/stop`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' })
  );
}

/**
 * Remplace `window.WebSocket` par un fake AVANT l'exécution du bundle.
 * Le fake expose `window.__fakeWS` pour scripter les events depuis les tests.
 */
export async function installFakeWebSocket(page: Page) {
  await page.addInitScript(() => {
    type Listener = (ev: { data: string }) => void;

    interface FakeWS {
      send(data: string): void;
      emit(event: Record<string, unknown>): void;
      close(): void;
      readonly sent: string[];
      readonly url: string;
      readyState: number;
    }

    const OPEN = 1;
    const CLOSING = 2;
    const CLOSED = 3;

    class FakeWebSocket implements FakeWS {
      readonly url: string;
      readyState = OPEN;
      readonly sent: string[] = [];
      onopen: (() => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onmessage: Listener | null = null;

      constructor(url: string) {
        this.url = url;
        (window as any).__fakeWS = this;
        // Simule open async (comme le vrai WS) sur next tick
        setTimeout(() => {
          if (this.readyState === OPEN && this.onopen) this.onopen();
        }, 0);
      }

      send(data: string) {
        this.sent.push(data);
        // Auto-réponse à `session_new` (l'app attend session_init)
        try {
          const parsed = JSON.parse(data);
          if (parsed?.type === "session_new") {
            queueMicrotask(() => {
              this.emit({
                type: "session_init",
                session_id: `sess-${Math.random().toString(36).slice(2, 8)}`,
                model: "mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit-dwq-v2",
                messages: [],
              });
            });
          }
        } catch { /* noop — ping et autres */ }
      }

      emit(event: Record<string, unknown>) {
        if (this.readyState !== OPEN || !this.onmessage) return;
        this.onmessage({ data: JSON.stringify(event) });
      }

      close() {
        this.readyState = CLOSING;
        setTimeout(() => {
          this.readyState = CLOSED;
          this.onclose?.();
        }, 0);
      }

      addEventListener(_t: string, _h: any) { /* no-op pour compat */ }
      removeEventListener(_t: string, _h: any) { /* no-op pour compat */ }

      // Constants WebSocket
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;
    }

    // Remplace globalement.
    (window as any).WebSocket = FakeWebSocket;
  });
}

/** Émet un event WS depuis le test (côté Page). */
export async function emitWs(page: Page, event: WSEvent) {
  await page.evaluate((ev) => {
    (window as any).__fakeWS?.emit(ev);
  }, event);
}

/** Récupère les messages envoyés par l'app au WS (parsés). */
export async function getWsSent(page: Page): Promise<WSEvent[]> {
  return await page.evaluate(() => {
    const raw: string[] = (window as any).__fakeWS?.sent ?? [];
    return raw.map((s) => {
      try { return JSON.parse(s); } catch { return { _raw: s }; }
    });
  });
}

/** Attend que `__fakeWS` soit installé (post-mount React). */
export async function waitForWsReady(page: Page) {
  await page.waitForFunction(() => Boolean((window as any).__fakeWS));
}

/** Aide visuelle : vérifie que le header est rendu (smoke). */
export async function expectHeaderVisible(page: Page) {
  await expect(page.getByText("Klody", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Nouvelle/i })).toBeVisible();
}
