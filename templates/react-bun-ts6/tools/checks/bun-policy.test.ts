import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateSource } from './source-policy.ts';

void test('bun runtime patterns fail and clean sources pass', () => {
  const violations = [
    "Bun.serve({ fetch() { return new Response('ok'); } });",
    "void import('bun');",
    "import type X from 'bun';",
    'const runtime = "serve"; Bun[runtime]();',
    "import foo from 'bun:ffi';",
  ];
  for (const source of violations) {
    assert.throws(() => validateSource(source, 'src/app/example.ts'), /Bun runtime/u);
  }
  validateSource("export const message = 'ok';\n", 'src/app/example.ts');
});
