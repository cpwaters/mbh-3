import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// Vendor SDKs, framework code, and browser APIs are forbidden in the pure
// layers (domain, offline, auth, actions, provider interfaces, mocks).
// Each vendor SDK is allowed in exactly one providers/<vendor> package.
const PURE_LAYER_GLOBS = [
  'packages/domain/**/*.ts',
  'packages/offline/**/*.ts',
  'packages/auth/**/*.ts',
  'packages/actions/**/*.ts',
  'packages/providers/interfaces/**/*.ts',
  'packages/providers/mocks/**/*.ts',
];

const FORBIDDEN_IN_PURE_LAYERS = [
  'firebase',
  'firebase/*',
  'firebase-admin',
  'firebase-admin/*',
  'firebase-functions',
  'firebase-functions/*',
  '@firebase/*',
  'react',
  'react-dom',
  'react/*',
  'react-dom/*',
];

export default tseslint.config(
  {
    // Generated output and Astro's generated type files are not ours to lint.
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.js',
      '!eslint.config.js',
      'apps/web/.astro/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: PURE_LAYER_GLOBS,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [],
          patterns: FORBIDDEN_IN_PURE_LAYERS.map((name) => ({
            group: [name],
            message:
              'Vendor SDKs and framework code are not allowed in pure layers. Put vendor code in its own providers/<vendor> package behind an interface.',
          })),
        },
      ],
    },
  },
  {
    // Footgun rule (a hard-won lesson): a React hook placed after a conditional
    // early return silently blanks the whole screen AND still typechecks. Make
    // it a hard error wherever React components live. A canary test
    // (tooling/lint-canary.test.ts) proves this config actually catches the
    // exact shape.
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  }
);
