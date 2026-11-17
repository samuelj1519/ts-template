import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { STRYKER_TSCONFIG_FAILURE, validateStrykerTsconfigField } from './stryker-policy.ts';

void test('stryker tsconfigFile accepts only an owned empty string', () => {
  const badValues: readonly { readonly label: string; readonly json: string }[] = [
    { label: 'missing file', json: '' },
    { label: 'missing field', json: '{}' },
    { label: 'null', json: '{"tsconfigFile":null}' },
    { label: 'false', json: '{"tsconfigFile":false}' },
    { label: 'whitespace', json: '{"tsconfigFile":" "}' },
    { label: 'path', json: '{"tsconfigFile":"tsconfig.json"}' },
    { label: 'invalid json', json: '{' },
  ];
  for (const fixture of badValues) {
    if (fixture.label === 'missing file') {
      assert.throws(
        () => validateStrykerTsconfigField('/does-not-exist/stryker.config.json'),
        (error) => {
          assert.match(String(error), new RegExp(STRYKER_TSCONFIG_FAILURE, 'u'));
          return true;
        },
      );
      continue;
    }
    const path = mkdtempSync(join(tmpdir(), 'stryker-policy-'));
    const config = join(path, 'stryker.config.json');
    try {
      writeFileSync(config, fixture.json);
      assert.throws(
        () => validateStrykerTsconfigField(config),
        (error) => {
          assert.match(String(error), new RegExp(STRYKER_TSCONFIG_FAILURE, 'u'));
          return true;
        },
        fixture.label,
      );
    } finally {
      rmSync(path, { recursive: true, force: true });
    }
  }
  const valid = mkdtempSync(join(tmpdir(), 'stryker-policy-valid-'));
  try {
    writeFileSync(join(valid, 'stryker.config.json'), '{"tsconfigFile":""}');
    validateStrykerTsconfigField(join(valid, 'stryker.config.json'));
  } finally {
    rmSync(valid, { recursive: true, force: true });
  }
});
