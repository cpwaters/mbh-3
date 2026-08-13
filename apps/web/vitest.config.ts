import { defineConfig } from 'vitest/config';

// Tests for the web app — jsdom, Testing Library. Separate from the root
// vitest.config.ts (packages/**, Firebase-free, node environment): different
// runtime (DOM vs pure logic) warrants its own project, matching the repo's
// existing pattern of one script per test tier (test:rules, test:contract,
// test:functions). Plain .ts is included too: browser-only helpers under
// src/lib (reading an uploaded spreadsheet, say) need the DOM but are not
// components.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
});
