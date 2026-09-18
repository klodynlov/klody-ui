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
});
