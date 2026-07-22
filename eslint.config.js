import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      // Legacy content script ported verbatim in Phase 2 Step 1; typed and
      // linted in Step 2. Excluded until then to keep the toolchain green.
      'src/content/cssviewer.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        chrome: 'readonly',
      },
    },
  },
);
