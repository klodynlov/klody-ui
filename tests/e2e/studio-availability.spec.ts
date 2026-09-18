import { expect, test } from '@playwright/test';

test('a blocked medical reader shows its cause and recovers without losing the question', async ({ page }) => {
  let available = false;
  const blocker = 'Composant de recherche modifié : retriever.py';
  await page.route('http://127.0.0.1:8018/api/catalog', route => route.fulfill({
    json: {
      models: [{
        id: 'medical', name: 'Médical V8', version: 'v8', parameters: '35B',
        available, evaluated: available, description: 'Lecteur documentaire', domains: [],
        size_gb: 37.74, dataset: {}, metrics: {}, supports_training: false,
        availability_error: available ? undefined : blocker,
      }], versions: [], feedback_count: 0,
    },
  }));
  await page.route('http://127.0.0.1:8018/api/jobs', route => route.fulfill({ json: [] }));
  await page.goto('/#studio');
  await page.getByRole('button', { name: 'Médical V8 35B · v8', exact: true }).click();
  const question = page.getByRole('textbox', { name: 'Votre question' });
  await question.fill('hernie');
  await expect(page.getByRole('alert')).toHaveText(blocker);
  await expect(page.getByRole('combobox', { name: 'Version du modèle' })).toContainText('v8 · indisponible');
  await expect(page.getByRole('button', { name: 'Envoyer la question', exact: true })).toBeDisabled();
  available = true;
  await expect(page.getByRole('combobox', { name: 'Version du modèle' })).toContainText('v8 · pilote évalué', { timeout: 10000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(question).toHaveValue('hernie');
  await expect(page.getByRole('button', { name: 'Envoyer la question', exact: true })).toBeEnabled();
});
