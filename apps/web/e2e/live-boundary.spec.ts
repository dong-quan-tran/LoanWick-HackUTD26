import { test, expect } from '@playwright/test';
test.use({ baseURL: 'http://127.0.0.1:5174' });

test('live connection failure stays live and never loads fixture data or grants a role', async ({ page }) => {
  const fixtureRequests: string[] = [];
  page.on('request', request => { if (/adapters\/fixture|fixtures\/applications|payment-seed/.test(request.url())) fixtureRequests.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Connect your bank session' })).toBeVisible();
  await expect(page.getByLabel('Demo role')).toHaveCount(0);
  await expect(page.getByText('Cedar Demo Excavation')).toHaveCount(0);
  await page.getByLabel('Database endpoint').fill('ws://127.0.0.1:1');
  await page.getByLabel('Database name').fill('unavailable-synthetic-database');
  await page.getByLabel('Individual session token').fill('NOT-A-REAL-TOKEN');
  await page.getByRole('button', { name: 'Connect authorized session' }).click();
  await expect(page.getByText(/Could not connect|connection configuration is invalid|connection timed out/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Connected workspace', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Demo role')).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toContain('NOT-A-REAL-TOKEN');
  const stored = await page.evaluate(() => ({ local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage) }));
  expect(stored.local).not.toContain('NOT-A-REAL-TOKEN'); expect(stored.session).not.toContain('NOT-A-REAL-TOKEN');
  expect(fixtureRequests).toEqual([]);
});
