import tseslint from 'typescript-eslint';

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
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.js', '!eslint.config.js'],
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
  }
);
