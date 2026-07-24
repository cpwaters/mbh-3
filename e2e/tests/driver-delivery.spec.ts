import { test, expect, type Page } from '@playwright/test';
import { E2E, getJobStatus } from '../support/admin.js';

// A minimal valid 1x1 PNG — the "photo of the delivered goods". Inline so
// there is no binary fixture to maintain.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function signIn(page: Page, query = ''): Promise<void> {
  await page.goto(`/app/${query}`);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email').fill(E2E.email);
  await page.getByLabel('Password').fill(E2E.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('landing invites the driver into the app', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Fill your empty return legs.' })).toBeVisible();
  await page.getByRole('link', { name: 'Open the driver app' }).click();
  // Signed out, the app asks the driver to sign in.
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('signed in with no active job shows an honest empty state', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'No active job' })).toBeVisible();
});

test('the 30-second moment closes the loop to Firestore', async ({ page }) => {
  await signIn(page, `?job=${E2E.jobId}&carrier=${E2E.carrierTenantId}`);
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
  await expect
    .poll(() => getJobStatus(E2E.jobId), { timeout: 15_000 })
    .toBe('delivered');
});

test('capture refuses to submit without the required proof', async ({ page }) => {
  await signIn(page, `?job=${E2E.jobId}&carrier=${E2E.carrierTenantId}`);
  await expect(page.getByRole('heading', { name: 'Mark delivered' })).toBeVisible();
  await page.getByRole('button', { name: 'Record delivery' }).click();
  await expect(page.getByRole('heading', { name: 'Delivery recorded' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Mark delivered' })).toBeVisible();
});
