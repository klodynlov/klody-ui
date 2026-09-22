import { expect, test, type Page } from '@playwright/test';

const methods = {
  structure: { title: 'Construire la structure', question: 'Propose deux structures pour mon morceau.' },
  balance: { title: 'Clarifier le mix', question: 'Aide-moi à organiser les rôles.' },
  comparison: { title: 'Comparer un traitement', question: 'Prépare un test avant/après.' },
};

async function setup(page: Page, answer = '**Proposition à essayer :** alléger le couplet et ouvrir le refrain. Le choix de structure sert l’intention [S1].') {
  const projects: Record<string, unknown>[] = [];
  const jobs: Record<string, unknown>[] = [];
  const sent: Record<string, unknown>[] = [];
  const assets: Record<string, unknown>[] = [];
  let preferences = { instructions: '', revision: 0 };
  await page.route('http://127.0.0.1:8018/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/music') return route.fulfill({ json: { projects, methods, preferences, engine: { available: true, message: 'Local' } } });
    if (path === '/api/music/preferences') { preferences = { ...request.postDataJSON(), revision: preferences.revision+1 }; return route.fulfill({ json: preferences }); }
    if (path.endsWith('/assets')) {
      if (request.method() === 'POST') {
        const asset = { id: 'd'.repeat(32), name: new URL(request.url()).searchParams.get('filename'), kind: 'document', status: 'completed', analysis: { passages: 1, coverage: 'Texte UTF-8.' } };
        assets.push(asset); return route.fulfill({ status: 202, json: asset });
      }
      return route.fulfill({ json: assets });
    }
    if (path.endsWith('/export')) return route.fulfill({ contentType: 'text/markdown', body: '# Dossier local\n\nDécisions conservées.' });
    if (path === '/api/music/projects' && request.method() === 'POST') {
      const project = { ...request.postDataJSON(), id: (projects.length ? 'b' : 'a').repeat(32), revision: 1 };
      projects.push(project); return route.fulfill({ status: 201, json: project });
    }
    if (path.endsWith('/conversation')) {
      const id = path.split('/')[4]; return route.fulfill({ json: jobs.filter(j => j.music_project_id === id) });
    }
    if (path.startsWith('/api/music/projects/') && request.method() === 'POST') {
      const id = path.split('/')[4]; const index = projects.findIndex(p => p.id === id);
      projects[index] = { ...request.postDataJSON(), id, revision: Number(projects[index].revision)+1 };
      return route.fulfill({ json: projects[index] });
    }
    if (path === '/api/music/chat') {
      const body = request.postDataJSON(); sent.push(body);
      const job = { id: 'c'.repeat(32), music_project_id: body.project_id, music_mode: body.mode,
        question: body.question, status: 'completed', result: { answer, phase: 'done', project_revision: 1, duration_policy: 'computed_separately',
          sources: [{ id: 'S1', title: 'Écrire une chanson', author: 'Robert Léger', page: 13, text: 'Extrait original de référence pour le test.' }] } };
      jobs.push(job); return route.fulfill({ status: 202, json: job });
    }
    if (path === '/api/catalog') return route.fulfill({ json: { models: [{ id: 'medical', name: 'Médical V8', version: 'v8', parameters: '35B', available: true, domains: [], dataset: {}, metrics: {} }], versions: [] } });
    if (path === '/api/jobs') return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { detail: path } });
  });
  await page.goto('/#music');
  await expect(page.getByText('Moteur local · 35B', { exact: true })).toBeVisible();
  return { projects, sent };
}

test('project, draft, method and conversation survive reload and stay separate', async ({ page }) => {
  const { projects, sent } = await setup(page);
  await page.getByLabel('Titre', { exact: true }).fill('Éclats du soir');
  await page.getByLabel('Style / ambiance').fill('R&B intime');
  await page.getByLabel('Tempo déclaré').fill('90');
  await page.getByLabel('Intention', { exact: true }).fill('Un refrain plus ouvert');
  await page.getByRole('button', { name: 'Clarifier le mix' }).click();
  await page.getByLabel('Votre demande', { exact: true }).fill('La voix manque de place, propose un essai.');
  await page.reload();
  await expect(page.getByLabel('Titre', { exact: true })).toHaveValue('Éclats du soir');
  await expect(page.getByLabel('Votre demande', { exact: true })).toHaveValue('La voix manque de place, propose un essai.');
  await expect(page.getByRole('button', { name: 'Clarifier le mix' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Envoyer →', exact: true }).click();
  await expect(page.getByText('Proposition à essayer :', { exact: true })).toBeVisible();
  expect(projects[0].bpm).toBe(90);
  expect(sent[0].mode).toBe('balance');
  await page.getByText('Sources et méthodes · 1 passages').click();
  await page.getByText('[S1] Écrire une chanson · p. 13', { exact: true }).click();
  await expect(page.getByText('Extrait original de référence pour le test.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Proposition à essayer :', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nouveau morceau' }).click();
  await expect(page.getByLabel('Titre', { exact: true })).toHaveValue('');
  await expect(page.getByText('Proposition à essayer :', { exact: true })).toHaveCount(0);
  await page.getByLabel('Titre', { exact: true }).fill('Deuxième morceau');
  await page.getByRole('button', { name: 'Enregistrer la fiche', exact: true }).click();
  await page.getByRole('button', { name: 'Éclats du soir R&B intime' }).click();
  await expect(page.getByText('Proposition à essayer :', { exact: true })).toBeVisible();
});

test('files, explicit preferences and export are usable from the project', async ({ page }) => {
  await setup(page);
  await page.getByLabel('Titre', { exact: true }).fill('Dossier avec brief');
  await page.getByRole('button', { name: 'Enregistrer la fiche', exact: true }).click();
  await expect(page.getByLabel('Ajouter des documents ou des fichiers audio')).toBeEnabled();
  await page.getByLabel('Ajouter des documents ou des fichiers audio').setInputFiles({ name: 'brief.txt', mimeType: 'text/plain', buffer: Buffer.from('Conserver une voix proche.') });
  await expect(page.getByText('brief.txt', { exact: true })).toBeVisible();
  await expect(page.getByText('1 passages · Texte UTF-8.')).toBeVisible();
  await page.getByText('Mes préférences de travail', { exact: true }).click();
  await page.getByLabel('Consignes communes').fill('Réponds brièvement, pour Ableton.');
  await page.getByRole('button', { name: 'Enregistrer les préférences', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Préférences enregistrées');
  await page.reload();
  await page.getByText('Mes préférences de travail', { exact: true }).click();
  await expect(page.getByLabel('Consignes communes')).toHaveValue('Réponds brièvement, pour Ableton.');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter le dossier (.md)' }).click();
  expect((await download).suggestedFilename()).toBe('dossier-musique.md');
});

test('model Markdown cannot load remote images or create external links', async ({ page }) => {
  let external = 0;
  await page.route('https://example.com/**', route => { external++; return route.abort(); });
  await setup(page, 'Texte utile. ![Image distante](https://example.com/private) [Lien distant](https://example.com/private)');
  await page.getByLabel('Titre', { exact: true }).fill('Confidentialité');
  await page.getByLabel('Votre demande', { exact: true }).fill('Un essai.');
  await page.getByRole('button', { name: 'Envoyer →', exact: true }).click();
  await expect(page.locator('.mw-answer')).toContainText('Texte utile.');
  await expect(page.locator('.mw-answer img, .mw-answer a')).toHaveCount(0);
  expect(external).toBe(0);
});

test('failed send keeps question and reuses request identity for retry', async ({ page }) => {
  await setup(page);
  await page.getByLabel('Titre', { exact: true }).fill('Essai');
  await page.getByLabel('Votre demande', { exact: true }).fill('Propose deux structures.');
  const ids: string[] = [];
  await page.route('**/api/music/chat', route => {
    ids.push(route.request().postDataJSON().request_id);
    return route.fulfill({ status: 503, json: { detail: 'Moteur indisponible' } });
  });
  await page.getByRole('button', { name: 'Envoyer →', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Moteur indisponible');
  await expect(page.getByLabel('Votre demande', { exact: true })).toHaveValue('Propose deux structures.');
  await page.reload();
  await page.getByRole('button', { name: 'Envoyer →', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Moteur indisponible');
  expect(ids).toHaveLength(2); expect(ids[0]).toBe(ids[1]);
});

test('specialist links open the existing medical reader', async ({ page }) => {
  await setup(page);
  await page.getByRole('link', { name: '✚ Médical Lecteur V8' }).click();
  await expect(page.getByRole('heading', { name: 'Explorer vos documents médicaux.' })).toBeVisible();
  await page.getByRole('link', { name: '♫ Atelier musique · projets et méthodes' }).click();
  await expect(page.getByRole('heading', { name: 'Faisons avancer votre morceau.' })).toBeVisible();
});

test('warm workspace remains usable on desktop and phone', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await setup(page);
  await page.getByLabel('Titre', { exact: true }).fill('Éclats du soir');
  await page.getByLabel('Style / ambiance').fill('R&B intime, voix et piano électrique');
  await page.getByLabel('Intention', { exact: true }).fill('Ouvrir le refrain en gardant une voix proche.');
  await page.screenshot({ path: '/tmp/klody-music-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Titre', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByLabel('Votre demande', { exact: true }).fill('Propose un essai.');
  await page.getByRole('button', { name: 'Envoyer →', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Envoyer →', exact: true })).toBeEnabled();
  await page.screenshot({ path: '/tmp/klody-music-mobile.png', fullPage: true });
});
