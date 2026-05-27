/**
 * Smoke E2E : l'app boot, le header est rendu, et le WS de fond
 * effectue son handshake (l'app reçoit un session_init).
 *
 * Aucune dépendance sur un backend réel : tout est mocké.
 */
import { test, expect } from "@playwright/test";
import { installFakeWebSocket, stubRest, waitForWsReady, emitWs, expectHeaderVisible } from "./fixtures";

test.describe("smoke", () => {
  test.beforeEach(async ({ page }) => {
    await installFakeWebSocket(page);
    await stubRest(page);
  });

  test("app boot + header rendu + WS connecte", async ({ page }) => {
    await page.goto("/");
    await expectHeaderVisible(page);

    // Le WS doit avoir été instancié (côté hook useAgent)
    await waitForWsReady(page);

    // L'overlay "Backend déconnecté" ne doit PAS être visible (onopen tiré)
    await expect(page.getByRole("alert").filter({ hasText: "Backend déconnecté" })).toHaveCount(0);

    // L'écran vide affiche le wordmark XXL + le hint
    await expect(page.getByText("Nouvelle session — décris ta tâche")).toBeVisible();
  });

  test("bandeau 'Backend déconnecté' apparaît quand le WS ferme", async ({ page }) => {
    await page.goto("/");
    await waitForWsReady(page);

    // Force la fermeture du fake WS
    await page.evaluate(() => (window as any).__fakeWS.close());

    // L'app passe en status.connected=false → bandeau d'alerte rouge
    await expect(page.getByRole("alert").filter({ hasText: "Backend déconnecté" })).toBeVisible();
  });

  test("session_init reçu → message vide écran d'accueil", async ({ page }) => {
    await page.goto("/");
    await waitForWsReady(page);

    await emitWs(page, {
      type: "session_init",
      session_id: "sess-smoke-1",
      model: "qwen2.5-coder:32b",
      messages: [],
    });

    // Pas de messages → écran d'accueil reste visible
    await expect(page.getByText("Nouvelle session — décris ta tâche")).toBeVisible();
  });
});
