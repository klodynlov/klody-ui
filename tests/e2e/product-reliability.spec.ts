import { test, expect, type Page } from "@playwright/test";
import { API_BASE, emitWs, getWsSent, installFakeWebSocket, stubRest, waitForWsReady } from "./fixtures";

const config = {
  router_enabled: true, best_of_n_enabled: false, best_of_n_force: false,
  sandbox_auto_exec: true, max_iterations: 25, best_of_n_count: 3, sandbox_timeout: 30,
};
async function boot(page: Page) {
  await installFakeWebSocket(page);
  await stubRest(page, { sessions: [{ id: "saved", title: "Projet conservé", preview: "", messages: 2, modified: 1 }] });
  await page.goto("/");
  await waitForWsReady(page);
  await expect(page.getByPlaceholder(/Message…/)).toBeEnabled();
}
async function settings(page: Page) {
  await page.route(`${API_BASE}/api/config`, route => route.fulfill({ json: config }));
  await page.getByTitle("Paramètres", { exact: true }).click();
  await expect(page.getByRole("switch", { name: "Router adaptatif", exact: true })).toBeVisible();
}

test("question à choix : réponse au canal attendu, une seule fois", async ({ page }) => {
  await boot(page);
  await emitWs(page, { type: "question_request", id: "q-1", question: "Quel format souhaites-tu ?", options: ["MIDI", "Audio"], allow_free_text: false });
  await page.getByRole("button", { name: "MIDI", exact: true }).click();
  await expect(page.getByText("Réponse envoyée : MIDI")).toBeVisible();
  expect((await getWsSent(page)).filter(e => e.type === "question_response")).toEqual([{ type: "question_response", id: "q-1", answer: "MIDI" }]);
  await expect(page.getByRole("button", { name: "MIDI", exact: true })).toHaveCount(0);
});

test("question libre et expiration ne laissent pas de contrôle actif", async ({ page }) => {
  await boot(page);
  await emitWs(page, { type: "question_request", id: "q-1", question: "Précise le besoin", options: [], allow_free_text: true });
  await page.getByRole("textbox", { name: "Ta réponse", exact: true }).fill("  Un export MIDI  ");
  await page.getByRole("button", { name: "Répondre", exact: true }).click();
  expect((await getWsSent(page)).some(e => e.answer === "Un export MIDI")).toBe(true);
  await emitWs(page, { type: "question_request", id: "q-2", question: "Et ensuite ?", options: ["Continuer"], allow_free_text: false });
  await emitWs(page, { type: "question_timeout", id: "q-2" });
  await expect(page.getByRole("button", { name: "Continuer", exact: true })).toHaveCount(0);
  await expect(page.getByText(/Question expirée/)).toBeVisible();
});

test("une coupure expire les interactions et finit le flux visible", async ({ page }) => {
  await boot(page);
  await emitWs(page, { type: "question_request", id: "q-1", question: "Continuer ?", options: ["Oui"], allow_free_text: true });
  await emitWs(page, { type: "approval_request", id: "a-1", name: "write_file", args: {}, reason: "Écriture" });
  await page.evaluate(() => (window as any).__fakeWS.close());
  await expect(page.getByText(/Question expirée/)).toBeVisible();
  await expect(page.getByText("⏱ Expiré", { exact: true })).toBeVisible();
});

test("un envoi refusé par la socket conserve le brouillon", async ({ page }) => {
  await boot(page);
  const input = page.getByPlaceholder(/Message…/);
  await input.fill("Ne perds pas mon travail");
  // Fenêtre de course réelle : readyState ferme avant le callback onclose.
  await page.evaluate(() => { (window as any).__fakeWS.readyState = 3; });
  await input.press("Enter");
  await expect(input).toHaveValue("Ne perds pas mon travail");
  await expect(page.getByRole("alert")).toContainText("n'a pas été envoyée");
  expect((await getWsSent(page)).filter(e => e.type === "chat")).toHaveLength(0);
});

test("un brouillon survit au rechargement et reste propre à sa session", async ({ page }) => {
  await boot(page);
  await emitWs(page, { type: "session_init", session_id: "draft-a", messages: [] });
  await page.getByPlaceholder(/Message…/).fill("Brouillon A");
  await page.reload();
  await waitForWsReady(page);
  await expect(page.getByPlaceholder(/Message…/)).toHaveValue("Brouillon A");
  await emitWs(page, { type: "session_loaded", session_id: "draft-a", messages: [] });
  await emitWs(page, { type: "session_loaded", session_id: "draft-b", messages: [] });
  await expect(page.getByPlaceholder(/Message…/)).toHaveValue("");
  await page.getByPlaceholder(/Message…/).fill("Brouillon B");
  await emitWs(page, { type: "session_loaded", session_id: "draft-a", messages: [] });
  await expect(page.getByPlaceholder(/Message…/)).toHaveValue("Brouillon A");
});

test("reprise : le handshake provisoire ne remplace pas la session persistée", async ({ page }) => {
  await boot(page);
  await emitWs(page, { type: "session_init", session_id: "original", messages: [] });
  await page.reload();
  await waitForWsReady(page);
  await expect.poll(async () => (await getWsSent(page)).some(e => e.type === "session_load")).toBe(true);
  await emitWs(page, { type: "session_init", session_id: "temporary" });
  await emitWs(page, { type: "token", content: "Synchronisation témoin" });
  await expect(page.getByText("Synchronisation témoin")).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("klody_active_session"))).toBe("original");
  await emitWs(page, { type: "session_loaded", session_id: "original", messages: [{ role: "assistant", content: "Historique restauré" }] });
  await expect(page.getByText("Historique restauré")).toBeVisible();
});

test("un paquet WebSocket illisible n'empêche pas la réponse suivante", async ({ page }) => {
  await boot(page);
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.evaluate(() => (window as any).__fakeWS.onmessage({ data: "pas du JSON" }));
  await expect(page.getByRole("alert")).toContainText("illisible");
  await emitWs(page, { type: "token", content: "Le flux continue" });
  await emitWs(page, { type: "stream_end" });
  await expect(page.getByText("Le flux continue")).toBeVisible();
  expect(errors).toEqual([]);
});

for (const action of ["delete", "archive"] as const) {
  test(`refus HTTP de ${action} : la session reste visible`, async ({ page }) => {
    await boot(page);
    await page.route(`${API_BASE}/api/sessions/saved${action === "archive" ? "/archive" : ""}`, route => route.fulfill({ status: 503, json: { detail: "indisponible" } }));
    const nav = page.getByRole("complementary");
    if (action === "delete") {
      await nav.getByTitle("Supprimer", { exact: true }).click();
      await nav.getByTitle("Cliquer encore pour supprimer").click();
    } else await nav.getByTitle("Archiver — ranger pour réutiliser plus tard").click();
    await expect(page.getByRole("alert")).toContainText("HTTP 503");
    await expect(nav.getByText("Projet conservé", { exact: true })).toBeVisible();
  });
}

test("arrêt refusé : le moteur reste affiché en cours", async ({ page }) => {
  await boot(page);
  await page.route(`${API_BASE}/api/stop`, route => route.fulfill({ status: 503 }));
  await emitWs(page, { type: "thinking" });
  await page.getByTitle("Arrêter la génération").click();
  await expect(page.getByRole("alert")).toContainText("Arrêt non confirmé");
  await expect(page.getByText("Klody réfléchit…", { exact: true })).toBeVisible();
});

test("paramètres : un refus ne valide pas la valeur à l'écran", async ({ page }) => {
  await boot(page);
  await settings(page);
  await page.route(`${API_BASE}/api/config`, route => route.fulfill({ status: 500, json: { detail: "Échec" } }));
  const toggle = page.getByRole("switch", { name: "Router adaptatif", exact: true });
  await toggle.click();
  await expect(page.getByRole("alert")).toContainText("Modification non confirmée");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
});

test("paramètres : saisie numérique validée en une seule requête", async ({ page }) => {
  await boot(page);
  await settings(page);
  const writes: unknown[] = [];
  await page.route(`${API_BASE}/api/config`, route => {
    writes.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, config: { ...config, max_iterations: 40 } } });
  });
  const input = page.getByRole("spinbutton", { name: "Itérations max (ReAct)", exact: true });
  await input.fill("40");
  expect(writes).toHaveLength(0);
  await input.press("Enter");
  await expect(page.getByText("Réglages confirmés par le serveur.")).toBeVisible();
  expect(writes).toEqual([{ max_iterations: 40 }]);
});

test("paramètres : focus contenu, Échap ferme et rend le focus", async ({ page }) => {
  await boot(page);
  await settings(page);
  await expect(page.getByRole("dialog", { name: "Paramètres" })).toBeVisible();
  for (let i = 0; i < 18; i++) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTitle("Paramètres", { exact: true })).toBeFocused();
});

test("petite fenêtre : navigation repliable et conversation accessible", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 780 });
  await boot(page);
  await expect(page.getByRole("complementary")).toBeHidden();
  await page.getByRole("button", { name: "Sessions, mémoire et projet", exact: true }).click();
  await expect(page.getByRole("complementary")).toBeVisible();
  await page.locator(".sidebar-toggle").click();
  await expect(page.getByRole("complementary")).toBeHidden();
  const bounds = await page.getByPlaceholder(/Message…/).boundingBox();
  expect(bounds!.width).toBeGreaterThan(180);
  const newSession = await page.getByRole("button", { name: /Nouvelle/ }).boundingBox();
  expect(newSession!.x + newSession!.width).toBeLessThanOrEqual(600);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const action of ["delete", "archive"] as const) {
  test(`refus métier HTTP 200 de ${action} : aucune réussite affichée`, async ({ page }) => {
    await boot(page);
    await page.route(`${API_BASE}/api/sessions/saved${action === "archive" ? "/archive" : ""}`, route => route.fulfill({ json: { ok: false, message: "Écriture refusée" } }));
    const nav = page.getByRole("complementary");
    if (action === "delete") {
      await nav.getByTitle("Supprimer", { exact: true }).click();
      await nav.getByTitle("Cliquer encore pour supprimer").click();
    } else await nav.getByTitle("Archiver — ranger pour réutiliser plus tard").click();
    await expect(page.getByRole("alert")).toContainText("pas été confirmée");
    await expect(nav.getByText("Projet conservé", { exact: true })).toBeVisible();
  });
}

test("stockage de session refusé : le chat reste disponible", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException("refusé", "SecurityError"); };
    Storage.prototype.setItem = () => { throw new DOMException("refusé", "SecurityError"); };
  });
  await boot(page);
  await page.getByPlaceholder(/Message…/).fill("Bonjour");
  await page.getByPlaceholder(/Message…/).press("Enter");
  expect((await getWsSent(page)).some(e => e.type === "chat" && e.content === "Bonjour")).toBe(true);
});

test("une nouvelle session ne masque pas une question en attente", async ({ page }) => {
  await boot(page);
  await emitWs(page, { type: "question_request", id: "q-1", question: "Continuer le travail ?", options: ["Oui"], allow_free_text: false });
  await page.getByRole("button", { name: /Nouvelle/ }).click();
  await expect(page.getByRole("button", { name: "Oui", exact: true })).toBeVisible();
  expect((await getWsSent(page)).some(e => e.type === "session_new")).toBe(false);
  await page.getByTitle("Arrêter la génération").click();
  await expect(page.getByText(/Question expirée/)).toBeVisible();
  await page.getByRole("button", { name: /Nouvelle/ }).click();
  expect((await getWsSent(page)).some(e => e.type === "session_new")).toBe(false);
  await emitWs(page, { type: "done" });
  await page.getByRole("button", { name: /Nouvelle/ }).click();
  await expect.poll(async () => (await getWsSent(page)).some(e => e.type === "session_new")).toBe(true);
});

test("la saisie principale répond à la question libre sans créer un second tour", async ({ page }) => {
  await boot(page);
  await emitWs(page, { type: "question_request", id: "q-main", question: "Quel nom ?", options: [], allow_free_text: true });
  await page.getByRole("textbox", { name: "Message à Klody", exact: true }).fill("Mon projet");
  await page.getByRole("textbox", { name: "Message à Klody", exact: true }).press("Enter");
  await expect(page.getByText("Réponse envoyée : Mon projet")).toBeVisible();
  expect((await getWsSent(page)).filter(e => e.type === "chat")).toHaveLength(0);
  expect((await getWsSent(page)).some(e => e.type === "question_response" && e.id === "q-main" && e.answer === "Mon projet")).toBe(true);
});
