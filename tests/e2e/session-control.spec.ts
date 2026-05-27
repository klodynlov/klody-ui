/**
 * Golden path 2 : contrôle de session.
 * - Nouvelle session (bouton + Cmd+K) vide la conversation
 * - Stop generation pendant thinking arrête le spinner
 */
import { test, expect } from "@playwright/test";
import { installFakeWebSocket, stubRest, waitForWsReady, emitWs, getWsSent } from "./fixtures";

test.describe("session control", () => {
  test.beforeEach(async ({ page }) => {
    await installFakeWebSocket(page);
    await stubRest(page);
    await page.goto("/");
    await waitForWsReady(page);
  });

  test("bouton 'Nouvelle' efface les messages et émet session_new", async ({ page }) => {
    // Envoie un message d'abord
    const textarea = page.getByPlaceholder(/Message…/);
    await textarea.fill("ping");
    await textarea.press("Enter");
    await emitWs(page, { type: "token", content: "pong" });
    await emitWs(page, { type: "stream_end" });
    await emitWs(page, { type: "done" });

    await expect(page.getByText("ping")).toBeVisible();
    await expect(page.getByText("pong")).toBeVisible();

    // Clic Nouvelle
    await page.getByRole("button", { name: /Nouvelle/i }).click();

    // L'UI vide les messages immédiatement
    await expect(page.getByText("ping")).toHaveCount(0);
    await expect(page.getByText("pong")).toHaveCount(0);
    await expect(page.getByText("Nouvelle session — décris ta tâche")).toBeVisible();

    // Et a envoyé session_new au WS
    const sent = await getWsSent(page);
    expect(sent.some((m) => m.type === "session_new")).toBe(true);
  });

  test("Cmd+K déclenche aussi 'Nouvelle session'", async ({ page }) => {
    const textarea = page.getByPlaceholder(/Message…/);
    await textarea.fill("salut");
    await textarea.press("Enter");
    await expect(page.getByText("salut")).toBeVisible();

    // Cmd+K (Mac) — Playwright accepte "Meta"
    await page.keyboard.press("Meta+k");

    await expect(page.getByText("salut")).toHaveCount(0);

    const sent = await getWsSent(page);
    // Au moins un session_new après le chat initial
    const sessionNews = sent.filter((m) => m.type === "session_new");
    expect(sessionNews.length).toBeGreaterThanOrEqual(1);
  });

  test("Stop pendant thinking arrête le spinner et envoie POST /api/stop", async ({ page }) => {
    const stopHits: string[] = [];
    await page.route("http://127.0.0.1:8000/api/stop", (route) => {
      stopHits.push(route.request().method());
      route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    });

    const textarea = page.getByPlaceholder(/Message…/);
    await textarea.fill("calcule pi sur 1000 chiffres");
    await textarea.press("Enter");

    // Backend dit "je réfléchis"
    await emitWs(page, { type: "thinking" });
    await expect(page.getByText("Klody réfléchit…")).toBeVisible();

    // Bouton Stop (carré rouge ■) — title="Arrêter la génération"
    const stopBtn = page.getByTitle("Arrêter la génération");
    await expect(stopBtn).toBeVisible();
    await stopBtn.click();

    // L'indicateur disparaît
    await expect(page.getByText("Klody réfléchit…")).toHaveCount(0);

    // POST /api/stop a été appelé
    await expect.poll(() => stopHits.length).toBeGreaterThanOrEqual(1);
    expect(stopHits[0]).toBe("POST");
  });

  test("erreur reçue → message rouge avec avatar !", async ({ page }) => {
    const textarea = page.getByPlaceholder(/Message…/);
    await textarea.fill("boom");
    await textarea.press("Enter");

    await emitWs(page, { type: "error", content: "MLX timeout après 60s" });

    await expect(page.getByText(/Erreur/).first()).toBeVisible();
    await expect(page.getByText(/MLX timeout après 60s/)).toBeVisible();
  });
});
