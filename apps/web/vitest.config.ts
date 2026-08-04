import { defineConfig } from 'vitest/config';

// Component tests for the React islands — jsdom, Testing Library. Separate
// from the root vitest.config.ts (packages/**, Firebase-free, node
// environment): different runtime (DOM vs pure logic) warrants its own
// project, matching the repo's existing pattern of one script per test tier
// (test:rules, test:contract, test:functions).
export default defineConfig({
  test: {
    include: ['src/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
});
