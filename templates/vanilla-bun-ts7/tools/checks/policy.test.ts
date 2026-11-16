import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { validateGraph } from './architecture.ts';
import { validateCoverage } from './coverage.ts';
import { validateSource } from './source-policy.ts';
import { validateMutations } from './mutation.ts';

void test('source policy parses TSX and literal imports but rejects computed imports', () => {
  validateSource(
    "export const view = <main>Preview</main>; void import('./example.ts');",
    'example.tsx',
  );
  assert.throws(
    () => validateSource('const path = "./example.ts"; void import(path);', 'example.ts'),
    /literal module path/u,
  );
  assert.throws(
    () =>
      validateSource("export type Item = { nested: import('./private.ts').Item };", 'example.ts'),
    /import type declarations/u,
  );
  assert.throws(() => validateSource('export const value = 1;', 'index.ts'), /re-export-only/u);
  assert.throws(
    () => validateSource('export async function load(path) { await import(path); }', 'example.js'),
    /literal module path/u,
  );
});

void test('mutation reports require actual wrong implementations', () => {
  assert.throws(() => validateMutations({ files: {} }, process.cwd()), /measured source/u);
});

void test('architecture reports cannot pass with an empty or unrelated graph', () => {
  assert.throws(() => validateGraph({ modules: [], summary: { error: 0 } }));
  assert.throws(() =>
    validateGraph({
      modules: [{ source: 'node_modules/example.js', dependencies: [] }],
      summary: { error: 0 },
    }),
  );
  validateGraph({
    modules: [{ source: 'src/app/main.tsx', dependencies: [] }],
    summary: { error: 0 },
  });
});

void test('coverage rejects absent, contaminated, empty and decreased measurements', () => {
  const directory = mkdtempSync(join(tmpdir(), 'frontend-coverage-'));
  const file = join(directory, 'app.ts');
  const unrelated = join(directory, 'dependency.ts');
  writeFileSync(file, 'export const value = 1;');
  writeFileSync(unrelated, 'export const other = 2;');
  const counter = { total: 1, covered: 1, skipped: 0, pct: 100 };
  const summary = { lines: counter, functions: counter, statements: counter, branches: counter };
  try {
    validateCoverage({ total: summary, [file]: summary }, [file]);
    assert.throws(() => validateCoverage({}, [file]));
    assert.throws(() => validateCoverage({ total: summary, [unrelated]: summary }, [file]));
    assert.throws(() => validateCoverage({ total: summary, [file]: summary }, []));
    const decreased = { ...summary, lines: { ...counter, covered: 0, pct: 0 } };
    assert.throws(() => validateCoverage({ total: decreased, [file]: decreased }, [file]));
    const inflated = { ...summary, lines: { ...counter, covered: 2 } };
    assert.throws(() => validateCoverage({ total: inflated, [file]: inflated }, [file]));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

void test('coverage matches native canonical file identities', () => {
  const directory = mkdtempSync(join(tmpdir(), 'frontend-native-coverage-'));
  const file = join(directory, 'app.ts');
  writeFileSync(file, 'export const value = 1;');
  const counter = { total: 1, covered: 1, skipped: 0, pct: 100 };
  const summary = { lines: counter, functions: counter, statements: counter, branches: counter };
  try {
    validateCoverage({ total: summary, [realpathSync.native(file)]: summary }, [file]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
