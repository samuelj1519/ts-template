import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  checkTemplates,
  composePackage,
  composeRepository,
  syncTemplates,
} from '../src/assembly.ts';
import { compareFiles, readFiles, rootExcluded } from '../src/files.ts';
import { templateDirectoryId } from '../src/options.ts';
import { parseCombinationInput, readRegistry } from '../src/registry.ts';
import { bunLockStub, npmLockStub } from './lock-stubs.ts';

const repository = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const EXPECTED_IDS = [
  'vanilla',
  'vanilla-npm-ts6',
  'vanilla-bun-ts7',
  'vanilla-bun-ts6',
  'react',
  'react-npm-ts6',
  'react-bun-ts7',
  'react-bun-ts6',
  'vue',
  'vue-npm-ts6',
  'vue-bun-ts7',
  'vue-bun-ts6',
];

function put(root: string, path: string, value: string): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, value);
}

function json(root: string, path: string, value: unknown): void {
  put(root, path, JSON.stringify(value, null, 2) + '\n');
}

function minimalFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'frontend-options-'));
  const manifest = {
    name: 'frontend-project',
    version: '0.1.0',
    private: true,
    license: 'MIT',
    packageManager: 'npm@12.2.2',
    scripts: { check: 'npm run lint', lint: 'node --version' },
    engines: { node: '>=26.13.1 <27', npm: '>=12.2.2 <13' },
    dependencies: {},
    devDependencies: { typescript: '7.0.2', oxlint: '1.93.0', 'oxlint-tsgolint': '7.0.2007' },
  };
  json(root, 'scaffold/common/package.json', manifest);
  json(root, 'scaffold/common/tsconfig.base.json', { compilerOptions: { strict: true } });
  json(root, 'scaffold/common/.oxlintrc.json', {
    plugins: ['typescript'],
    rules: { 'typescript/no-explicit-any': 'error' },
  });
  json(root, 'scaffold/common/.oxlintrc.typed.json', {
    extends: ['.oxlintrc.json'],
    rules: { 'typescript/no-floating-promises': 'error' },
  });
  json(root, 'scaffold/presets/react/.oxlintrc.json', {
    plugins: ['react'],
    rules: { 'react/rules-of-hooks': 'error' },
  });
  json(root, 'scaffold/presets.json', {
    rootPreset: 'vanilla',
    presets: ['vanilla', 'react', 'vue'].map((id) => ({ id, replaces: [], ruleOverrides: [] })),
    options: { packageManagers: ['npm', 'bun'], typescriptMajors: [7, 6], forbidden: [] },
  });
  for (const id of ['vanilla', 'react', 'vue'] as const) {
    mkdirSync(join(root, `scaffold/presets/${id}`), { recursive: true });
    put(root, `scaffold/presets/${id}/README.md`, `${id}\n`);
    mkdirSync(join(root, `scaffold/locks/${id}`), { recursive: true });
    for (const pm of ['npm', 'bun'] as const) {
      for (const major of [7, 6] as const) {
        const file = `${pm}-ts${major}.${pm === 'npm' ? 'json' : 'lock'}`;
        if (pm === 'npm')
          json(root, `scaffold/locks/${id}/${file}`, npmLockStub(manifest, id, pm, major));
        else put(root, `scaffold/locks/${id}/${file}`, bunLockStub(manifest, id, pm, major));
      }
    }
  }
  put(root, 'scaffold/options/ts6/eslint.config.mjs', 'export default [];\n');
  put(
    root,
    'scaffold/options/ts6/.oxlintrc.json',
    JSON.stringify({ rules: { 'typescript/no-explicit-any': 'error' } }, null, 2) + '\n',
  );
  put(root, 'scaffold/options/bun/.githooks/pre-commit', '#!/bin/sh\nexit 0\n');
  const initialized = spawnSync('git', ['init', '--quiet', root], { encoding: 'utf8' });
  if (initialized.status !== 0) throw new Error(initialized.stderr);
  return root;
}

void test('registry exposes twelve template ids in stable order', () => {
  const registry = readRegistry(join(dirname(fileURLToPath(import.meta.url)), '../../..'));
  assert.deepEqual([...registry.templateIds].sort(), [...EXPECTED_IDS].sort());
  assert.equal(registry.combinations.length, 12);
});

void test('full checks include dependency security for every combination', async () => {
  for (const combination of readRegistry(repository).combinations) {
    const manifest = await composePackage(repository, combination);
    const scripts = manifest['scripts'];
    assert.ok(scripts && typeof scripts === 'object' && !Array.isArray(scripts));
    const full = scripts['check:full'];
    assert.ok(typeof full === 'string');
    assert.ok(
      full.split(' && ').includes(`${combination.packageManager} run check:security`),
      `${templateDirectoryId(combination)} must run dependency security in check:full`,
    );
  }
});

void test('unknown combination triples are rejected', () => {
  const root = minimalFixture();
  try {
    const registry = readRegistry(root);
    try {
      parseCombinationInput(registry, {
        preset: 'vue',
        packageManager: 'npm',
        typescriptMajor: 99,
      });
      assert.fail('Expected invalid typescriptMajor to throw.');
    } catch (error) {
      assert.match(String(error), /Invalid input|unknown combination|Forbidden/i);
    }
    json(root, 'scaffold/presets.json', {
      rootPreset: 'vanilla',
      presets: ['vanilla', 'react', 'vue'].map((id) => ({ id, replaces: [], ruleOverrides: [] })),
      options: {
        packageManagers: ['npm', 'bun'],
        typescriptMajors: [7, 6],
        forbidden: [{ preset: 'vue', packageManager: 'npm', typescriptMajor: 7 }],
      },
    });
    assert.throws(() => readRegistry(root), /Expected exactly 12/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('sync is byte-identical on a second pass for all twelve directories', async () => {
  const root = minimalFixture();
  try {
    await syncTemplates(root);
    const composed = await composeRepository(root);
    for (const template of composed.templates) {
      compareFiles(readFiles(join(root, 'templates', template.id)), template.files, template.id);
    }
    const before = readFiles(root, rootExcluded);
    await syncTemplates(root);
    compareFiles(readFiles(root, rootExcluded), before, 'Second synchronization');
    await checkTemplates(root);
    for (const combination of readRegistry(root).combinations) {
      const directory = join(root, 'templates', templateDirectoryId(combination));
      assert.equal(
        [...readFiles(directory).keys()].some((path) => path.includes('.handoff')),
        false,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
