import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { frameworkPlugins } from './vite.plugins.ts';
import { framework } from './framework.config.ts';
import {
  coverageSources,
  coverageExclusions,
  coverageThresholds,
  unitTestSources,
} from './quality.config.ts';

export default defineConfig({
  plugins: frameworkPlugins,
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { sourcemap: true },
  test: {
    name: framework,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: unitTestSources,
    coverage: {
      provider: 'v8',
      include: coverageSources,
      exclude: coverageExclusions,
      reporter: ['text', 'json-summary', 'html'],
      thresholds: { ...coverageThresholds, perFile: true },
    },
  },
});
