import { test, expect, type Page } from '@playwright/test';
import { E2E } from '../support/admin.js';

// Absolute scratchpad dir so the screenshots can be inspected outside the repo.
const SHOTS =
  '/private/tmp/claude-501/-Users-Chriswaters-Projects-MyHaul-mbh/e557046e-277a-41e1-8738-13c5401162cf/scratchpad/shots';

// The lg breakpoint (1024px) switches nav from the mobile bottom bar to the
// desktop top pills, which use different link labels.
const LG = 1024;

const VIEWPORTS = [
  { name: '320-small', width: 320, height: 720 },
  { name: '390-phone', width: 390, height: 844 },
  { name: '820-tablet', width: 820, height: 1180 },
  { name: '1280-desktop', width: 1280, height: 800 },
];

// Pages to walk, with the nav link label above/below lg and the heading that
// confirms arrival.
const PAGES = [
  { key: 'dashboard', desktop: 'Dashboard', mobile: 'Home', heading: /Available Loads/ },
  { key: 'active', desktop: 'Active Jobs', mobile: 'Jobs', heading: /Active Jobs/ },
  { key: 'map', desktop: 'Map', mobile: 'Map', heading: /Route Map/ },
  { key: 'earnings', desktop: 'Earnings', mobile: 'Earn', heading: /Earnings/ },
  { key: 'profile', desktop: 'Profile', mobile: 'Profile', heading: /Profile/ },
];

async function signIn(page: Page): Promise<void> {
  await page.goto('/app/');
  await page.getByLabel('Email').fill(E2E.email);
  await page.getByLabel('Password', { exact: true }).fill(E2E.password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
}

async function measureOverflow(page: Page): Promise<{ scrollWidth: number; innerWidth: number }> {
  return page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return { scrollWidth: el.scrollWidth, innerWidth: window.innerWidth };
  });
}

// The distributor (shipper) app, at mobile + desktop.
for (const vp of [
  { name: '390-phone', width: 390, height: 844 },
  { name: '1280-desktop', width: 1280, height: 800 },
]) {
  test(`distributor app has no horizontal overflow @ ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/app/');
    await page.getByLabel('Email').fill(E2E.shipperEmail);
    await page.getByLabel('Password', { exact: true }).fill(E2E.shipperPassword);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'All Loads' })).toBeVisible();
    let m = await measureOverflow(page);
    expect(m.scrollWidth, `dist loads @ ${vp.name}`).toBeLessThanOrEqual(m.innerWidth + 1);
    await page.screenshot({ path: `${SHOTS}/dist-${vp.name}-loads.png`, fullPage: true });

    const createLink = vp.width >= LG ? 'Create Load' : 'Create';
    await page.getByRole('link', { name: createLink, exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Create New Load' })).toBeVisible();
    await page.waitForTimeout(150);
    m = await measureOverflow(page);
    expect(m.scrollWidth, `dist create @ ${vp.name}`).toBeLessThanOrEqual(m.innerWidth + 1);
    await page.screenshot({ path: `${SHOTS}/dist-${vp.name}-create.png`, fullPage: true });
  });
}

// Public pages (no auth) — the first thing a mobile visitor meets.
const PUBLIC = [
  { key: 'landing', path: '/', heading: /Fill your empty/ },
  { key: 'guide', path: '/guide', heading: /How MyBackHaul works/ },
  { key: 'signin', path: '/app/', heading: /MyBackHaul/ },
];

for (const vp of VIEWPORTS) {
  test(`public pages have no horizontal overflow @ ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const problems: string[] = [];
    for (const p of PUBLIC) {
      await page.goto(p.path);
      await expect(page.getByRole('heading', { name: p.heading }).first()).toBeVisible();
      await page.waitForTimeout(150);
      const { scrollWidth, innerWidth } = await measureOverflow(page);
      if (scrollWidth > innerWidth + 1) {
        problems.push(`${p.key}: scrollWidth ${scrollWidth} > innerWidth ${innerWidth}`);
      }
      await page.screenshot({ path: `${SHOTS}/${vp.name}-${p.key}.png`, fullPage: true });
    }
    expect(problems, `horizontal overflow at ${vp.name}:\n${problems.join('\n')}`).toEqual([]);
  });
}

for (const vp of VIEWPORTS) {
  test(`layout has no horizontal overflow @ ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'Available Loads' })).toBeVisible();

    const problems: string[] = [];
    for (const p of PAGES) {
      const label = vp.width >= LG ? p.desktop : p.mobile;
      await page.getByRole('link', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { name: p.heading })).toBeVisible();
      // Let the map tiles / async content settle before measuring + shooting.
      await page.waitForTimeout(p.key === 'map' ? 1200 : 200);

      const { scrollWidth, innerWidth } = await measureOverflow(page);
      if (scrollWidth > innerWidth + 1) {
        problems.push(`${p.key}: scrollWidth ${scrollWidth} > innerWidth ${innerWidth}`);
      }
      await page.screenshot({ path: `${SHOTS}/${vp.name}-${p.key}.png`, fullPage: true });
    }

    expect(problems, `horizontal overflow at ${vp.name}:\n${problems.join('\n')}`).toEqual([]);
  });
}
