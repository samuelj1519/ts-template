import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { check } from 'prettier';
import {
  checkTemplates,
  composePackage,
  composeRepository,
  syncTemplates,
} from '../src/assembly.ts';
import { compareFiles, readFiles, rootExcluded } from '../src/files.ts';
import type { PresetId } from '../src/registry.ts';
import { bunLockStub, npmLockStub } from './lock-stubs.ts';

const ids: PresetId[] = ['vanilla', 'react', 'vue'];
const checks: Promise<void>[] = [];

function put(root: string, path: string, value: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), value);
}

function json(root: string, path: string, value: unknown): void {
  put(root, path, JSON.stringify(value, null, 2) + '\n');
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'frontend-assembly-'));
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
  json(root, 'scaffold/common/.prettierrc.json', { singleQuote: true, printWidth: 100 });
  json(root, 'scaffold/common/.oxlintrc.json', {
    plugins: ['typescript'],
    rules: { 'typescript/no-explicit-any': 'error' },
  });
  put(root, 'scaffold/common/README.md', 'Synthetic core\n');
  put(root, 'scaffold/common/.githooks/pre-commit', '#!/bin/sh\nexit 0\n');
  chmodSync(join(root, 'scaffold/common/.githooks/pre-commit'), 0o755);
  json(root, 'scaffold/presets.json', {
    rootPreset: 'vanilla',
    presets: ids.map((id) => ({ id, replaces: [] })),
    options: { packageManagers: ['npm', 'bun'], typescriptMajors: [7, 6], forbidden: [] },
  });
  for (const id of ids) {
    json(root, `scaffold/presets/${id}/package.json`, { dependencies: {} });
    json(root, `scaffold/presets/${id}/.oxlintrc.json`, { plugins: ['import'] });
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
  put(root, 'CONTRIBUTING.md', 'Synthetic maintainer guide\n');
  return root;
}

async function isolated(run: (root: string) => void | Promise<void>): Promise<void> {
  const root = fixture();
  try {
    await run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

checks.push(
  test('composition is deterministic and sync is idempotent across all twelve templates', async () => {
    await isolated(async (root) => {
      const first = await composeRepository(root);
      const second = await composeRepository(root);
      assert.equal(first.templates.length, 12);
      for (const template of first.templates) {
        const matching = second.templates.find((entry) => entry.id === template.id);
        assert.ok(matching);
        compareFiles(template.files, matching.files, template.id);
        for (const filename of ['package.json', '.oxlintrc.json']) {
          const output = template.files.get(filename);
          assert.ok(output);
          assert.equal(
            await check(output.content.toString('utf8'), {
              filepath: join(root, filename),
              singleQuote: true,
              printWidth: 100,
            }),
            true,
            `The actual ${filename} formatter must accept generated JSON.`,
          );
        }
      }
      await syncTemplates(root);
      await checkTemplates(root);
      const before = readFiles(root, rootExcluded);
      await syncTemplates(root);
      compareFiles(readFiles(root, rootExcluded), before, 'Repeated synchronization');
    });
  }),
);

checks.push(
  test('package composition is available before authoritative locks exist', async () => {
    await isolated(async (root) => {
      rmSync(join(root, 'scaffold/locks'), { recursive: true });
      const manifest = await composePackage(root, {
        preset: 'react',
        packageManager: 'npm',
        typescriptMajor: 7,
      });
      assert.equal(manifest['name'], 'frontend-project');
      await assert.rejects(composeRepository(root), /ENOENT/u);
    });
  }),
);

checks.push(
  test('registry rejects unknown fields, duplicate modes and escaping paths', async () => {
    await isolated(async (root) => {
      const preset = { id: 'vanilla', replaces: [] };
      json(root, 'scaffold/presets.json', {
        rootPreset: 'vanilla',
        presets: [preset, preset, preset],
        options: { packageManagers: ['npm', 'bun'], typescriptMajors: [7, 6], forbidden: [] },
      });
      await assert.rejects(composeRepository(root), /exactly once/u);
      json(root, 'scaffold/presets.json', {
        rootPreset: 'vanilla',
        presets: ids.map((id) => ({ id, replaces: ['../outside'] })),
        options: { packageManagers: ['npm', 'bun'], typescriptMajors: [7, 6], forbidden: [] },
      });
      await assert.rejects(composeRepository(root), /safe, canonical/u);
      json(root, 'scaffold/presets.json', {
        rootPreset: 'vanilla',
        presets: ids.map((id) => ({ id, replaces: [], unknown: true })),
        options: { packageManagers: ['npm', 'bun'], typescriptMajors: [7, 6], forbidden: [] },
      });
      await assert.rejects(composeRepository(root));
    });
  }),
);

checks.push(
  test('ordinary file collisions require an exact used replacement declaration', async () => {
    await isolated(async (root) => {
      put(root, 'scaffold/presets/react/README.md', 'React documentation\n');
      await assert.rejects(composeRepository(root), /Undeclared input collision/u);
      json(root, 'scaffold/presets.json', {
        rootPreset: 'vanilla',
        presets: ids.map((id) => ({ id, replaces: id === 'react' ? ['README.md'] : [] })),
        options: { packageManagers: ['npm', 'bun'], typescriptMajors: [7, 6], forbidden: [] },
      });
      const composed = await composeRepository(root);
      assert.equal(
        composed.templates
          .find((template) => template.id === 'react')
          ?.files.get('README.md')
          ?.content.toString(),
        'React documentation\n',
      );
      json(root, 'scaffold/presets.json', {
        rootPreset: 'vanilla',
        presets: ids.map((id) => ({ id, replaces: ['missing.txt'] })),
        options: { packageManagers: ['npm', 'bun'], typescriptMajors: [7, 6], forbidden: [] },
      });
      await assert.rejects(composeRepository(root), /Unused file replacement/u);
    });
  }),
);

checks.push(
  test('manifest dependency and script conflicts cannot silently replace shared policy', async () => {
    await isolated(async (root) => {
      json(root, 'scaffold/presets/react/package.json', { scripts: { check: 'exit 0' } });
      await assert.rejects(composeRepository(root), /package\.json\/scripts\/check/u);
      json(root, 'scaffold/common/package.json', {
        name: 'frontend-project',
        version: '0.1.0',
        private: true,
        license: 'MIT',
        scripts: {},
        dependencies: { example: '1.0.0' },
        devDependencies: {},
      });
      json(root, 'scaffold/presets/react/package.json', { dependencies: { example: '2.0.0' } });
      await assert.rejects(
        composePackage(root, { preset: 'react', packageManager: 'npm', typescriptMajor: 7 }),
        /dependencies\/example/u,
      );
    });
  }),
);

checks.push(
  test('input links, private files and mismatched locks fail before outputs are written', async () => {
    await isolated(async (root) => {
      put(root, 'scaffold/common/.env.local', 'SYNTHETIC_ONLY=fixture\n');
      await assert.rejects(composeRepository(root), /Unapproved generation input/u);
      rmSync(join(root, 'scaffold/common/.env.local'));
      mkdirSync(join(root, 'source-target'));
      symlinkSync(
        join(root, 'source-target'),
        join(root, 'scaffold/common/linked'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      await assert.rejects(composeRepository(root), /Unsafe template entry/u);
      rmSync(join(root, 'scaffold/common/linked'), { recursive: true });
      json(root, 'scaffold/locks/vue/npm-ts7.json', {
        name: 'wrong',
        version: '0.1.0',
        lockfileVersion: 3,
        packages: {},
      });
      await assert.rejects(composeRepository(root), /Lock identity/u);
    });
  }),
);

checks.push(
  test('complete checking catches nested output-name drift and preserves unrelated root files', async () => {
    await isolated(async (root) => {
      await syncTemplates(root);
      put(root, 'reports/runtime.log', 'Synthetic output\n');
      await checkTemplates(root);
      put(root, 'src/features/reports/model.ts', 'export const value = 1;\n');
      await assert.rejects(checkTemplates(root), /complete file sets differ/u);
      await syncTemplates(root);
      assert.equal(
        readFileSync(join(root, 'src/features/reports/model.ts'), 'utf8'),
        'export const value = 1;\n',
      );
    });
  }),
);

checks.push(
  test('complete checking ignores install residuals but rejects extra payload files', async () => {
    await isolated(async (root) => {
      await syncTemplates(root);
      put(root, 'templates/vanilla/node_modules/leftover/package.json', '{}\n');
      put(root, 'templates/vanilla/.npm/_cacache/index', 'cache\n');
      await checkTemplates(root);
      put(root, 'templates/vanilla/untracked-edit.txt', 'drift\n');
      await assert.rejects(checkTemplates(root), /complete file sets differ/u);
    });
  }),
);

checks.push(
  test('sync removes only unchanged previously owned stale files', async () => {
    await isolated(async (root) => {
      put(root, 'scaffold/common/retired.ts', 'export const old = 1;\n');
      await syncTemplates(root);
      rmSync(join(root, 'scaffold/common/retired.ts'));
      put(root, 'retired.ts', 'User change\n');
      const before = readFiles(root, rootExcluded);
      await assert.rejects(syncTemplates(root), /Refusing to remove a changed root file/u);
      compareFiles(readFiles(root, rootExcluded), before, 'Rejected synchronization');
      put(root, 'retired.ts', 'export const old = 1;\n');
      await syncTemplates(root);
      await checkTemplates(root);
    });
  }),
);

checks.push(
  test('sync refuses output links before changing root or another preset', async () => {
    await isolated(async (root) => {
      await syncTemplates(root);
      const before = readFiles(root, rootExcluded);
      const outside = mkdtempSync(join(tmpdir(), 'frontend-output-target-'));
      try {
        put(outside, 'sentinel.txt', 'Preserve linked data\n');
        rmSync(join(root, 'templates/vue'), { recursive: true });
        symlinkSync(
          outside,
          join(root, 'templates/vue'),
          process.platform === 'win32' ? 'junction' : 'dir',
        );
        await assert.rejects(syncTemplates(root), /real directory/u);
        assert.equal(readFileSync(join(outside, 'sentinel.txt'), 'utf8'), 'Preserve linked data\n');
        compareFiles(readFiles(root, rootExcluded), before, 'Rejected linked output');
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });
  }),
);

checks.push(
  test('authoring inputs cannot overwrite maintainer or runtime paths', async () => {
    await isolated(async (root) => {
      const original = readFileSync(join(root, 'CONTRIBUTING.md'), 'utf8');
      put(root, 'scaffold/common/CONTRIBUTING.md', 'Unapproved replacement\n');
      await assert.rejects(syncTemplates(root), /Unapproved generation input/u);
      assert.equal(readFileSync(join(root, 'CONTRIBUTING.md'), 'utf8'), original);
    });
  }),
);

checks.push(
  test('sync preserves an edited root file when its input changes', async () => {
    await isolated(async (root) => {
      await syncTemplates(root);
      put(root, 'README.md', 'Other writer change\n');
      put(root, 'scaffold/common/README.md', 'New approved input\n');
      const before = readFiles(root, rootExcluded);
      await assert.rejects(syncTemplates(root), /Refusing to overwrite/u);
      compareFiles(readFiles(root, rootExcluded), before, 'Rejected root overwrite');
      assert.equal(
        readFileSync(join(root, 'templates/vanilla/README.md'), 'utf8'),
        'Synthetic core\n',
      );
    });
  }),
);

checks.push(
  test('sync cannot claim a new root path that already contains unowned work', async () => {
    await isolated(async (root) => {
      await syncTemplates(root);
      put(root, 'new-file.txt', 'Existing unowned content\n');
      put(root, 'scaffold/common/new-file.txt', 'New template content\n');
      const before = readFiles(root, rootExcluded);
      await assert.rejects(syncTemplates(root), /Refusing to overwrite/u);
      compareFiles(readFiles(root, rootExcluded), before, 'Rejected new-path collision');
    });
  }),
);

await Promise.all(checks);
