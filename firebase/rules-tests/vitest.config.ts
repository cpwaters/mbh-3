import { defineConfig } from 'vitest/config';

// Rules tests run against the Firestore emulator (started by
// firebase emulators:exec), so they are single-threaded and kept out of the
// main unit suite.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
