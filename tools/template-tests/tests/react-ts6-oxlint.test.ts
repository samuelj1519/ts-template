import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readRegistry } from '../src/registry.ts';

const repository = fileURLToPath(new URL('../../..', import.meta.url));

void test('React TS6 keeps react-hooks rules in merged oxlint config', async () => {
  const registry = readRegistry(repository);
  const combination = registry.combinations.find(
    (entry) =>
      entry.preset === 'react' && entry.packageManager === 'npm' && entry.typescriptMajor === 6,
  );
  assert.ok(combination);
  const { composeRepository } = await import('../src/assembly.ts');
  const composition = await composeRepository(repository);
  const reactTs6 = composition.templates.find((entry) => entry.id === 'react-npm-ts6');
  assert.ok(reactTs6);
  const oxlintFile = reactTs6.files.get('.oxlintrc.json');
  assert.ok(oxlintFile);
  const oxlint = JSON.parse(oxlintFile.content.toString('utf8')) as {
    plugins?: string[];
    rules?: Record<string, string>;
  };
  assert.ok(oxlint.plugins?.includes('react'));
  assert.equal(oxlint.rules?.['react/rules-of-hooks'], 'error');
  assert.equal(oxlint.rules?.['typescript/no-floating-promises'], 'off');
});

void test('React TS6 oxlint reports conditional hooks violations', async () => {
  const registry = readRegistry(repository);
  const combination = registry.combinations.find(
    (entry) =>
      entry.preset === 'react' && entry.packageManager === 'npm' && entry.typescriptMajor === 6,
  );
  assert.ok(combination);
  const stage = mkdtempSync(join(tmpdir(), 'react-hooks-ts6-'));
  const sample = join(stage, 'InvalidHooks.tsx');
  writeFileSync(
    sample,
    `import { useState } from 'react';
export function InvalidHooks({ enabled }: { enabled: boolean }) {
  if (enabled) {
    const [value] = useState(0);
    return <span>{value}</span>;
  }
  return null;
}
`,
  );
  const oxlint = join(repository, 'tools/template-tests/node_modules/oxlint/bin/oxlint');
  const result = spawnSync(
    process.execPath,
    [oxlint, '--config', join(repository, 'templates/react-npm-ts6/.oxlintrc.json'), sample],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout + result.stderr, /rules-of-hooks/u);
  rmSync(stage, { recursive: true, force: true });
  void combination;
});
