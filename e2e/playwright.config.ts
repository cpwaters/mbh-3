import { defineConfig, devices } from '@playwright/test';

// Browser journeys against the real production web bundle, served by
// `astro preview`. The core delivery flow is offline-first, so it needs no
// backend — the E2E asserts the browser DOM/React behaviour (and the honest
// "saved on-device, waiting for signal" UX) that the HTTP-level
// functions-integration test cannot see. Selectors are user-visible text only:
// if the words change, the test should fail.
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // dist is built by `pnpm test:e2e` (or CI's build step) before this runs.
    command: 'pnpm --filter @mbh/web preview --port 4321',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
