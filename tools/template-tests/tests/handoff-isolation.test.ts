import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { composeRepository } from '../src/assembly.ts';
import { readFiles, rootExcluded } from '../src/files.ts';
import type { PresetId } from '../src/registry.ts';
import { bunLockStub, npmLockStub } from './lock-stubs.ts';

const ids: PresetId[] = ['vanilla', 'react', 'vue'];

function put(root: string, path: string, value: string): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, value);
}

function json(root: string, path: string, value: unknown): void {
  put(root, path, JSON.stringify(value, null, 2) + '\n');
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'frontend-handoff-'));
  const manifest = {
    name: 'frontend-project',
    version: '0.1.0',
    private: true,
    license: 'MIT',
    scripts: { check: 'node --version' },
    engines: { node: '>=26.13.1 <27', npm: '>=12.2.2 <13' },
    dependencies: {},
    devDependencies: {
      typescript: '7.0.2',
      oxlint: '1.93.0',
      'oxlint-tsgolint': '7.0.2007',
    },
  };
  json(root, 'scaffold/common/package.json', manifest);
  json(root, 'scaffold/common/tsconfig.base.json', {
    compilerOptions: { target: 'ES2023', module: 'ESNext', moduleResolution: 'bundler' },
  });
  for (const id of ids) {
    json(root, `scaffold/presets/${id}/tsconfig.json`, { extends: './tsconfig.base.json' });
  }
  json(root, 'scaffold/presets.json', {
    rootPreset: 'vanilla',
    presets: ids.map((id) => ({ id, replaces: [] })),
    options: { packageManagers: ['npm', 'bun'], typescriptMajors: [7, 6], forbidden: [] },
  });
  for (const id of ids) {
    json(root, `scaffold/presets/${id}/package.json`, { dependencies: {} });
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
  return root;
}

void test('handoff stays on maintainer root only', async () => {
  const root = fixture();
  try {
    assert.equal(rootExcluded('.handoff'), true);
    assert.equal(rootExcluded('.handoff2'), false);
    assert.equal(rootExcluded('.handoff/extra.md'), true);
    const composition = await composeRepository(root);
    for (const template of composition.templates) {
      assert.equal(
        [...template.files.keys()].some((path) =>
          path.split('/').some((part) => part === '.handoff'),
        ),
        false,
      );
    }
    put(root, 'scaffold/common/.handoff/secret.md', 'no\n');
    await assert.rejects(composeRepository(root), /Unapproved generation input:.*\.handoff/u);
    rmSync(join(root, 'scaffold/common/.handoff'), { recursive: true, force: true });
    put(root, 'scaffold/common/.handoff2/allowed.md', 'yes\n');
    const withSimilar = await composeRepository(root);
    assert.ok(withSimilar.templates[0]?.files.has('.handoff2/allowed.md'));
    const maintainer = readFiles(root, rootExcluded);
    assert.equal(maintainer.has('.handoff'), false);
    put(root, '.handoff/readme.md', 'maintainer only\n');
    const afterHandoff = readFiles(root, rootExcluded);
    assert.equal(afterHandoff.has('.handoff/readme.md'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
