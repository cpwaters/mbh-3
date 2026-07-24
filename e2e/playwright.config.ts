import { defineConfig, devices } from '@playwright/test';

// Browser journeys against the FULL emulator stack (auth + firestore +
// functions + hosting). The Firebase Hosting emulator (port 5000) serves the
// emulator-flavoured web bundle and rewrites /api/** + /health to the functions
// emulator, so a signed-in capture closes the loop to real Firestore. The
// stack is started by `scripts/run-e2e.sh` via `firebase emulators:exec`;
// globalSetup seeds the auth user + job. Selectors are user-visible text only.
export default defineConfig({
  testDir: './tests',
  globalSetup: './support/global-setup.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // shared seeded job — run serially
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:5000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
