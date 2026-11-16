import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { TS6_TYPE_AWARE_RULE_NAMES, validateTs6TypeAwareRules } from './ts6-type-aware-rules.ts';

const ruleLines = TS6_TYPE_AWARE_RULE_NAMES.map((name) => `  '${name}': 'error',`).join('\n');

function writeEslintConfig(root: string, body: string): void {
  writeFileSync(
    join(root, 'eslint.config.mjs'),
    `const typeAwareRules = {\n${body}\n};\nexport default [{ rules: typeAwareRules }];\n`,
  );
}

void test('ts6 type-aware rules: manifest count and mismatch detection', async () => {
  assert.equal(TS6_TYPE_AWARE_RULE_NAMES.length, 22);
  const root = mkdtempSync(join(tmpdir(), 'ts6-rules-'));
  try {
    writeEslintConfig(root, ruleLines);
    await validateTs6TypeAwareRules(root);
    const badRoot = mkdtempSync(join(tmpdir(), 'ts6-rules-bad-'));
    try {
      writeEslintConfig(
        badRoot,
        ruleLines.replace(`  '${TS6_TYPE_AWARE_RULE_NAMES[0]}': 'error',`, ''),
      );
      await assert.rejects(() => validateTs6TypeAwareRules(badRoot), /exactly 22/u);
    } finally {
      rmSync(badRoot, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
