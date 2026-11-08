import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
export async function settleMotion(page: Page) {
  // Audit settled colors without waiting on decorative loops or working indicators.
  await page.waitForFunction(() => document.getAnimations().every(animation =>
    animation.effect?.getTiming().iterations === Infinity || (!animation.pending && animation.playState !== 'running')));
}
export async function capture(page: Page, name: string) {
  mkdirSync('../../.impeccable/review', { recursive: true });
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(() => window.scrollY === 0);
  await page.screenshot({ path: `../../.impeccable/review/${name}`, fullPage: true, animations: 'disabled' });
}
