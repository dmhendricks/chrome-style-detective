import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import unicorn from 'eslint-plugin-unicorn';

/**
 * Light unicorn allowlist — modern APIs / deprecated-pattern nits only.
 * Do not enable flat/recommended (kitchen-sink); see backlog P1e.
 */
const unicornModernApis = {
  'unicorn/prefer-string-slice': 'error',
  'unicorn/prefer-string-trim-start-end': 'error',
  'unicorn/prefer-string-starts-ends-with': 'error',
  'unicorn/prefer-string-replace-all': 'error',
  'unicorn/prefer-includes': 'error',
  'unicorn/prefer-array-flat': 'error',
  'unicorn/prefer-array-flat-map': 'error',
  'unicorn/prefer-array-find': 'error',
  'unicorn/prefer-array-some': 'error',
  'unicorn/prefer-date-now': 'error',
  'unicorn/prefer-number-properties': 'error',
  'unicorn/prefer-modern-math-apis': 'error',
  'unicorn/prefer-modern-dom-apis': 'error',
  'unicorn/prefer-dom-node-append': 'error',
  'unicorn/prefer-dom-node-remove': 'error',
  'unicorn/prefer-dom-node-text-content': 'error',
  'unicorn/prefer-keyboard-event-key': 'error',
  'unicorn/prefer-optional-catch-binding': 'error',
  'unicorn/prefer-regexp-test': 'error',
  'unicorn/prefer-node-protocol': 'error',
  'unicorn/no-instanceof-array': 'error',
  'unicorn/no-new-buffer': 'error',
};

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      unicorn,
    },
    rules: unicornModernApis,
  },
  {
    // Content overlay, options page, and shared prefs run in a browser document.
    files: ['src/content/**/*.{ts,js}', 'src/options/**/*.{ts,js}', 'src/shared/**/*.{ts,js}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        chrome: 'readonly',
      },
    },
  },
  {
    // MV3 service worker (background).
    files: ['src/background.ts'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        chrome: 'readonly',
      },
    },
  },
  {
    files: ['vite.config.ts', 'vitest.config.ts', 'eslint.config.js', 'audits/**/*.{ts,js}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
);
