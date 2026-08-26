import { test, expect } from '@playwright/test';

// Installability is invisible until it breaks: a renamed icon or a malformed
// manifest costs nothing at build time and simply stops the browser offering
// to install, with no error anywhere. These check the things a browser
// actually requires before it will put MyBackHaul on a home screen.

test('the manifest is served and describes an installable app', async ({ page }) => {
  const res = await page.request.get('/manifest.webmanifest');
  expect(res.status()).toBe(200);

  const manifest = JSON.parse(await res.text()) as {
    name: string;
    start_url: string;
    display: string;
    icons: { src: string; sizes: string; type: string; purpose?: string }[];
  };

  expect(manifest.name).toBe('MyBackHaul');
  expect(manifest.display).toBe('standalone');
  // Launching an installed app onto the marketing page would be a bad joke.
  expect(manifest.start_url).toBe('/app');

  // Chrome will not offer to install without an icon of at least 192px...
  const widths = manifest.icons.map((i) => Number(i.sizes.split('x')[0]));
  expect(Math.max(...widths)).toBeGreaterThanOrEqual(512);
  expect(widths.some((w) => w >= 192)).toBe(true);
  // ...and Android crops a non-maskable icon into a circle, clipping the mark.
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);

  // Every icon must actually be there. A 404 here is the whole feature gone.
  for (const icon of manifest.icons) {
    const img = await page.request.get(icon.src);
    expect(img.status(), `${icon.src} should be served`).toBe(200);
    expect(img.headers()['content-type']).toContain('image');
  }
});

test('the homepage carries an iOS icon and registers the service worker', async ({ page }) => {
  await page.goto('/');

  // iOS ignores the manifest's icons; without this an install gets a
  // screenshot of the page as its home-screen icon.
  const appleIcon = page.locator('link[rel="apple-touch-icon"]');
  await expect(appleIcon).toHaveCount(1);
  const href = await appleIcon.getAttribute('href');
  if (href === null) throw new Error('apple-touch-icon has no href');
  expect((await page.request.get(href)).status()).toBe(200);

  // The browser only offers to install once a service worker controls the
  // page the visitor is on — which is this one, not /app.
  await expect
    .poll(
      () =>
        page.evaluate(async () => (await navigator.serviceWorker.getRegistration()) !== undefined),
      { timeout: 15_000 }
    )
    .toBe(true);
});
