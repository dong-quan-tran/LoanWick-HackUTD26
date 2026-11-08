import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { capture, settleMotion } from './capture';

test('Applications is the staff home and filters leave portfolio summaries intact', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/applications$/);
  await expect(page.getByRole('heading', { name: 'Applications', exact: true, level: 1 })).toBeVisible();
  const summary = page.getByRole('region', { name: 'Portfolio summary' });
  await expect(summary.getByLabel('Applications summary')).toContainText('8');
  await expect(summary.getByLabel('Applications summary')).toContainText('0 investigated');
  await expect(summary.getByLabel('Total requested summary')).toContainText('$2M');
  await expect(summary.getByLabel('USD $1,980,000', { exact: true })).toBeVisible();
  await expect(summary.getByLabel('Open concerns summary')).toContainText('4 applications flagged');
  await expect(page.getByRole('region', { name: 'Application pipeline' })).toContainText('Reviewing 8');
  const table = page.getByRole('table');
  await expect(table.getByRole('row')).toHaveCount(9);
  await page.getByLabel('Filter by concerns').selectOption('open');
  await expect(table.getByRole('row')).toHaveCount(5);
  await page.getByLabel('Search applications').fill('Cedar');
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(summary.getByLabel('Applications summary')).toContainText('8');
  await expect(summary.getByLabel('Total requested summary')).toContainText('$2M');
  await page.getByLabel('Search applications').fill('no matching business');
  await expect(page.getByRole('heading', { name: 'No matching applications' })).toBeVisible();
  await expect(summary.getByLabel('Open concerns summary')).toContainText('4 applications flagged');
});

for (const viewport of [
  { name: 'reference', width: 1131, height: 713 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`dashboard layout and accessibility at ${viewport.name} size`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/applications');
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(9);
    await page.evaluate(() => document.fonts.ready);
    await settleMotion(page);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, elements: Array.from(document.body.querySelectorAll('*')).filter(element => element.getBoundingClientRect().right > innerWidth && !element.closest('table')).map(element => ({ tag: element.tagName, className: element.className, width: element.getBoundingClientRect().width })).slice(0, 12) }));
    expect(overflow.width, JSON.stringify(overflow.elements)).toBeLessThanOrEqual(viewport.width);
    await capture(page, `dashboard-${viewport.name}.png`);
    if (viewport.name === 'mobile') {
      const navigation = page.getByRole('navigation', { name: 'Workspace' });
      const menu = page.getByRole('button', { name: 'Menu', exact: true });
      await expect(navigation).toBeHidden();
      await menu.click();
      await expect(navigation).toBeVisible();
      await navigation.getByRole('link', { name: 'Applications', exact: true }).focus();
      await page.keyboard.press('Escape');
      await expect(menu).toBeFocused();
      await expect(navigation).toBeHidden();
      await menu.click();
      await navigation.getByRole('link', { name: 'Verify contract' }).click();
      await expect(page.getByRole('button', { name: 'Enter Verification Desk' })).toBeVisible();
      await page.getByRole('button', { name: 'Enter Verification Desk' }).click();
      await expect(page.getByRole('heading', { name: 'Verify a loan contract' })).toBeFocused();
      await expect(page.getByRole('combobox', { name: 'Loan application' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    }
  });
}

test('portfolio updates after an investigation and borrower home stays isolated', async ({ page }) => {
  await page.goto('/cases/app-excavator-a');
  await page.getByRole('button', { name: 'Investigate case', exact: true }).click();
  await page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', { name: 'Applications', exact: true }).click();
  await expect(page.getByLabel('Applications summary')).toContainText('1 investigated');
  await page.getByLabel('Demo role').selectOption('borrower');
  await page.goto('/');
  await expect(page).toHaveURL(/\/borrower\/app-excavator-a$/);
  await expect(page.getByRole('heading', { name: 'Your application', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Portfolio summary' })).toHaveCount(0);
  await expect(page.getByText('Granite Demo Equipment')).toHaveCount(0);
  await page.getByLabel('Demo role').selectOption('reviewer');
  await page.goto('/');
  await expect(page).toHaveURL(/\/applications$/);
  await expect(page.getByRole('link', { name: 'Verify contract', exact: true })).toHaveCount(0);
});

test('reduced motion leaves arrivals visible and keyboard case tabs usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/applications');
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(9);
  expect(await page.locator('main').evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
  await expect(page.getByLabel('Total requested summary')).toContainText('$2M');
  await page.getByRole('link', { name: 'Cedar Demo Excavation', exact: true }).click();
  const evidence = page.getByRole('tab', { name: 'Findings & evidence' });
  await evidence.focus();
  await page.keyboard.press('End');
  const details = page.getByRole('tab', { name: 'Case details' });
  await expect(details).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Case details' })).toBeVisible();
  await page.keyboard.press('Home');
  await expect(evidence).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Findings & evidence' })).toBeVisible();
  expect(await page.locator('main').evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
});
