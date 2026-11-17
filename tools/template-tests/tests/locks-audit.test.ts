import assert from 'node:assert/strict';
import { test } from 'node:test';
import { npmAuditFailure } from '../src/locks.ts';

void test('npm audit failures and high-severity results block lock updates', () => {
  assert.deepEqual(
    npmAuditFailure({ status: 1, stdout: '', stderr: 'synthetic network failure' }),
    { auditCommandFailed: true, status: 1, stderr: 'synthetic network failure' },
  );
  assert.deepEqual(npmAuditFailure({ status: 0, stdout: '{', stderr: '' }), {
    parseError: true,
    stdout: '{',
  });
  const errorJson = JSON.stringify({ error: { code: 'ENOTFOUND' } });
  assert.deepEqual(npmAuditFailure({ status: 0, stdout: errorJson, stderr: '' }), {
    parseError: true,
    stdout: errorJson,
  });
  const vulnerabilities = (high: number, critical: number) =>
    JSON.stringify({ metadata: { vulnerabilities: { high, critical } } });
  assert.equal(
    npmAuditFailure({ status: 0, stdout: vulnerabilities(0, 0), stderr: '' }),
    undefined,
  );
  assert.deepEqual(npmAuditFailure({ status: 0, stdout: vulnerabilities(1, 0), stderr: '' }), {
    high: 1,
    critical: 0,
  });
  assert.deepEqual(npmAuditFailure({ status: 0, stdout: vulnerabilities(0, 2), stderr: '' }), {
    high: 0,
    critical: 2,
  });
});
