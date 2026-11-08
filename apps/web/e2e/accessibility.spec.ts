import { capture } from './capture';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';

test('staff accessibility, keyboard tabs, and 1280px evidence comparison', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 }); await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Equipment EX-0042' })).toBeVisible();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }))).toEqual([]);
  await page.getByRole('tab', { name: 'Findings & evidence' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Clarifications' })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Clarifications' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  mkdirSync('../../.impeccable/review', { recursive: true });
  await capture(page, 'desktop-1280.png');
});
test('borrower accessibility at tablet width', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 }); await page.goto('/');
  await page.getByRole('button', { name: 'Request clarification', exact: true }).click();
  await page.getByRole('button', { name: 'Save & preview request' }).click();
  await page.getByRole('button', { name: 'Send this request' }).click();
  await page.getByLabel('Demo role').selectOption('borrower');
  await expect(page.getByLabel('Your response')).toBeVisible();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(768);
  await capture(page, 'borrower-768.png');
});
