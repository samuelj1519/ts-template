import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { validateTsConfigPolicy } from './tsconfig-policy.ts';

function write(root: string, name: string, content: string): void {
  writeFileSync(join(root, name), content);
}

void test('tsconfig policy rejects inherited and direct violations', () => {
  const root = mkdtempSync(join(tmpdir(), 'tsconfig-policy-'));
  try {
    write(
      root,
      'tsconfig.base.json',
      JSON.stringify({
        compilerOptions: { target: 'ES2023', module: 'ESNext', moduleResolution: 'bundler' },
      }) + '\n',
    );
    write(root, 'tsconfig.json', '{"extends":"./tsconfig.base.json"}\n');
    validateTsConfigPolicy(root);
    write(
      root,
      'tsconfig.base.json',
      JSON.stringify({
        compilerOptions: {
          target: 'ES2023',
          module: 'ESNext',
          moduleResolution: 'bundler',
          stableTypeOrdering: false,
        },
      }) + '\n',
    );
    assert.throws(() => validateTsConfigPolicy(root), /stableTypeOrdering must not be false/u);
    write(
      root,
      'tsconfig.base.json',
      JSON.stringify({
        compilerOptions: { target: 'ES2023', module: 'ESNext', moduleResolution: 'node' },
      }) + '\n',
    );
    assert.throws(() => validateTsConfigPolicy(root), /moduleResolution must not be/u);
    write(
      root,
      'tsconfig.base.json',
      JSON.stringify({
        compilerOptions: { target: 'ES2023', module: 'ESNext', moduleResolution: 'bundler' },
      }) + '\n',
    );
    write(root, 'legacy.json', '{"compilerOptions":{"downlevelIteration":false}}\n');
    write(
      root,
      'tsconfig.json',
      '{"extends":"./tsconfig.base.json","references":[{"path":"./legacy.json"}]}\n',
    );
    assert.throws(() => validateTsConfigPolicy(root), /downlevelIteration|not allowed/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('tsconfig policy validates every array extends entry', () => {
  const root = mkdtempSync(join(tmpdir(), 'tsconfig-extends-array-'));
  try {
    write(root, 'tsconfig.base.json', '{"compilerOptions":{"strict":true}}\n');
    write(root, 'legacy.json', '{"compilerOptions":{"moduleResolution":"node"}}\n');
    write(root, 'tsconfig.json', '{"extends":["./tsconfig.base.json","./legacy.json"]}\n');
    assert.throws(() => validateTsConfigPolicy(root), /moduleResolution must not be/u);
    write(root, 'tsconfig.json', '{"extends":["./tsconfig.base.json",42]}\n');
    assert.throws(() => validateTsConfigPolicy(root), /extends.*string/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('tsconfig policy allows diamond inheritance but rejects real cycles', () => {
  const root = mkdtempSync(join(tmpdir(), 'tsconfig-diamond-'));
  try {
    write(root, 'tsconfig.base.json', '{"compilerOptions":{"strict":true}}\n');
    write(root, 'a.json', '{"extends":"./tsconfig.base.json"}\n');
    write(root, 'b.json', '{"extends":"./tsconfig.base.json"}\n');
    write(root, 'tsconfig.json', '{"references":[{"path":"./a.json"},{"path":"./b.json"}]}\n');
    assert.doesNotThrow(() => validateTsConfigPolicy(root));
    write(root, 'a.json', '{"extends":"./b.json"}\n');
    write(root, 'b.json', '{"extends":"./a.json"}\n');
    assert.throws(() => validateTsConfigPolicy(root), /Circular tsconfig chain/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
