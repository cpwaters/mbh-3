import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.ts'],
    // Unit tests are Firebase-free and run against in-memory providers only.
    // Rules/contract/E2E suites get their own configs as those layers land.
  },
});
