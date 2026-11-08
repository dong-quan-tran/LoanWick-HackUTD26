import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { capture } from './capture';

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`dossier cover supports keyboard entry at ${viewport.name} size`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/verify');
    const cover = page.getByRole('region', { name: /EVERY LOAN CLAUSE/ });
    const enter = page.getByRole('button', { name: 'Enter Verification Desk' });
    const heading = page.getByRole('heading', { name: 'Verify a loan contract', exact: true });
    await expect(cover).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose contract', exact: true })).toBeEnabled();
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => Array.from(document.images).every(image => image.complete && image.naturalWidth > 0));
    mkdirSync('../../.impeccable/review', { recursive: true });
    await page.screenshot({ path: `../../.impeccable/review/dossier-cover-${viewport.name}.png`, fullPage: false, animations: 'disabled' });
    await enter.focus();
    await page.keyboard.press('Enter');
    await expect(cover).toHaveCount(0);
    await expect(heading).toBeFocused();
    await expect(page.getByRole('region', { name: 'Contract upload', exact: true })).toBeInViewport();
    await page.getByRole('main').evaluate(element => Promise.all(element.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished)));
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await capture(page, `desk-${viewport.name}.png`);
  });
}

test('the mounted upload input bypasses the cover without an entry click', async ({ page }) => {
  await page.goto('/verify');
  const enter = page.getByRole('button', { name: 'Enter Verification Desk' });
  await expect(enter).toBeVisible();
  await page.getByLabel('Loan contract', { exact: true }).setInputFiles({
    name: 'direct-entry.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\nSYNTHETIC DEMO CONTRACT\n%%EOF'),
  });
  await expect(enter).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'direct-entry.pdf', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verify contract', exact: true })).toBeEnabled();
});

test('loan selection updates the dossier and the desk without changing routes', async ({ page }) => {
  await page.goto('/verify');
  const cover = page.getByRole('region', { name: /EVERY LOAN CLAUSE/ });
  await expect(cover).toContainText('Cedar Demo Excavation');
  await page.getByText('Menu', { exact: true }).click();
  const select = page.getByRole('combobox', { name: 'Loan application', exact: true });
  const nextOption = select.locator('option').nth(1);
  const nextName = await nextOption.innerText();
  const nextId = await nextOption.getAttribute('value');
  expect(nextId).toBeTruthy();
  await select.selectOption(nextId!);
  await expect(cover).toContainText(nextName);
  await expect(select).not.toBeVisible();
  await page.getByRole('button', { name: 'Enter Verification Desk' }).click();
  await expect(page.getByRole('combobox', { name: 'Loan application', exact: true })).toHaveValue(nextId!);
  await expect(page.getByRole('navigation', { name: 'Workspace' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Contract upload', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/verify$/);
});

test('reduced motion disables decoration and desk entrance animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/verify');
  await expect(page.getByRole('button', { name: 'Enter Verification Desk' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
  const decorativeImages = page.locator('img');
  await expect.poll(() => decorativeImages.evaluateAll(images => images.every(image => image.closest('[aria-hidden="true"]') !== null || image.getAttribute('alt') === ''))).toBe(true);
  await page.getByRole('button', { name: 'Enter Verification Desk' }).click();
  await expect(page.getByRole('heading', { name: 'Verify a loan contract', exact: true })).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test('the stage ruler follows sample progress and resets for the next verification', async ({ page }) => {
  await page.goto('/verify');
  await page.getByRole('button', { name: 'Enter Verification Desk' }).click();
  const ruler = page.getByRole('list', { name: 'Verification stages' });
  await expect(ruler.getByRole('listitem')).toHaveCount(4);
  await expect(ruler.locator('[aria-current="step"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try a sample verification' }).click();
  for (const stage of ['Reading pages', 'Equipment claims', 'Borrower limits', 'Evidence summary']) {
    await expect(ruler.locator('[aria-current="step"]')).toContainText(stage);
  }
  await expect(page.getByRole('heading', { name: 'Verification complete', exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('log', { name: 'Verification messages' })).toContainText('Verification checks finished.');
  await expect(ruler.locator('[aria-current="step"]')).toContainText('Evidence summary');
  await expect(page.getByRole('button', { name: 'Enter Verification Desk' })).toHaveCount(0);
  await page.getByRole('button', { name: 'New verification', exact: true }).click();
  await expect(ruler.locator('[aria-current="step"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Choose contract', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Enter Verification Desk' })).toHaveCount(0);
});
