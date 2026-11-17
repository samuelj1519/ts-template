export const sourceExtensions = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'];
const extensions = `{${sourceExtensions.join(',')}}`;
export const unitTestSources = [`src/**/*.{test,spec}.${extensions}`];
export const coverageSources = [`src/**/*.${extensions}`];
export const coverageExclusions = [
  ...unitTestSources,
  'src/**/index.ts',
  'src/**/*.d.ts',
  'src/test/**',
  'src/app/main.ts',
];
export const coverageThresholds = { lines: 100, functions: 100, statements: 100, branches: 100 };
