import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

void test('npm audit JSON error field blocks lock updates', async () => {
  const stage = mkdtempSync(join(tmpdir(), 'audit-block-'));
  const stubCli = join(stage, 'npm-cli.cjs');
  mkdirSync(join(stage, 'fixtures'));
  writeFileSync(
    stubCli,
    `#!/usr/bin/env node
const payload = { error: { code: 'ENOTFOUND', summary: 'synthetic network failure' } };
console.log(JSON.stringify(payload));
process.exit(1);
`,
  );
  const { spawnSync } = await import('node:child_process');
  const probe = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
import { spawnSync } from 'node:child_process';
const cli = process.argv[1];
const result = spawnSync(process.execPath, [cli], { encoding: 'utf8' });
let metadata;
try { metadata = JSON.parse(result.stdout); } catch { process.exit(2); }
const failed = result.status !== 0 || metadata.error !== undefined;
process.exit(failed ? 0 : 3);
`,
      stubCli,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(probe.status, 0, probe.stderr);
  rmSync(stage, { recursive: true, force: true });
});
