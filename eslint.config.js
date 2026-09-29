import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist',
      '**/dev-dist',
      '**/coverage',
      '**/playwright-report',
      '**/test-results',
      '**/.lighthouseci',
    ],
  },

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,

  // --- Type-aware linting for everything TypeScript, repo-wide. -------------
  {
    files: ['**/*.{ts,tsx,mts}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      // The domain model is written with `type` aliases throughout.
      '@typescript-eslint/consistent-type-definitions': 'off',
      // Bracket access is deliberate on index signatures (process.env,
      // Firestore's DocumentData).
      '@typescript-eslint/dot-notation': ['error', { allowIndexSignaturePropertyAccess: true }],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: false },
      ],
    },
  },

  // --- Plain-JS config files: no type information exists for them. ----------
  {
    files: ['**/*.{js,cjs,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node, sourceType: 'commonjs' },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { sourceType: 'module' },
  },

  // --- Browser code, and the React hooks shared with mobile. --------------
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'packages/data/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // Pure packages, shared by web and mobile: no UI framework, no Firebase.
    files: ['packages/{domain,catalog,ui-tokens}/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react-dom',
                'react-native',
                'firebase',
                'firebase/*',
                '@firebase/*',
                '@react-native-firebase/*',
                '@mantine/*',
              ],
              message:
                'domain, catalog and ui-tokens must stay pure — no React, Firebase or Mantine imports.',
            },
          ],
        },
      ],
    },
  },
  {
    // The data layer is shared with mobile, so no web UI kit in it.
    files: ['packages/data/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@mantine/*', 'react-dom', 'react-dom/*', 'react-router', '@dnd-kit/*'],
              message: '@lift/data is shared with mobile — keep web UI libraries in apps/web.',
            },
          ],
        },
      ],
    },
  },
  {
    // Only @lift/data may talk to Firestore directly.
    files: ['apps/web/src/{app,features,components}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['firebase/firestore', 'firebase/firestore/*'],
              message:
                'Firestore access is confined to @lift/data — consume a hook from @lift/data/hooks instead.',
            },
          ],
        },
      ],
    },
  },
  {
    // @lift/data holds providers and hooks, not fast-refreshable screens.
    files: ['packages/data/**/*.{ts,tsx}'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['apps/web/src/sw.ts'],
    languageOptions: { globals: globals.serviceworker },
  },

  // --- Tests and tooling. --------------------------------------------------
  {
    files: ['**/*.test.{ts,tsx}', 'apps/web/src/test/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    files: [
      '*.config.ts',
      'scripts/**/*.ts',
      'rules/**/*.ts',
      'apps/web/*.config.ts',
      'apps/web/scripts/**/*.ts',
      'apps/web/e2e/**/*.ts',
      'packages/catalog/scripts/**/*.ts',
    ],
    languageOptions: { globals: globals.node },
  },
);
