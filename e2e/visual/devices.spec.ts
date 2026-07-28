import { test, expect, devices } from '@playwright/test';
import { E2E } from '../support/admin.js';

// Faithful mobile emulation: unlike resizing Desktop Chrome, these device
// profiles set isMobile, touch, the mobile UA, and the true mobile viewport —
// the closest Playwright gets to a real phone, and what catches a viewport-meta
// or mobile-only rendering bug that a plain viewport resize would miss.
const SHOTS = process.env.VISUAL_SHOTS_DIR ?? new URL('../.visual-shots', import.meta.url).pathname;

for (const name of ['iPhone 13', 'Pixel 7', 'iPad (gen 7)'] as const) {
  // Keep the viewport/isMobile/UA emulation but drop defaultBrowserType, which
  // Playwright forbids inside a describe (it would force a new worker); the
  // config's chromium project runs it.
  const profile = { ...devices[name] };
  delete (profile as { defaultBrowserType?: unknown }).defaultBrowserType;

  test.describe(name, () => {
    test.use(profile);

    test('the app fits the device screen', async ({ page }) => {
      await page.goto('/app/');
      await page.getByLabel('Email').fill(E2E.email);
      await page.getByLabel('Password', { exact: true }).fill(E2E.password);
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Available Loads' })).toBeVisible();

      const m = await page.evaluate(() => {
        const el = document.scrollingElement ?? document.documentElement;
        return { scrollWidth: el.scrollWidth, innerWidth: window.innerWidth };
      });
      const slug = name.replace(/\s+/g, '');
      await page.screenshot({ path: `${SHOTS}/device-${slug}-dashboard.png`, fullPage: true });
      expect(m.scrollWidth, `${name}: ${JSON.stringify(m)}`).toBeLessThanOrEqual(m.innerWidth + 1);

      // The bottom tab bar must sit fully on-screen (a common mobile cut-off).
      const bar = page.locator('nav ~ div').last();
      await expect(page.getByRole('link', { name: 'Profile', exact: true })).toBeVisible();
      const box = await bar.boundingBox();
      if (box !== null) {
        expect(box.x, `${name}: bottom bar starts off-screen`).toBeGreaterThanOrEqual(-1);
        expect(box.x + box.width, `${name}: bottom bar runs off-screen`).toBeLessThanOrEqual(m.innerWidth + 1);
      }
    });
  });
}
