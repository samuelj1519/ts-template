import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { validateLockUniqueness } from './lock-policy.ts';

function manifest(root: string, packageManager: string): void {
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'fixture', packageManager }, null, 2) + '\n',
  );
}

void test('lock policy enforces one allowed lock per manager', () => {
  const root = mkdtempSync(join(tmpdir(), 'lock-policy-'));
  try {
    manifest(root, 'npm@12.2.2');
    assert.throws(() => validateLockUniqueness(root), /requires exactly one lock/u);
    writeFileSync(join(root, 'package-lock.json'), '{}\n');
    validateLockUniqueness(root);
    writeFileSync(join(root, 'bun.lock'), '"lock"\n');
    assert.throws(() => validateLockUniqueness(root), /allows only package-lock.json/u);
    rmSync(join(root, 'bun.lock'));
    writeFileSync(join(root, 'bun.lockb'), 'b');
    assert.throws(() => validateLockUniqueness(root), /bun.lockb/u);
    rmSync(join(root, 'package-lock.json'));
    rmSync(join(root, 'bun.lockb'));
    manifest(root, 'bun@1.3.11');
    writeFileSync(join(root, 'bun.lock'), '"lock"\n');
    validateLockUniqueness(root);
    writeFileSync(join(root, 'package-lock.json'), '{}\n');
    assert.throws(() => validateLockUniqueness(root), /allows only bun.lock/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
