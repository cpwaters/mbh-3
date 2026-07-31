import { test, expect, type Page } from '@playwright/test';
import { E2E, getJobStatus, getLoadStatus } from '../support/admin.js';

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

// Delivery is location-gated now: the Mark delivered card only appears once the
// device's GPS shows it has reached the destination (≥95% of the journey).
// Grant permission and park the device on the job's destination so the gate
// clears; the app auto-resumes tracking when permission is already granted.
async function arriveAtDestination(page: Page, latitude: number, longitude: number): Promise<void> {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude, longitude });
}
// job-e2e (Trafford → Leith) and the browse job (Avonmouth → Cardiff) destinations.
const LEITH = { latitude: 55.9758, longitude: -3.1706 };
const CARDIFF = { latitude: 51.4816, longitude: -3.1791 };

test('landing invites the driver into the app', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Fill your empty return legs.' })).toBeVisible();
  await page.getByRole('link', { name: 'Open the driver app' }).click();
  await expect(page.getByText('Sign in to your driver account')).toBeVisible();
});

test('a shipper posts a load through the distributor UI', async ({ page }) => {
  await signIn(page, E2E.shipperEmail, E2E.shipperPassword);
  await expect(page.getByRole('heading', { name: 'All Loads' })).toBeVisible();
  await page.getByRole('link', { name: 'Create Load' }).click();
  await expect(page.getByRole('heading', { name: 'Create New Load' })).toBeVisible();

  await page.locator('#source_company_name').fill('Tesco DC');
  await page.locator('#source_street').fill('10 Distribution Way');
  await page.locator('#source_city').fill('Trafford');
  await page.locator('#source_postcode').fill('M17 1WS');
  await page.locator('#source_contact_name').fill('John Smith');
  await page.locator('#source_contact_email').fill('john@tesco.test');
  await page.locator('#destination_company_name').fill('Asda Leith');
  await page.locator('#destination_street').fill('5 Harbour Road');
  await page.locator('#destination_city').fill('Leith');
  await page.locator('#destination_postcode').fill('EH6 6JJ');
  await page.locator('#destination_contact_name').fill('Sarah Johnson');
  await page.locator('#destination_contact_email').fill('sarah@asda.test');
  await page.locator('#description').fill('Mixed pallets');
  await page.locator('#weight_kg').fill('14200');
  await page.locator('#pallet_count').fill('16');
  await page.locator('#price').fill('680');
  await page.locator('#pickup_date').fill('2026-08-02');
  await page.locator('#pickup_time').fill('09:00');
  await page.locator('#delivery_date').fill('2026-08-03');
  await page.locator('#delivery_time').fill('17:00');

  await page.getByRole('button', { name: 'Create Load' }).click();
  await expect(page.getByText('Load created successfully!')).toBeVisible();

  // It shows up on the All Loads page.
  await page.getByRole('link', { name: 'All Loads' }).click();
  await expect(page.getByText('Trafford, M17 1WS')).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'All Loads' })).toBeVisible();

  await switcher.selectOption(E2E.carrierTenantId);
  await expect(page.getByRole('heading', { name: 'All Loads' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Available Loads' })).toBeVisible();
});

test('a carrier browses available loads and accepts one', async ({ page }) => {
  // Park at the destination first: after accepting, GPS progress drives the
  // job accepted → collected → in_transit and clears the delivery gate.
  await arriveAtDestination(page, CARDIFF.latitude, CARDIFF.longitude);
  await signIn(page, E2E.joblessEmail, E2E.joblessPassword);
  // No active job -> the carrier sees the browse (loads read from Firestore).
  await expect(page.getByRole('heading', { name: 'Available Loads' })).toBeVisible();
  // The prototype JobCard shows origin/destination on separate lines.
  const row = page.locator('div.rounded-lg.shadow-md').filter({ hasText: 'Avonmouth' }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText('Cardiff');

  await row.getByRole('button', { name: 'Accept Load' }).click();

  // Accepted -> the driver now has an active delivery on the Active Jobs page.
  // GPS progress advances the real status to in_transit, so the location-gated
  // Mark delivered card appears.
  await goToActiveJobs(page);
  await expect(page.getByRole('heading', { name: 'Mark delivered' })).toBeVisible();
});

test('the active job is read from Firestore and shows its route', async ({ page }) => {
  await arriveAtDestination(page, LEITH.latitude, LEITH.longitude);
  await signIn(page, E2E.email, E2E.password);
  await goToActiveJobs(page);
  await expect(page.getByRole('heading', { name: 'Mark delivered' })).toBeVisible();
  // The route shows on both the job card and the delivery card — first is fine.
  await expect(page.getByText('Trafford, M17 1WS').first()).toBeVisible();
  await expect(page.getByText('Leith, EH6 6JJ').first()).toBeVisible();
  // After accepting, the driver sees the full collection/delivery name + address.
  await expect(page.getByText('Tesco Distribution')).toBeVisible();
  await expect(page.getByText('10 Distribution Way, Trafford, M17 1WS')).toBeVisible();
  await expect(page.getByText('Asda Leith')).toBeVisible();
});

test('capture refuses to submit without the required proof', async ({ page }) => {
  await arriveAtDestination(page, LEITH.latitude, LEITH.longitude);
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

  // Onboarded: the app refreshes memberships, selects the new shipper tenant,
  // and the distributor app (All Loads) renders.
  await expect(page.getByRole('heading', { name: 'All Loads' })).toBeVisible();
});

test('the founder sees a nav bar to home and the carrier/shipper sign-up pages', async ({ page }) => {
  await signIn(page, E2E.founderEmail, E2E.founderPassword);
  // The founder toolbar sits above the app nav.
  await expect(page.getByText('Founder')).toBeVisible();
  const carrier = page.getByRole('link', { name: 'Carrier sign-up' });
  const shipper = page.getByRole('link', { name: 'Shipper sign-up' });
  await expect(carrier).toBeVisible();
  await expect(shipper).toBeVisible();
  if (process.env.SHOT_PATH) await page.screenshot({ path: process.env.SHOT_PATH, fullPage: true });

  // Each link opens its role-specific sign-up page.
  await carrier.click();
  await expect(page.getByText('Create your carrier account')).toBeVisible();
  await page.getByRole('link', { name: 'Shipper sign-up' }).click();
  await expect(page.getByText('Create your shipper account')).toBeVisible();
});

test('the founder completes a job, returning its load to Available Loads', async ({ page }) => {
  await signIn(page, E2E.founderEmail, E2E.founderPassword);
  await goToActiveJobs(page);
  // The founder's active job (Preston -> Blackpool) with the founder-only button.
  await expect(page.getByText('Preston, PR1 2AB').first()).toBeVisible();
  await page.getByRole('button', { name: 'Complete' }).click();

  // The job clears from the driver's view...
  await expect(page.getByRole('heading', { name: 'No Active Jobs' })).toBeVisible();
  // ...the job doc is gone and the load is back in the available pool.
  await expect.poll(() => getJobStatus(E2E.founderJobId), { timeout: 15_000 }).toBeUndefined();
  await expect.poll(() => getLoadStatus(E2E.founderLoadId), { timeout: 15_000 }).toBe('available');
});

// Runs LAST — it delivers the seeded job (terminal), so it must not precede the
// tests that need the job still active.
test('the 30-second moment closes the loop to Firestore', async ({ page }) => {
  await arriveAtDestination(page, LEITH.latitude, LEITH.longitude);
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
