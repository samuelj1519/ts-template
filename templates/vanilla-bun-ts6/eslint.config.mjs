import tseslint from 'typescript-eslint';

const typeAwareFiles = [
  'src/**/*.ts',
  'src/**/*.tsx',
  'e2e/**/*.ts',
  'tools/checks/**/*.ts',
  'vite.config.ts',
  'playwright.config.ts',
  'quality.config.ts',
  '.dependency-cruiser.cjs',
  'framework.config.ts',
  'vite.plugins.ts',
];

const typeAwareRules = {
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/no-unsafe-assignment': 'error',
  '@typescript-eslint/no-unsafe-argument': 'error',
  '@typescript-eslint/no-unsafe-call': 'error',
  '@typescript-eslint/no-unsafe-member-access': 'error',
  '@typescript-eslint/no-unsafe-return': 'error',
  '@typescript-eslint/switch-exhaustiveness-check': 'error',
  '@typescript-eslint/await-thenable': 'error',
  '@typescript-eslint/no-array-delete': 'error',
  '@typescript-eslint/no-base-to-string': 'error',
  '@typescript-eslint/no-duplicate-type-constituents': 'error',
  '@typescript-eslint/no-for-in-array': 'error',
  '@typescript-eslint/no-implied-eval': 'error',
  '@typescript-eslint/no-meaningless-void-operator': 'error',
  '@typescript-eslint/no-misused-spread': 'error',
  '@typescript-eslint/no-redundant-type-constituents': 'error',
  '@typescript-eslint/no-unsafe-unary-minus': 'error',
  '@typescript-eslint/no-useless-default-assignment': 'error',
  '@typescript-eslint/require-array-sort-compare': 'error',
  '@typescript-eslint/restrict-template-expressions': 'error',
  '@typescript-eslint/unbound-method': 'error',
};

export default [
  {
    files: typeAwareFiles,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: typeAwareRules,
  },
];