import { test, expect, type Page } from '@playwright/test';
import { E2E, getJobStatus } from '../support/admin.js';

// A minimal valid 1x1 PNG — the "photo of the delivered goods". Inline so
// there is no binary fixture to maintain.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/app/');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

// The app is a multi-page SPA now; delivery lives on the Active Jobs page.
async function goToActiveJobs(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Active Jobs' }).click();
  await expect(page.getByRole('heading', { name: 'Active Jobs' })).toBeVisible();
}

test('landing invites the driver into the app', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Fill your empty return legs.' })).toBeVisible();
  await page.getByRole('link', { name: 'Open the driver app' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('a shipper posts a load through the UI', async ({ page }) => {
  await signIn(page, E2E.shipperEmail, E2E.shipperPassword);
  await expect(page.getByRole('heading', { name: 'Post a load' })).toBeVisible();

  await page.getByLabel('Collection address').fill('10 Distribution Way');
  await page.getByLabel('Collection town').fill('Trafford');
  await page.getByLabel('Collection postcode').fill('M17 1WS');
  await page.getByLabel('Delivery address').fill('5 Harbour Road');
  await page.getByLabel('Delivery town').fill('Leith');
  await page.getByLabel('Delivery postcode').fill('EH6 6JJ');
  await page.getByLabel('Description').fill('Mixed pallets');
  await page.getByLabel('Weight (kg)').fill('14200');
  await page.getByLabel('Pallets').fill('16');
  await page.getByLabel('Price (£)').fill('680');
  await page.getByLabel('Collect by').fill('2026-08-02');
  await page.getByLabel('Deliver by').fill('2026-08-03');

  await page.getByRole('button', { name: 'Post load' }).click();
  await expect(page.getByRole('heading', { name: 'Load posted' })).toBeVisible();
});

test('the guide explains how it works', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'How it works' }).click();
  await expect(page.getByRole('heading', { name: 'How MyBackHaul works' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'For drivers — the 30-second moment' })).toBeVisible();
});

test('a user in multiple tenants switches which they act as', async ({ page }) => {
  await signIn(page, E2E.multiEmail, E2E.multiPassword);
  const switcher = page.getByLabel('Acting as');
  await expect(switcher).toBeVisible();

  await switcher.selectOption(E2E.shipperTenantId);
  await expect(page.getByRole('heading', { name: 'Post a load' })).toBeVisible();

  await switcher.selectOption(E2E.carrierTenantId);
  await expect(page.getByRole('heading', { name: 'Post a load' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Available loads|No loads available/ })).toBeVisible();
});

test('a carrier browses available loads and accepts one', async ({ page }) => {
  await signIn(page, E2E.joblessEmail, E2E.joblessPassword);
  // No active job -> the carrier sees the browse (loads read from Firestore).
  await expect(page.getByRole('heading', { name: 'Available loads' })).toBeVisible();
  const row = page.getByRole('listitem').filter({ hasText: 'Avonmouth → Cardiff' });
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Accept load' }).click();

  // Accepted -> the driver now has an active delivery on the Active Jobs page.
  await goToActiveJobs(page);
  await expect(page.getByRole('heading', { name: 'Mark delivered' })).toBeVisible();
});

test('the active job is read from Firestore and shows its route', async ({ page }) => {
  await signIn(page, E2E.email, E2E.password);
  await goToActiveJobs(page);
  await expect(page.getByRole('heading', { name: 'Mark delivered' })).toBeVisible();
  await expect(page.getByText(/Trafford.*Leith/)).toBeVisible();
});

test('capture refuses to submit without the required proof', async ({ page }) => {
  await signIn(page, E2E.email, E2E.password);
  await goToActiveJobs(page);
  await expect(page.getByRole('heading', { name: 'Mark delivered' })).toBeVisible();
  await page.getByRole('button', { name: 'Record delivery' }).click();
  await expect(page.getByRole('heading', { name: 'Delivery recorded' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Mark delivered' })).toBeVisible();
});

test('a driver sees earnings from delivered jobs', async ({ page }) => {
  await signIn(page, E2E.email, E2E.password);
  await page.getByRole('link', { name: 'Earnings' }).click();
  await expect(page.getByRole('heading', { name: /Earnings/ })).toBeVisible();

  // The seeded delivered job (Hull → Newport, £915) appears with its pay.
  const row = page.getByRole('listitem').filter({ hasText: 'Hull → Newport' });
  await expect(row).toBeVisible();
  await expect(row).toContainText('£915.00');
});

test('a carrier adds a vehicle to their fleet', async ({ page }) => {
  await signIn(page, E2E.joblessEmail, E2E.joblessPassword);
  await page.getByRole('link', { name: 'Profile' }).click();
  await expect(page.getByRole('heading', { name: 'Your vehicles' })).toBeVisible();

  await page.getByLabel('Registration').fill('MB03 HAL');
  await page.getByLabel('Type').selectOption('rigid');
  await page.getByLabel('Capacity (kg)').fill('18000');
  await page.getByRole('button', { name: 'Add vehicle' }).click();

  // The dispatch reaches Firestore through the functions emulator and the
  // fleet re-reads, showing the new vehicle.
  const row = page.getByRole('listitem').filter({ hasText: 'MB03 HAL' });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Rigid');
});

test('a user edits their account profile', async ({ page }) => {
  await signIn(page, E2E.joblessEmail, E2E.joblessPassword);
  await page.getByRole('link', { name: 'Profile' }).click();
  await expect(page.getByRole('heading', { name: 'Edit profile' })).toBeVisible();

  await page.getByLabel('Name').fill('Nadia Driver');
  await page.getByLabel('Phone').fill('07700 900123');
  await page.getByRole('button', { name: 'Save profile' }).click();

  // The dispatch reaches Firestore through the functions emulator; on success
  // the saved banner shows and the header reflects the new name.
  await expect(page.getByText('Profile saved')).toBeVisible();
  await expect(page.getByText('Nadia Driver')).toBeVisible();
});

test('a new user creates their company and lands on the dashboard', async ({ page }) => {
  await signIn(page, E2E.newbieEmail, E2E.newbiePassword);
  await expect(page.getByRole('heading', { name: 'Create your company' })).toBeVisible();

  await page.getByLabel('Company name').fill('Solo Haulage Ltd');
  await page.getByLabel('Post loads (shipper)').check();
  await page.getByRole('button', { name: 'Create company' }).click();

  // Onboarded: the app refreshes memberships, selects the new tenant, and the
  // shipper dashboard (post a load) renders.
  await expect(page.getByRole('heading', { name: 'Post a load' })).toBeVisible();
});

// Runs LAST — it delivers the seeded job (terminal), so it must not precede the
// tests that need the job still active.
test('the 30-second moment closes the loop to Firestore', async ({ page }) => {
  await signIn(page, E2E.email, E2E.password);
  await goToActiveJobs(page);
  await expect(page.getByRole('heading', { name: 'Mark delivered' })).toBeVisible();

  await page.setInputFiles('input[type="file"]', { name: 'pod.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText(/photo\(s\) captured/)).toBeVisible();
  await page.getByPlaceholder('Who took delivery?').fill('J. Smith');

  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('signature canvas not found');
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 90, { steps: 12 });
  await page.mouse.move(box.x + 260, box.y + 40, { steps: 12 });
  await page.mouse.up();

  await page.getByRole('button', { name: 'Record delivery' }).click();
  await expect(page.getByRole('heading', { name: 'Delivery recorded' })).toBeVisible();

  // The real proof: the authenticated dispatch reached Firestore through the
  // functions emulator and the job is now delivered.
  await expect.poll(() => getJobStatus(E2E.jobId), { timeout: 15_000 }).toBe('delivered');
});
