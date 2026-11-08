import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const result = () => ({
  source: 'uploaded-contract', executionMode: 'live', model: 'test-live-model',
  assistantSummary: 'FL-004821 is also pledged by Northline Foods and Pineworks Supply. Review ownership evidence.',
  extracted: { businessName: 'Redwood Warehouse Services', amountCents: 18000000, currency: 'USD', identifier: 'FL-004821', exclusiveOwnershipClaim: true },
  comparedWith: [{ id: 'demo-case-1', businessName: 'Northline Foods' }, { id: 'demo-case-2', businessName: 'Pineworks Supply' }],
  tools: [{ name: 'run_collateral_check', status: 'succeeded' }],
  findings: [{ title: 'Conflicting exclusive equipment ownership claims', relatedApplicationIds: ['demo-case-1', 'demo-case-2'], relatedBusinessNames: ['Northline Foods', 'Pineworks Supply'] }],
});
const pdf = { name: 'duplicate.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nFL-004821 SYNTHETIC TEST\n%%EOF') };

async function select(page: import('@playwright/test').Page) {
  await page.goto('/verify');
  await page.getByLabel('Loan contract', { exact: true }).setInputFiles(pdf);
  await page.getByRole('button', { name: 'Verify contract', exact: true }).click();
}

test('dragged PDF bytes reach the API and all returned fields and findings are shown', async ({ page }) => {
  await page.route('**/api/investigate', async route => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataBuffer()).toEqual(pdf.buffer);
    expect(route.request().headers()['content-type']).toBe('application/pdf');
    expect(route.request().headers()['x-filename']).toBe('duplicate.pdf');
    const body = result(); body.findings.push({ title: 'Second returned concern', relatedApplicationIds: [], relatedBusinessNames: [] });
    await route.fulfill({ json: body });
  });
  await page.goto('/verify');
  await expect(page.getByText('AI contract demo', { exact: true })).toBeVisible();
  const transfer = await page.evaluateHandle(({ text, name }) => { const value = new DataTransfer(); value.items.add(new File([text], name, { type: 'application/pdf' })); return value; }, { text: pdf.buffer.toString(), name: pdf.name });
  await page.getByRole('region', { name: 'Contract upload', exact: true }).dispatchEvent('drop', { dataTransfer: transfer });
  await page.getByRole('button', { name: 'Verify contract', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verification complete', exact: true })).toBeVisible();
  const panel = page.getByRole('region', { name: 'Worker results' });
  await expect(panel).toContainText('Redwood Warehouse Services'); await expect(panel).toContainText('$180,000.00');
  await expect(panel).toContainText('FL-004821'); await expect(panel).toContainText('Northline Foods, Pineworks Supply');
  await expect(panel).toContainText('Second returned concern');
  await expect(page.getByRole('log')).toContainText('Live AI explanation received.');
  await expect(page.getByRole('log')).toContainText('Compared with 2 synthetic demo loans.');
  await expect(page.getByText('Selected files stay on this device.', { exact: false })).toHaveCount(0);
  await expect(page.getByLabel('Demo role')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Loan application', exact: true })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
});

test('does not invent progress stages while awaiting the worker', async ({ page }) => {
  let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/investigate', async route => { await wait; await route.fulfill({ json: result() }); });
  await select(page);
  await expect(page.getByRole('heading', { name: 'Verifying your contract', exact: true })).toBeVisible();
  await expect(page.getByRole('log')).toContainText('Waiting for extraction');
  await expect(page.getByText('Fields extracted from your PDF.', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Worker results' })).toHaveCount(0);
  release();
  await expect(page.getByRole('heading', { name: 'Verification complete', exact: true })).toBeVisible();
});

test('AI timeout keeps deterministic findings but never claims AI completion', async ({ page }) => {
  await page.route('**/api/investigate', route => route.fulfill({ json: { ...result(), assistantSummary: null, explanationError: 'TIMEOUT' } }));
  await select(page);
  await expect(page.getByRole('heading', { name: 'Document checks finished' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AI explanation unavailable' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Worker results' })).toContainText('Conflicting exclusive equipment ownership claims');
  await expect(page.getByText('Live AI explanation received.', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Verification complete', exact: true })).toHaveCount(0);
});

test('missing equipment ID requests clarification instead of declaring the contract clean', async ({ page }) => {
  await page.route('**/api/investigate', route => route.fulfill({ json: { ...result(), findings: [], extracted: { ...result().extracted, identifier: null } } }));
  await select(page);
  await expect(page.getByRole('heading', { name: 'Equipment ID needs clarification' })).toBeVisible();
  await expect(page.getByRole('log')).toContainText('collateral check is incomplete');
  await expect(page.getByText('No concern returned by these checks', { exact: true })).toHaveCount(0);
});

test('server rejection shows an error and permits a new verification', async ({ page }) => {
  await page.route('**/api/investigate', route => route.fulfill({ status: 429, json: { message: 'An investigation is already running. Try again shortly.' } }));
  await select(page);
  await expect(page.getByRole('heading', { name: 'Verification needs attention' })).toBeVisible();
  await expect(page.getByRole('log')).toContainText('An investigation is already running.');
  await expect(page.getByRole('region', { name: 'Worker results' })).toHaveCount(0);
  await page.getByRole('button', { name: 'New verification', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Choose contract', exact: true })).toBeEnabled();
});

test('rejects sample substitution and unsupported Word uploads', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/investigate', route => { calls++; return route.fulfill({ json: { ...result(), source: 'server-demo' } }); });
  await select(page);
  await expect(page.getByRole('log')).toContainText('No sample result was substituted.');
  await page.getByRole('button', { name: 'New verification', exact: true }).click();
  await page.getByLabel('Loan contract', { exact: true }).setInputFiles({ name: 'contract.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('PK[Content_Types].xml word/document.xml') });
  await page.getByRole('button', { name: 'Verify contract', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('currently reads text PDFs only');
  expect(calls).toBe(1);
});

test('mobile worker results fit the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/investigate', route => route.fulfill({ json: result() }));
  await select(page);
  await expect(page.getByRole('region', { name: 'Worker results' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
