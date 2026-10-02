export const API_BASE = "http://127.0.0.1:8000";

/** Une réponse HTTP en erreur n'est jamais une opération réussie. */
export async function requestApi(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Le serveur a refusé l'opération (HTTP ${response.status}).`);
  return response;
}

/** L'API historique peut aussi refuser avec HTTP 200 et {ok: false}. */
export async function mutateApi(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await requestApi(path, init);
  const result = await response.json();
  if (!result || result.ok !== true) throw new Error("L'opération n'a pas été confirmée par le serveur.");
  return result;
}

export function apiError(error: unknown): string {
  if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "Le serveur n'a pas répondu à temps. Vérifie l'état avant de réessayer.";
  }
  return error instanceof Error ? error.message : "Connexion au serveur impossible.";
}

// Le stockage peut être refusé par le webview ; cela ne doit pas bloquer le chat.
export function readSessionValue(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

export function writeSessionValue(key: string, value: string): void {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch { /* Le contenu reste utilisable en mémoire si le quota est épuisé. */ }
}
