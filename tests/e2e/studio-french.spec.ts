import { expect, test, type Page } from '@playwright/test';

const english = 'Otalgia or ear pain can originate from the ear or another site.';
const french = 'L’otalgie, ou douleur de l’oreille, peut provenir de l’oreille ou d’un autre site.';
const original = {
  id: 'a'.repeat(32), kind: 'chat', model: 'medical', status: 'completed', created: 1,
  question: 'douleur aux oreilles',
  result: {
    answer: english, sources: [{ title: 'Otalgia', text: english, book_id: 19091 }],
    confidence: { level: 'unverified' }, source_status: 'selected',
    generation_policy: 'model_selects_ids_program_copies_contextual_passages',
  },
};
const translated = {
  id: 'b'.repeat(32), kind: 'translate', model: 'medical', status: 'completed', created: 2,
  result: { answer: french, sources: [], confidence: { level: 'unverified' }, translation: { target_language: 'fr' } },
};

async function setup(page: Page, job: unknown) {
  await page.route('http://127.0.0.1:8018/api/catalog', route => route.fulfill({ json: {
    models: [{ id: 'medical', name: 'Médical V8', version: 'v8', parameters: '35B', available: true,
      description: 'Lecteur documentaire', domains: [], size_gb: 37.74, dataset: {}, metrics: {} }],
    versions: [], feedback_count: 0,
  } }));
  await page.route('http://127.0.0.1:8018/api/jobs', route => route.fulfill({ json: [] }));
  await page.route('http://127.0.0.1:8018/api/chat', route => route.fulfill({ json: job }));
  await page.goto('/#studio');
  await page.getByRole('button', { name: 'Médical V8 35B · v8', exact: true }).click();
  await page.getByRole('textbox', { name: 'Votre question' }).fill('douleur aux oreilles');
  await page.getByRole('button', { name: 'Envoyer la question', exact: true }).click();
}

test('French is shown by default and original sources remain accessible', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/medical/translate', route => { requests++; return route.fulfill({ json: translated }); });
  await setup(page, { ...original, result: { ...original.result, answer: french, original_answer: english,
    generation_policy: 'model_selects_ids_program_translates_contextual_passages', translation: { target_language: 'fr' } } });
  await expect(page.locator('.st-answer')).toHaveText(french);
  await expect(page.locator('.st-sources')).toContainText(english);
  await page.getByRole('button', { name: 'Afficher l’original', exact: true }).click();
  await expect(page.locator('.st-answer')).toHaveText(english);
  await page.getByRole('button', { name: 'Afficher la réponse en français', exact: true }).click();
  await expect(page.locator('.st-answer')).toHaveText(french);
  expect(requests).toBe(0);
});

test('an older original is translated automatically without flashing English', async ({ page }) => {
  let requests = 0;
  let ready = false;
  await page.route('**/api/medical/translate', route => { requests++; return route.fulfill({ json: { ...translated, status: 'running', result: null } }); });
  await page.route('**/api/jobs/' + translated.id, route => route.fulfill({ json: ready ? translated : { ...translated, status: 'running', result: null } }));
  await setup(page, original);
  await expect(page.getByRole('button', { name: 'Traduction en cours…', exact: true })).toBeDisabled();
  await expect(page.locator('.st-answer')).toHaveText('Préparation de la réponse en français…');
  ready = true;
  await expect(page.locator('.st-answer')).toHaveText(french);
  expect(requests).toBe(1);
});

test('a failed automatic translation stays in French and allows an explicit retry', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/medical/translate', route => { requests++; return route.fulfill({ json: translated }); });
  await setup(page, { ...original, result: { ...original.result, answer: 'Traduction indisponible.', original_answer: english,
    generation_policy: 'model_selects_ids_program_translates_contextual_passages', translation_error: 'Sens modifié.' } });
  await expect(page.locator('.st-answer')).toContainText('La réponse en français n’a pas pu être préparée.');
  expect(requests).toBe(0);
  await page.getByRole('button', { name: 'Réessayer en français', exact: true }).click();
  await expect(page.locator('.st-answer')).toHaveText(french);
  expect(requests).toBe(1);
});
