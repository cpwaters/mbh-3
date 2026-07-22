import { defineConfig } from 'vitest/config';

// Functions integration tests: the real dispatch function in the emulator.
// Run via `pnpm test:functions`, which builds functions and wraps this in
// firebase emulators:exec --only functions,firestore,auth.
export default defineConfig({
  test: {
    include: ['functions/integration/**/*.integration.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
