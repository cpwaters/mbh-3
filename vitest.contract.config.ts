import { defineConfig } from 'vitest/config';

// The contract suite against the real provider on the Firestore emulator.
// Run via `pnpm test:contract`, which wraps this in firebase emulators:exec.
export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.contract.test.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
