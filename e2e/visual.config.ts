import { defineConfig, devices } from '@playwright/test';

// Responsive / visual review against the full emulator stack (same hosting
// emulator on :5000 as the journey suite). Kept in its own testDir + config so
// it can be run and re-run independently while iterating on layout, without
// touching the ordered journey suite. Started via `firebase emulators:exec`.
export default defineConfig({
  testDir: './visual',
  globalSetup: './support/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5000',
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
