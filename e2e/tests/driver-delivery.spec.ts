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

test('landing invites the driver into the app', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Fill your empty return legs.' })).toBeVisible();
  await page.getByRole('link', { name: 'Open the driver app' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('a carrier browses available loads and accepts one', async ({ page }) => {
  await signIn(page, E2E.joblessEmail, E2E.joblessPassword);
  // No active job -> the carrier sees the browse (loads read from Firestore).
  await expect(page.getByRole('heading', { name: 'Available loads' })).toBeVisible();
  await expect(page.getByText('Avonmouth → Cardiff')).toBeVisible();

  await page.getByRole('button', { name: 'Accept load' }).click();

  // Accepted -> the home switches to the delivery capture for the new job.
  await expect(page.getByRole('heading', { name: 'Mark delivered' })).toBeVisible();
});

test('the active job is read from Firestore and shows its route', async ({ page }) => {
  await signIn(page, E2E.email, E2E.password);
  // No URL params — the home read the job by the signed-in driver's id.
  await expect(page.getByRole('heading', { name: 'Mark delivered' })).toBeVisible();
  await expect(page.getByText(/Trafford.*Leith/)).toBeVisible();
});

test('capture refuses to submit without the required proof', async ({ page }) => {
  await signIn(page, E2E.email, E2E.password);
  await expect(page.getByRole('heading', { name: 'Mark delivered' })).toBeVisible();
  await page.getByRole('button', { name: 'Record delivery' }).click();
  await expect(page.getByRole('heading', { name: 'Delivery recorded' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Mark delivered' })).toBeVisible();
});

// Runs LAST — it delivers the seeded job (terminal), so it must not precede the
// tests that need the job still active.
test('the 30-second moment closes the loop to Firestore', async ({ page }) => {
  await signIn(page, E2E.email, E2E.password);
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
