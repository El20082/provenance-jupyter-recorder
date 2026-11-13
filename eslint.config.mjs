import tseslint from 'typescript-eslint';

// Mirrors the monorepo's eslint.config.mjs.
export default tseslint.config(
  {
    ignores: ['lib/**', 'vendor/**', 'node_modules/**', 'provjup/labextension/**'],
  },
  {
    files: ['**/*.ts'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
