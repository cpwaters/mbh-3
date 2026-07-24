import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.ts', 'tooling/**/*.test.ts'],
    // Contract tests run against the Firestore emulator (pnpm test:contract),
    // never in the Firebase-free unit run.
    exclude: ['**/node_modules/**', '**/*.contract.test.ts'],
  },
});
