import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { validateLockUniqueness } from './lock-policy.ts';

function manifest(root: string, packageManager: string, extra: Record<string, unknown> = {}): void {
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify(
      {
        name: 'frontend-project',
        version: '0.1.0',
        packageManager,
        license: 'MIT',
        dependencies: {},
        devDependencies: { typescript: '7.0.2' },
        engines: { node: '>=26.13.1 <27' },
        ...extra,
      },
      null,
      2,
    ) + '\n',
  );
}

function npmLock(root: string): void {
  writeFileSync(
    join(root, 'package-lock.json'),
    JSON.stringify(
      {
        name: 'frontend-project',
        version: '0.1.0',
        lockfileVersion: 3,
        packages: {
          '': {
            name: 'frontend-project',
            version: '0.1.0',
            devDependencies: { typescript: '7.0.2' },
            license: 'MIT',
            engines: { node: '>=26.13.1 <27' },
          },
        },
      },
      null,
      2,
    ) + '\n',
  );
}

void test('lock policy enforces one allowed lock per manager', () => {
  const root = mkdtempSync(join(tmpdir(), 'lock-policy-'));
  try {
    manifest(root, 'npm@12.2.2');
    assert.throws(() => validateLockUniqueness(root), /requires exactly one lock/u);
    npmLock(root);
    validateLockUniqueness(root);
    writeFileSync(join(root, 'bun.lock'), '"lock"\n');
    assert.throws(() => validateLockUniqueness(root), /allows only package-lock.json/u);
    rmSync(join(root, 'bun.lock'));
    writeFileSync(join(root, 'bun.lockb'), 'b');
    assert.throws(() => validateLockUniqueness(root), /bun.lockb/u);
    writeFileSync(join(root, 'yarn.lock'), 'lock\n');
    assert.throws(() => validateLockUniqueness(root), /Forbidden lock file yarn.lock/u);
    rmSync(join(root, 'package-lock.json'));
    rmSync(join(root, 'bun.lockb'));
    rmSync(join(root, 'yarn.lock'));
    manifest(root, 'bun@1.3.11');
    writeFileSync(join(root, 'bun.lock'), '{"workspaces":{"":{"name":"frontend-project"}}}\n');
    assert.throws(() => validateLockUniqueness(root), /Bun lock root does not match manifest/u);
    writeFileSync(
      join(root, 'bun.lock'),
      JSON.stringify({
        workspaces: {
          '': {
            name: 'frontend-project',
            devDependencies: { typescript: '7.0.2' },
          },
        },
      }) + '\n',
    );
    validateLockUniqueness(root);
    writeFileSync(join(root, 'package-lock.json'), '{}\n');
    assert.throws(() => validateLockUniqueness(root), /allows only bun.lock/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('lock policy rejects wrong packageManager version', () => {
  const root = mkdtempSync(join(tmpdir(), 'lock-manager-'));
  try {
    manifest(root, 'npm@9.9.9');
    npmLock(root);
    assert.throws(() => validateLockUniqueness(root), /exactly npm@12.2.2/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('lock policy rejects lock root drift from manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'lock-drift-'));
  try {
    manifest(root, 'npm@12.2.2');
    npmLock(root);
    const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')) as {
      packages: Record<string, Record<string, unknown>>;
    };
    const rootPackage = lock.packages[''];
    assert.ok(rootPackage);
    rootPackage['devDependencies'] = { typescript: '0.0.0' };
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n');
    assert.throws(
      () => validateLockUniqueness(root),
      /Lock root does not match manifest: devDependencies/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
