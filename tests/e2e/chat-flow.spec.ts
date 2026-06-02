/**
 * Golden path 1 : saisie + envoi + streaming + tool_call + tool_result.
 *
 * Mime un cycle complet d'agent : l'utilisateur tape une demande,
 * Klody stream sa réponse, appelle un outil (write_file), reçoit le
 * résultat, et finit par un `done`.
 */
import { test, expect } from "@playwright/test";
import { installFakeWebSocket, stubRest, waitForWsReady, emitWs, getWsSent } from "./fixtures";

test.describe("chat flow", () => {
  test.beforeEach(async ({ page }) => {
    await installFakeWebSocket(page);
    await stubRest(page);
    await page.goto("/");
    await waitForWsReady(page);
  });

  test("user envoie un message → tokens streamés → assistant rendu + stats", async ({ page }) => {
    const textarea = page.getByPlaceholder(/Message…/);
    await textarea.fill("Écris un hello world en Python");
    await textarea.press("Enter");

    // 1. Le message user apparaît côté UI
    await expect(page.getByText("Écris un hello world en Python")).toBeVisible();
    await expect(page.getByText("Vous", { exact: true })).toBeVisible();

    // 2. Le hook a envoyé `chat` au WS
    const sent = await getWsSent(page);
    const chatMsg = sent.find((m) => m.type === "chat");
    expect(chatMsg).toBeDefined();
    expect(chatMsg!.content).toBe("Écris un hello world en Python");

    // 3. Backend stream les tokens
    await emitWs(page, { type: "thinking" });
    await emitWs(page, { type: "token", content: "Voici " });
    await emitWs(page, { type: "token", content: "le code :\n\n" });
    await emitWs(page, { type: "token", content: "```python\nprint('hello')\n```" });
    await emitWs(page, { type: "stream_end" });

    // Markdown + bloc de code rendus
    await expect(page.getByText(/Voici le code/)).toBeVisible();
    await expect(page.getByText("print('hello')")).toBeVisible();
    // Le bouton "Copier" du bloc de code est rendu
    await expect(page.getByRole("button", { name: /Copier/i }).first()).toBeVisible();

    // 4. Stats latency/tokens — format réel : « ⏱ 2.3s · 128 tok »
    await emitWs(page, {
      type: "message_stats",
      latency_s: 2.3,
      tokens: 128,
      model: "qwen2.5-coder:32b",
    });
    const stats = page.getByTestId("message-stats");
    await expect(stats).toBeVisible();
    await expect(stats).toContainText("2.3s");
    await expect(stats).toContainText("128 tok");

    // 5. done → thinking false
    await emitWs(page, { type: "done" });
  });

  test("tool_call write_file + tool_result rendus", async ({ page }) => {
    const textarea = page.getByPlaceholder(/Message…/);
    await textarea.fill("Crée hello.py");
    await textarea.press("Enter");

    await emitWs(page, {
      type: "tool_call",
      name: "write_file",
      args: { path: "hello.py", content: "print('hello')\n" },
    });
    // Affichage compact : ❯ write_file (avec path=)
    await expect(page.getByText(/❯ write_file/)).toBeVisible();

    await emitWs(page, {
      type: "tool_result",
      name: "write_file",
      content: "Fichier hello.py écrit (16 octets)",
    });
    await expect(page.getByText(/Fichier hello\.py écrit/)).toBeVisible();

    await emitWs(page, { type: "done" });
  });

  test("preview_code → bouton Ouvrir l'aperçu cliquable", async ({ page }) => {
    const textarea = page.getByPlaceholder(/Message…/);
    await textarea.fill("Génère une page HTML d'exemple");
    await textarea.press("Enter");

    await emitWs(page, {
      type: "tool_call",
      name: "preview_code",
      args: { lang: "html", code: "<h1>Hi</h1>" },
    });
    await emitWs(page, {
      type: "tool_result",
      name: "preview_code",
      content: "Preview disponible : http://localhost:8765/p/abc123",
    });

    const link = page.getByRole("link", { name: /Ouvrir l'aperçu/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", /localhost:8765\/p\/abc123/);
  });
});
