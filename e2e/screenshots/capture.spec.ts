import { test, expect, type Page } from '@playwright/test';
import { E2E } from '../support/admin.js';

// Writes documentation screenshots to the site's public dir. cwd is e2e/.
const DIR = '../apps/web/public/guide';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/app/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
}

test('sign-in screen', async ({ page }) => {
  await page.goto('/app/');
  await expect(page.getByText('Sign in to your driver account')).toBeVisible();
  await page.screenshot({ path: `${DIR}/sign-in.png` });
});

test('shipper — post a load', async ({ page }) => {
  await signIn(page, E2E.shipperEmail, E2E.shipperPassword);
  await expect(page.getByRole('heading', { name: 'Post a load' })).toBeVisible();
  await page.getByLabel('Collection town').fill('Trafford');
  await page.getByLabel('Delivery town').fill('Leith');
  await page.getByLabel('Price (£)').fill('680');
  await page.screenshot({ path: `${DIR}/post-a-load.png`, fullPage: true });
});

test('carrier — available loads', async ({ page }) => {
  await signIn(page, E2E.joblessEmail, E2E.joblessPassword);
  await expect(page.getByRole('heading', { name: /Available loads|No loads available/ })).toBeVisible();
  await page.screenshot({ path: `${DIR}/available-loads.png`, fullPage: true });
});

test('driver — map', async ({ page }) => {
  await signIn(page, E2E.email, E2E.password);
  await page.getByRole('link', { name: 'Map' }).click();
  await expect(page.getByRole('heading', { name: 'Map' })).toBeVisible();
  await page.waitForTimeout(1200); // let the tiles paint
  await page.screenshot({ path: `${DIR}/map.png` });
});

test('driver — mark delivered and confirmation', async ({ page }) => {
  await signIn(page, E2E.email, E2E.password);
  await page.getByRole('link', { name: 'Active Jobs' }).click();
  await expect(page.getByRole('heading', { name: 'Mark delivered' })).toBeVisible();
  await page.screenshot({ path: `${DIR}/mark-delivered.png`, fullPage: true });

  await page.setInputFiles('input[type="file"]', { name: 'pod.png', mimeType: 'image/png', buffer: PNG });
  await page.getByPlaceholder('Who took delivery?').fill('J. Smith');
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (box !== null) {
    await page.mouse.move(box.x + 30, box.y + 30);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 80, { steps: 15 });
    await page.mouse.move(box.x + 220, box.y + 50, { steps: 15 });
    await page.mouse.move(box.x + 280, box.y + 100, { steps: 15 });
    await page.mouse.up();
  }
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: 'Record delivery' }).click();
  await expect(page.getByRole('heading', { name: 'Delivery recorded' })).toBeVisible();
  await page.screenshot({ path: `${DIR}/delivery-recorded.png` });
});
