import { test, expect } from '@playwright/test';

// A minimal valid 1x1 PNG — the "photo of the delivered goods". Kept inline so
// there is no binary fixture to maintain.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

test('landing invites the driver into the app', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Fill your empty return legs.' })).toBeVisible();
  await page.getByRole('link', { name: 'Open the driver app' }).click();
  await expect(page.getByText('No active job')).toBeVisible();
});

test('no active job shows an honest empty state', async ({ page }) => {
  await page.goto('/app/');
  await expect(page.getByRole('heading', { name: 'No active job' })).toBeVisible();
});

test('the 30-second moment: capture a PoD and it saves on-device', async ({ page }) => {
  await page.goto('/app/?job=job-e2e&carrier=carrier-1&origin=Manchester&destination=Edinburgh');
  await expect(page.getByRole('heading', { name: 'Mark delivered' })).toBeVisible();

  // Photo of the delivered goods.
  await page.setInputFiles('input[type="file"]', { name: 'pod.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText(/photo\(s\) captured/)).toBeVisible();

  // Recipient.
  await page.getByPlaceholder('Who took delivery?').fill('J. Smith');

  // Signature: draw on the canvas (Chromium mouse events fire pointer events).
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('signature canvas not found');
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 90, { steps: 12 });
  await page.mouse.move(box.x + 260, box.y + 40, { steps: 12 });
  await page.mouse.up();

  await page.getByRole('button', { name: 'Record delivery' }).click();

  // Succeeds instantly with no signal: confirmation + honest queued state.
  await expect(page.getByRole('heading', { name: 'Delivery recorded' })).toBeVisible();
  await expect(page.getByText('Saved to this device.', { exact: false })).toBeVisible();
  await expect(page.getByText(/waiting/i).first()).toBeVisible();
});

test('capture refuses to submit without the required proof', async ({ page }) => {
  await page.goto('/app/?job=job-e2e&carrier=carrier-1');
  await page.getByRole('button', { name: 'Record delivery' }).click();
  // Stays on the form — no confirmation, the required-proof rule held.
  await expect(page.getByRole('heading', { name: 'Delivery recorded' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Mark delivered' })).toBeVisible();
});
