import { defineConfig, devices } from '@playwright/test';

// Captures documentation screenshots of the real app against the full emulator
// stack. Run by hand via `pnpm docs:screenshots` (not in CI) — it writes PNGs
// into apps/web/public/guide/ for the /guide pages to embed. A phone viewport
// matches the mobile-first driver app.
export default defineConfig({
  testDir: './screenshots',
  globalSetup: './support/global-setup.ts',
  timeout: 45_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5000',
    viewport: { width: 400, height: 860 },
    deviceScaleFactor: 2,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
