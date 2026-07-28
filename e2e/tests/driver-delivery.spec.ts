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
  await expect(page.getByText('Sign in to your driver account')).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
}

// The app is a multi-page SPA now; delivery lives on the Active Jobs page.
async function goToActiveJobs(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Active Jobs' }).click();
  // exact: the page title "Active Jobs" must not also match "No Active Jobs".
  await expect(page.getByRole('heading', { name: 'Active Jobs', exact: true })).toBeVisible();
}

test('landing invites the driver into the app', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Fill your empty return legs.' })).toBeVisible();
  await page.getByRole('link', { name: 'Open the driver app' }).click();
  await expect(page.getByText('Sign in to your driver account')).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Available Loads' })).toBeVisible();
});

test('a carrier browses available loads and accepts one', async ({ page }) => {
  await signIn(page, E2E.joblessEmail, E2E.joblessPassword);
  // No active job -> the carrier sees the browse (loads read from Firestore).
  await expect(page.getByRole('heading', { name: 'Available Loads' })).toBeVisible();
  // The prototype JobCard shows origin/destination on separate lines.
  const row = page.locator('div.rounded-lg.shadow-md').filter({ hasText: 'Avonmouth' }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText('Cardiff');

  await row.getByRole('button', { name: 'Accept Load' }).click();

  // Accepted -> the driver now has an active delivery on the Active Jobs page.
  await goToActiveJobs(page);
  await expect(page.getByRole('heading', { name: 'Mark delivered' })).toBeVisible();
});

test('the active job is read from Firestore and shows its route', async ({ page }) => {
  await signIn(page, E2E.email, E2E.password);
  await goToActiveJobs(page);
  await expect(page.getByRole('heading', { name: 'Mark delivered' })).toBeVisible();
  // The route shows on both the job card and the delivery card — first is fine.
  await expect(page.getByText('Trafford, M17 1WS').first()).toBeVisible();
  await expect(page.getByText('Leith, EH6 6JJ').first()).toBeVisible();
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

  // The seeded delivered job (Hull → Newport, £915) appears in Recent Trips.
  await expect(page.getByText('Hull → Newport')).toBeVisible();
  await expect(page.getByText('£915.00').first()).toBeVisible();
});

test('a carrier adds a vehicle to their fleet', async ({ page }) => {
  await signIn(page, E2E.joblessEmail, E2E.joblessPassword);
  await page.getByRole('link', { name: 'Profile' }).click();
  await expect(page.getByRole('heading', { name: 'My Profile' })).toBeVisible();
  await page.getByRole('button', { name: 'Add Vehicle' }).first().click();
  await expect(page.getByRole('heading', { name: 'Add Vehicle' })).toBeVisible();

  await page.getByLabel('Make *', { exact: true }).fill('Volvo');
  await page.getByLabel('Model *', { exact: true }).fill('FH16');
  await page.getByLabel('Year *', { exact: true }).fill('2021');
  await page.getByLabel('Registration Number *', { exact: true }).fill('MB03 HAL');
  await page.getByLabel('Vehicle Type *', { exact: true }).selectOption('rigid');
  await page.getByLabel('Vehicle Configuration *', { exact: true }).selectOption('flatbed');
  await page.getByRole('button', { name: 'Add Vehicle' }).click();

  // Back on Profile, the new vehicle shows in the fleet.
  await expect(page.getByRole('heading', { name: 'My Profile' })).toBeVisible();
  await expect(page.getByText('MB03 HAL')).toBeVisible();
  await expect(page.getByText('Volvo FH16')).toBeVisible();
});

test('a user edits their account profile', async ({ page }) => {
  await signIn(page, E2E.joblessEmail, E2E.joblessPassword);
  await page.getByRole('link', { name: 'Profile' }).click();
  await expect(page.getByRole('heading', { name: 'My Profile' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Profile' }).click();
  await expect(page.getByRole('heading', { name: 'Edit Profile' })).toBeVisible();

  await page.getByLabel('Username *', { exact: true }).fill('nadia');
  await page.getByLabel('First Name *', { exact: true }).fill('Nadia');
  await page.getByLabel('Last Name *', { exact: true }).fill('Driver');
  await page.getByLabel('Email *', { exact: true }).fill('nadia@example.com');
  await page.getByLabel('Company Name *', { exact: true }).fill('Solo Haulage');
  await page.getByLabel('Street *', { exact: true }).fill('1 Depot Road');
  await page.getByLabel('City *', { exact: true }).fill('Leeds');
  await page.getByLabel('Postcode *', { exact: true }).fill('LS1 1AA');
  await page.getByLabel('Contact Name *', { exact: true }).fill('Nadia Driver');
  await page.getByLabel('Contact Email *', { exact: true }).fill('nadia@example.com');
  await page.getByRole('button', { name: 'Save Profile' }).click();

  // On success the confirmation shows, then it returns to the profile.
  await expect(page.getByText('Profile saved successfully!')).toBeVisible();
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
  await canvas.scrollIntoViewIfNeeded(); // it sits below the job card now
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
