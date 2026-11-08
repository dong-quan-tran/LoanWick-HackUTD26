import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sessionFile = process.env.LOANWICK_WEB_DATABASE_SESSIONS;
const source = process.env.LOANWICK_WEB_DATABASE_SOURCE;
if (!sessionFile || !source) throw new Error('Run npm run test:e2e:database with the documented local backend source and tools.');
const config = JSON.parse(readFileSync(sessionFile, 'utf8')) as {
  endpoint: string; database: string; sessions: { id: string; token: string }[];
};
const driverFile = fileURLToPath(new URL('./driver.mjs', import.meta.url));
const driver = (action: string, applicationId: string) => {
  const output = execFileSync(process.execPath,
    [join(source, 'spacetimedb/node_modules/tsx/dist/cli.mjs'), driverFile, action, applicationId],
    { cwd: source, env: process.env, encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'pipe'] });
  const result = output.split('\n').find(line => line.startsWith('LOANWICK_TEST_RESULT:'));
  if (!result) throw new Error('The database test driver did not return a confirmed result.');
  return result.slice('LOANWICK_TEST_RESULT:'.length);
};
const captures = fileURLToPath(new URL('../../../../.impeccable/review/', import.meta.url));

async function login(page: Page, id: string, path = '/') {
  const session = config.sessions.find(s => s.id === id); if (!session) throw new Error('Missing disposable role session');
  await page.goto(path);
  await page.getByLabel('Database endpoint').fill(config.endpoint);
  await page.getByLabel('Database name').fill(config.database);
  await page.getByLabel('Individual session token').fill(session.token);
  await page.getByRole('button', { name: 'Connect authorized session' }).click();
  await expect(page.getByRole('button', { name: 'Disconnect', exact: true })).toBeVisible();
  await expect(page.getByLabel('Demo role')).toHaveCount(0);
  // Credential and database projections must never be persisted in web storage.
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(config.sessions.some(s => stored.includes(s.token))).toBe(false);
}
async function openCase(page: Page, id: string) {
  await page.getByRole('link', { name: 'Applications', exact: true }).first().click();
  await page.locator(`a[href="/cases/db.r.${id}"]`).first().click();
}
async function review(page: Page, name: string, evidence: RegExp) {
  await page.getByRole('button', { name: new RegExp(`^${name} Current revision`) }).click();
  await page.getByRole('checkbox', { name: evidence }).first().check();
  await page.getByLabel('Review rationale').fill('Reviewed the actual current synthetic source and server revision.');
  await page.getByRole('button', { name: 'Record review', exact: true }).click();
  await expect(page.getByText('Review recorded against the observed revision.')).toBeVisible();
}

test('separate authorized sessions, stored evidence, clarification, stale reviews, and one release', async ({ browser }) => {
  const contexts = await Promise.all(['officer', 'borrower-a', 'borrower-b', 'reviewer'].map(() => browser.newContext()));
  try {
    const [officer, borrower, otherBorrower, reviewer] = await Promise.all(contexts.map(c => c.newPage()));
    await Promise.all([login(officer!, 'officer', '/applications'), login(borrower!, 'borrower-a'), login(otherBorrower!, 'borrower-b'), login(reviewer!, 'reviewer')]);
    await expect(officer!.getByRole('table').getByRole('row')).toHaveCount(9);
    await expect(borrower!.getByLabel('Your applications').getByRole('option')).toHaveCount(5);
    expect(await borrower!.getByLabel('Your applications').getByRole('option').evaluateAll(options => options.map(o => (o as HTMLOptionElement).value).filter(Boolean))).toEqual(expect.arrayContaining(['db.r.demo-case-1', 'db.r.demo-case-3', 'db.r.demo-case-5', 'db.r.demo-case-7']));
    await openCase(officer!, 'demo-case-1');
    await officer!.getByRole('button', { name: 'Investigate case', exact: true }).click();
    expect(driver('fail-live', 'demo-case-1')).toContain('"status":"failed"');
    await officer!.getByRole('tab', { name: 'Activity & audit' }).click();
    await expect(officer!.getByText('Model unavailable', { exact: true })).toBeVisible();

    // The published deterministic bridge runs as the worker identity, in fixture
    // execution mode. It is not a substitute for Person 3's model integration.
    expect(driver('analyze', 'demo-case-1')).toContain('"findings":1');
    await officer!.getByRole('tab', { name: 'Findings & evidence' }).click();
    await expect(officer!.getByText(/FL-004821/).first()).toBeVisible();
    const records = JSON.parse(driver('sources', 'demo-case-1')) as {
      id: string; version: number; sha256: string; filename: string; excerpts: { text: string; locator: string }[];
    }[];
    expect(records).toHaveLength(2);
    for (const record of records) {
      const number = record.id.match(/^demo-doc-(\d+)$/)?.[1]; expect(number).toBeTruthy();
      const sourceText = readFileSync(join(source, `fixtures/database/application-${number}.txt`), 'utf8');
      expect(createHash('sha256').update(sourceText).digest('hex')).toBe(record.sha256);
      const panel = officer!.getByRole('article').filter({ hasText: record.filename });
      await expect(panel.getByText(`Version ${record.version}`, { exact: true })).toBeVisible();
      await panel.getByText('View original wording', { exact: true }).click();
      for (const excerpt of record.excerpts) {
        expect(sourceText).toContain(excerpt.text);
        expect(sourceText.split('\n')[Number(excerpt.locator.slice(5)) - 1]).toContain(excerpt.text);
        await expect(panel.getByText(excerpt.text, { exact: true }).first()).toBeVisible();
        await expect(panel.getByText(excerpt.locator, { exact: true }).first()).toBeVisible();
      }
    }
    mkdirSync(captures, { recursive: true });
    await officer!.screenshot({ path: join(captures, 'live-database-evidence.png'), fullPage: true });
    await expect(officer!.getByRole('button', { name: 'Open full document' })).toHaveCount(2);
    await officer!.getByRole('button', { name: 'Open full document' }).first().click();
    await expect(officer!.getByText('Source downloads are unavailable for this connection. Stored evidence excerpts remain available.')).toBeVisible();
    await officer!.getByRole('button', { name: 'Request clarification', exact: true }).click();
    await expect(officer!.getByLabel('Message to borrower')).toBeDisabled();
    await officer!.getByRole('button', { name: 'Save & preview request' }).click();
    const preview = await officer!.getByRole('region', { name: 'Borrower preview' }).getByRole('paragraph').first().innerText();
    await officer!.getByRole('button', { name: 'Send this request' }).click();
    await expect(borrower!.getByLabel('Your applications').getByRole('option', { name: /1 to answer.*Northline Foods/ })).toBeAttached();
    await borrower!.getByLabel('Your applications').selectOption('db.r.demo-case-1');
    await expect(borrower!.getByText(preview, { exact: true })).toBeVisible();
    await login(borrower!, 'borrower-a');
    await expect(borrower!).toHaveURL(/\/borrower\/db\.r\.demo-case-1$/);
    await expect(borrower!.getByText(preview, { exact: true })).toBeVisible();
    await expect(otherBorrower!.getByText(preview, { exact: true })).toHaveCount(0);
    await login(otherBorrower!, 'borrower-b', '/borrower/db.r.demo-case-1');
    await expect(otherBorrower!.getByText('This case is unavailable for your identity.')).toBeVisible();
    await expect(otherBorrower!.getByText(preview, { exact: true })).toHaveCount(0);
    await otherBorrower!.getByLabel('Your applications').selectOption('db.r.demo-case-2');
    await expect(otherBorrower!.getByRole('heading', { name: 'Your application', exact: true })).toBeVisible();
    await expect(otherBorrower!.getByText(preview, { exact: true })).toHaveCount(0);
    const message = 'Please review the submitted ownership statements; this response does not remove the asset claim.';
    await borrower!.getByLabel('Your response').fill(message);
    await borrower!.getByLabel('Your applications').selectOption('db.r.demo-case-7');
    await expect(borrower!.getByRole('heading', { name: 'No requests right now' })).toBeVisible();
    await borrower!.getByLabel('Your applications').selectOption('db.r.demo-case-1');
    await expect(borrower!.getByLabel('Your response')).toHaveValue(message);
    await borrower!.setViewportSize({ width: 390, height: 844 });
    expect(await borrower!.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect((await new AxeBuilder({ page: borrower! }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    await borrower!.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0); });
    await borrower!.screenshot({ path: join(captures, 'live-borrower-applications.png'), fullPage: true, animations: 'disabled' });
    await borrower!.setViewportSize({ width: 1280, height: 900 });
    await borrower!.screenshot({ path: join(captures, 'live-borrower-applications-desktop.png'), fullPage: true, animations: 'disabled' });
    await borrower!.getByRole('button', { name: 'Send response', exact: true }).click();
    await expect(borrower!.getByText('Your response was received')).toBeVisible();
    await expect(officer!.getByText('Borrower responded', { exact: true })).toBeVisible();
    await expect(officer!.getByRole('button', { name: 'Resolve concern', exact: true })).toBeDisabled();
    await officer!.getByLabel('Decision rationale').fill('Written response alone does not reconcile the two active exclusive claims. Escalated for further evidence.');
    await officer!.getByRole('button', { name: 'Escalate concern', exact: true }).click();
    await expect(officer!.getByText('Human decision recorded in the audit history.')).toBeVisible();

    // Use the clean negative-control case for release. A text-only response above
    // must not be treated as proof that the original ownership conflict vanished.
    expect(driver('analyze', 'demo-case-8')).toContain('"findings":0');
    await openCase(reviewer!, 'demo-case-8');
    await reviewer!.getByRole('tab', { name: 'Review & release' }).click();
    await review(reviewer!, 'Collateral review', /Equipment identifier/);
    await review(reviewer!, 'Document consistency', /Equipment identifier/);
    await review(reviewer!, 'Payment verification', /Synthetic account token/);
    await expect(reviewer!.getByRole('button', { name: 'Simulate release', exact: true })).toBeEnabled();
    await reviewer!.getByText('Change synthetic payment instructions', { exact: true }).click();
    await reviewer!.getByLabel('Supporting payment source').selectOption({ index: 1 });
    await reviewer!.getByLabel('Beneficiary', { exact: true }).fill('Synthetic updated beneficiary');
    await reviewer!.getByRole('button', { name: 'Save synthetic payment', exact: true }).click();
    await expect(reviewer!.getByRole('button', { name: /^Payment verification Current revision/ })).toContainText('Stale');
    await expect(reviewer!.getByRole('button', { name: /^Document consistency Current revision/ })).toContainText('Stale');
    await expect(reviewer!.getByRole('button', { name: 'Simulate release', exact: true })).toBeDisabled();
    await reviewer!.screenshot({ path: join(captures, 'live-database-stale.png'), fullPage: true });
    expect(driver('reject-release', 'demo-case-8')).toContain('"rejected":true');
    expect(driver('analyze', 'demo-case-8')).toContain('"status":"succeeded"');
    await review(reviewer!, 'Document consistency', /Equipment identifier/);
    await review(reviewer!, 'Payment verification', /Synthetic account token/);
    await reviewer!.getByRole('button', { name: 'Simulate release', exact: true }).click();
    await expect(reviewer!.getByText('Release ID', { exact: true })).toBeVisible();
    expect(driver('retry-release', 'demo-case-8')).toContain('"releases":1');
    await login(reviewer!, 'reviewer'); // Reload requires explicit reauthentication.
    await openCase(reviewer!, 'demo-case-8');
    await reviewer!.getByRole('tab', { name: 'Review & release' }).click();
    await expect(reviewer!.getByText('Release ID', { exact: true })).toBeVisible();
    await expect(reviewer!.getByText('SIMULATED RELEASE - NO MONEY MOVED', { exact: true }).first()).toBeVisible();
    await reviewer!.screenshot({ path: join(captures, 'live-database-release.png'), fullPage: true });
    await officer!.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(officer!.getByRole('heading', { name: 'Connect your session' })).toBeVisible();
    await expect(officer!.getByLabel('Individual session token')).toHaveValue('');
    await expect(officer!.getByText('Borrower responded', { exact: true })).toHaveCount(0);
  } finally { await Promise.all(contexts.map(c => c.close())); }
});
