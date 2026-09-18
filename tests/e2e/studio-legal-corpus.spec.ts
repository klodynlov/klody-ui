import { expect, test } from '@playwright/test';

test('legal coverage separates indexed sources from training and discloses missing judgments', async ({ page }) => {
  await page.route('http://127.0.0.1:8018/api/catalog', route => route.fulfill({ json: {
    models: [{ id: 'legal', name: 'Juridique V3', version: 'v3', parameters: '4B', available: true,
      description: 'Codes et décisions françaises datés.', domains: ['Codes français'], size_gb: 4.3,
      dataset: { train: 636 }, metrics: {}, supports_training: false,
      corpus: { as_of: '2026-09-18', code_count: 76, expected_codes: 76, articles: 100000,
        decisions: 700000, complete_jurisprudence: false,
        missing_sources: ['Judilibre : accès PISTE requis'],
        codes: [{ legi_id: 'LEGITEXT000006070721', title: 'Code civil', articles: 2800 }] },
    }], versions: [], feedback_count: 0,
  } }));
  await page.route('http://127.0.0.1:8018/api/jobs', route => route.fulfill({ json: [] }));
  await page.goto('/#studio');
  await page.getByText(/Corpus au 2026-09-18/).click();
  await expect(page.getByText(/Jurisprudence partielle/)).toContainText('accès PISTE requis');
  await expect(page.getByRole('link', { name: 'Code civil', exact: true })).toHaveAttribute('href',
    'https://www.legifrance.gouv.fr/codes/id/LEGITEXT000006070721');
  await expect(page.getByText('636', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entraîner Juridique V3', exact: true })).toBeDisabled();
  await page.route('http://127.0.0.1:8018/api/chat', route => route.fulfill({ json: {
    id: 'c'.repeat(32), kind: 'chat', model: 'legal', status: 'completed', created: 1,
    question: 'Une décision du Conseil d’État', result: {
      answer: 'Extrait : « Le recours est rejeté. » [DCE_42]', confidence: {level: 'unverified'},
      sources: [{title: 'Conseil d’État · décision du 2026-09-01', text: 'Le recours est rejeté.',
        source_url: 'https://opendata.justice-administrative.fr/DCE/2026/09/CE_202609.zip',
        archive_member: 'DCE_42_20260901.xml'}],
    },
  } }));
  await page.locator('.st-model-card.legal').getByRole('button', { name: 'Discuter', exact: true }).click();
  await page.getByRole('textbox', { name: 'Votre question' }).fill('Une décision du Conseil d’État');
  await page.getByRole('button', { name: 'Envoyer la question', exact: true }).click();
  await expect(page.locator('.st-sources').getByRole('link', {name: 'Ouvrir l’archive officielle ↗'}))
    .toHaveAttribute('href', 'https://opendata.justice-administrative.fr/DCE/2026/09/CE_202609.zip');
  await expect(page.locator('.st-sources')).toContainText('DCE_42_20260901.xml');
});
