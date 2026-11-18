import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  evaluateException,
  parseRecord,
  runAuditGuard,
  type AuditCommandResult,
  type EvaluateInput,
} from './audit-guard.ts';

type EvaluateOverrides = { readonly [K in keyof EvaluateInput]?: EvaluateInput[K] | undefined };

const APPROVED_URL = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf';
const SECOND_URL = 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc';
const NOW_OK = new Date('2026-11-25T00:00:00+08:00');
const SHIPPED_RECORD = readFileSync(
  fileURLToPath(new URL('./audit-exception.json', import.meta.url)),
  'utf8',
);

function command(stdout: string, status = 1): AuditCommandResult {
  return { status, signal: null, stdout, stderr: '', error: undefined };
}

/** Mutate a deep copy of the shipped record; its digest binding stays authoritative. */
function recordVariant(mutate: (record: Record<string, unknown>) => void): string {
  const record = JSON.parse(SHIPPED_RECORD) as Record<string, unknown>;
  mutate(record);
  return JSON.stringify(record);
}

function advisory(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: 1,
    name: 'picomatch',
    dependency: 'picomatch',
    title: 'synthetic advisory',
    url: APPROVED_URL,
    severity: 'high',
    range: '<=4.0.7',
    ...overrides,
  };
}

function vulnerabilitiesFor(aggregateName: string): Record<string, unknown> {
  return {
    picomatch: {
      name: 'picomatch',
      severity: 'high',
      isDirect: false,
      via: [advisory()],
      effects: [aggregateName],
      range: '<=4.0.7',
      nodes: ['node_modules/picomatch'],
    },
    [aggregateName]: {
      name: aggregateName,
      severity: 'high',
      isDirect: false,
      via: ['picomatch'],
      effects: [],
      range: '*',
      nodes: [`node_modules/${aggregateName}`],
    },
  };
}

function auditJson(vulnerabilities: Record<string, unknown>, high = 1): string {
  return JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities,
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high, critical: 0, total: high } },
  });
}

function chainEntries(packages: Record<string, unknown>, chain: readonly string[]): void {
  for (let index = 0; index + 1 < chain.length; index += 1) {
    const name = chain[index] ?? '';
    const next = chain[index + 1] ?? '';
    packages[`node_modules/${name}`] = { version: '1.0.0', dependencies: { [next]: '*' } };
  }
}

function rootFixtureDeps(
  chain: readonly string[],
  extra: readonly string[] | undefined,
): Record<string, string> {
  const roots: Record<string, string> = { [chain[0] ?? '']: '1.0.0' };
  if (extra !== undefined) roots[extra[0] ?? ''] = '1.0.0';
  return roots;
}

function picomatchFixtureEntry(options: {
  picomatchVersion?: string;
  mode?: 'dev' | 'prod' | 'unflagged';
}): Record<string, unknown> {
  const entry: Record<string, unknown> = { version: options.picomatchVersion ?? '4.0.7' };
  if ((options.mode ?? 'dev') === 'dev') entry['dev'] = true;
  return entry;
}

/**
 * Synthetic npm lock carrying one dependency chain to picomatch. The default
 * chain `cspell > cspell-glob > picomatch` is taken from the shipped record's
 * assessed paths; the unassessed-path test appends a chain outside the record.
 */
function npmLock(
  options: {
    chain?: readonly string[];
    picomatchVersion?: string;
    mode?: 'dev' | 'prod' | 'unflagged';
    extraChain?: readonly string[];
  } = {},
): string {
  const chain = options.chain ?? ['cspell', 'cspell-glob', 'picomatch'];
  const rootField = (options.mode ?? 'dev') === 'prod' ? 'dependencies' : 'devDependencies';
  const packages: Record<string, unknown> = {
    '': { [rootField]: rootFixtureDeps(chain, options.extraChain) },
  };
  chainEntries(packages, chain);
  if (options.extraChain !== undefined) chainEntries(packages, options.extraChain);
  packages['node_modules/picomatch'] = picomatchFixtureEntry(options);
  return JSON.stringify(
    { name: 'fixture', version: '1.0.0', lockfileVersion: 3, packages },
    null,
    2,
  );
}

function bunLock(options: { picomatchVersion?: string; prod?: boolean } = {}): string {
  const version = options.picomatchVersion ?? '4.0.7';
  const root: Record<string, unknown> = { name: 'fixture' };
  root[options.prod === true ? 'dependencies' : 'devDependencies'] = { cspell: '1.0.0' };
  return JSON.stringify(
    {
      lockfileVersion: 1,
      configVersion: 1,
      workspaces: { '': root },
      packages: {
        cspell: ['cspell@1.0.0', '', { dependencies: { 'cspell-glob': '*' } }, 'sha'],
        'cspell-glob': ['cspell-glob@1.0.0', '', { dependencies: { picomatch: '*' } }, 'sha'],
        picomatch: [`picomatch@${version}`, '', {}, 'sha'],
      },
    },
    null,
    2,
  );
}

function approvedInput(overrides: EvaluateOverrides = {}): EvaluateInput {
  return {
    recordText: SHIPPED_RECORD,
    audit: command(auditJson(vulnerabilitiesFor('tool'))),
    family: 'npm',
    lockText: npmLock(),
    now: NOW_OK,
    ...overrides,
  } as EvaluateInput;
}

function failureText(failures: readonly string[]): string {
  return failures.join('; ');
}

void test('the approved advisory on the assessed dev-only path passes with an explicit warning', () => {
  const result = evaluateException(approvedInput());
  assert.equal(result.ok, true);
  assert.equal(result.passedWithException, true);
  assert.ok(result.warning !== undefined);
  assert.match(result.warning, /WARNING security exception applied/u);
  assert.match(result.warning, /audit-exception\.json/u);
  assert.match(result.warning, /GHSA-fc5q-39xc-vjpf/u);
  assert.match(result.warning, /2026-12-18T14:39:00\+08:00/u);
});

void test('the approved advisory passes against a bun lock with a prod-closure scope proof', () => {
  const result = evaluateException(approvedInput({ family: 'bun', lockText: bunLock() }));
  assert.equal(result.ok, true);
  assert.equal(result.passedWithException, true);
});

function bunAdvisory(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1247710,
    url: APPROVED_URL,
    title: 'synthetic advisory',
    severity: 'high',
    vulnerable_versions: '<=4.0.7',
    cwe: ['CWE-1333'],
    cvss: { score: 7.5, vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H' },
    ...overrides,
  };
}

function bunAuditJson(packages: Record<string, unknown>): string {
  return JSON.stringify(packages);
}

void test('the bun audit schema form passes when the advisory is in scope', () => {
  const result = evaluateException(
    approvedInput({
      family: 'bun',
      lockText: bunLock(),
      audit: command(bunAuditJson({ picomatch: [bunAdvisory()] })),
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.passedWithException, true);
});

void test('a second advisory in the bun audit schema form is rejected', () => {
  const result = evaluateException(
    approvedInput({
      family: 'bun',
      lockText: bunLock(),
      audit: command(
        bunAuditJson({
          picomatch: [bunAdvisory()],
          minimatch: [bunAdvisory({ id: 2, url: SECOND_URL })],
        }),
        1,
      ),
    }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result.failures), /outside the approved scope/u);
  assert.match(failureText(result.failures), /GHSA-aaaa-bbbb-cccc/u);
});

void test('a wrong package in the bun audit schema form is rejected', () => {
  const result = evaluateException(
    approvedInput({
      family: 'bun',
      lockText: bunLock(),
      audit: command(bunAuditJson({ micromatch: [bunAdvisory()] })),
    }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result.failures), /outside the approved scope/u);
});

void test('unknown or malformed bun-shaped payloads are rejected', () => {
  const cases: readonly { readonly label: string; readonly stdout: string }[] = [
    { label: 'empty advisory list', stdout: bunAuditJson({ picomatch: [] }) },
    {
      label: 'advisory missing fields',
      stdout: bunAuditJson({ picomatch: [{ id: 1, url: APPROVED_URL }] }),
    },
    { label: 'non-array value', stdout: bunAuditJson({ picomatch: 'bad' }) },
    { label: 'top-level array', stdout: JSON.stringify([bunAdvisory()]) },
  ];
  for (const entry of cases) {
    const result = evaluateException(
      approvedInput({ family: 'bun', lockText: bunLock(), audit: command(entry.stdout) }),
    );
    assert.equal(result.ok, false, entry.label);
    assert.match(failureText(result.failures), /unknown or malformed schema/u, entry.label);
  }
});

void test('a clean audit passes without applying the exception', () => {
  const result = evaluateException(approvedInput({ audit: command(auditJson({}, 0), 0) }));
  assert.equal(result.ok, true);
  assert.equal(result.passedWithException, false);
  assert.ok(result.warning !== undefined);
  assert.match(result.warning, /NOTICE/u);
  assert.match(result.warning, /not applied this run/u);
  assert.doesNotMatch(result.warning, /WARNING/u);
});

void test('a second advisory is rejected', () => {
  const vulnerabilities = {
    ...vulnerabilitiesFor('tool'),
    minimatch: {
      name: 'minimatch',
      severity: 'high',
      isDirect: false,
      via: [advisory({ name: 'minimatch', dependency: 'minimatch', url: SECOND_URL, source: 2 })],
      effects: [],
      range: '*',
      nodes: ['node_modules/minimatch'],
    },
  };
  const result = evaluateException(
    approvedInput({ audit: command(auditJson(vulnerabilities, 2)) }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result.failures), /outside the approved scope/u);
  assert.match(failureText(result.failures), /GHSA-aaaa-bbbb-cccc/u);
});

void test('a parent-tool aggregate entry does not suppress another underlying advisory source', () => {
  const vulnerabilities = vulnerabilitiesFor('tool');
  vulnerabilities['tool'] = {
    name: 'tool',
    severity: 'high',
    isDirect: false,
    via: ['picomatch', 'minimatch'],
    effects: [],
    range: '*',
    nodes: ['node_modules/tool'],
  };
  vulnerabilities['minimatch'] = {
    name: 'minimatch',
    severity: 'high',
    isDirect: false,
    via: [advisory({ name: 'minimatch', dependency: 'minimatch', url: SECOND_URL, source: 2 })],
    effects: [],
    range: '*',
    nodes: ['node_modules/minimatch'],
  };
  const result = evaluateException(
    approvedInput({ audit: command(auditJson(vulnerabilities, 2)) }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result.failures), /GHSA-aaaa-bbbb-cccc/u);
});

void test('a wrong locked version is rejected', () => {
  const result = evaluateException(
    approvedInput({ lockText: npmLock({ picomatchVersion: '3.1.0' }) }),
  );
  assert.equal(result.ok, false);
  assert.match(failureText(result.failures), /outside the approved version 4\.0\.7/u);
});

void test('a wrong package under the approved advisory is rejected', () => {
  const vulnerabilities = vulnerabilitiesFor('tool');
  vulnerabilities['picomatch'] = {
    name: 'picomatch',
    severity: 'high',
    isDirect: false,
    via: [advisory({ name: 'micromatch', dependency: 'micromatch' })],
    effects: ['tool'],
    range: '<=4.0.7',
    nodes: ['node_modules/picomatch'],
  };
  const result = evaluateException(approvedInput({ audit: command(auditJson(vulnerabilities)) }));
  assert.equal(result.ok, false);
  assert.match(failureText(result.failures), /outside the approved scope/u);
});

void test('production reachability is rejected', () => {
  const result = evaluateException(approvedInput({ lockText: npmLock({ mode: 'prod' }) }));
  assert.equal(result.ok, false);
  assert.match(failureText(result.failures), /production dependencies/u);
});

void test('an npm entry without the dev-only marker is rejected', () => {
  const result = evaluateException(approvedInput({ lockText: npmLock({ mode: 'unflagged' }) }));
  assert.equal(result.ok, false);
  assert.match(failureText(result.failures), /not marked dev-only/u);
});

void test('an unassessed dependency path is rejected even when it contains assessed names', () => {
  const result = evaluateException(
    approvedInput({ lockText: npmLock({ extraChain: ['evil', 'cspell-glob'] }) }),
  );
  assert.equal(result.ok, false);
  assert.match(
    failureText(result.failures),
    /unassessed dependency path: evil > cspell-glob > picomatch/u,
  );
});

void test('the expiry boundary fails closed exactly at expiresAt', () => {
  const before = evaluateException(approvedInput({ now: new Date('2026-12-18T14:38:59+08:00') }));
  assert.equal(before.ok, true);
  const at = evaluateException(approvedInput({ now: new Date('2026-12-18T14:39:00+08:00') }));
  assert.equal(at.ok, false);
  assert.match(failureText(at.failures), /exception expired at 2026-12-18T14:39:00\+08:00/u);
});

const invalidRecordCases: readonly {
  readonly label: string;
  readonly record: string;
  readonly match: RegExp;
}[] = [
  { label: 'missing record', record: '', match: /not valid JSON/u },
  {
    label: 'wrong approver',
    record: recordVariant((record) => {
      record['approvedBy'] = 'Other';
    }),
    match: /approvedBy/u,
  },
  {
    label: 'wrong advisory',
    record: recordVariant((record) => {
      record['advisoryId'] = 'GHSA-aaaa-bbbb-cccc';
    }),
    match: /advisoryId/u,
  },
  {
    label: 'wrong locked version',
    record: recordVariant((record) => {
      record['lockedVersion'] = '3.1.0';
    }),
    match: /lockedVersion/u,
  },
  {
    label: 'expiry beyond the 30-day window',
    record: recordVariant((record) => {
      record['expiresAt'] = '2026-12-19T14:39:00+08:00';
    }),
    match: /30-day window/u,
  },
  {
    label: 'missing field',
    record: recordVariant((record) => {
      delete record['expiresAt'];
    }),
    match: /audit-exception\.json is invalid/u,
  },
  {
    label: 'unknown field',
    record: recordVariant((record) => {
      record['extra'] = 1;
    }),
    match: /audit-exception\.json is invalid/u,
  },
  {
    label: 'path not ending at the package',
    record: recordVariant((record) => {
      record['paths'] = [['tool', 'other-lib']];
    }),
    match: /must end at the package/u,
  },
  {
    label: 'duplicated path',
    record: recordVariant((record) => {
      const paths = record['paths'] as string[][];
      record['paths'] = [paths[0] ?? [], paths[0] ?? []];
    }),
    match: /must be unique/u,
  },
  {
    label: 'wrong approval time',
    record: recordVariant((record) => {
      record['approvedAt'] = '2026-11-17T14:39:00+08:00';
    }),
    match: /approvedAt/u,
  },
  {
    label: 'appended path widening the record',
    record: recordVariant((record) => {
      (record['paths'] as string[][]).push(['evil-tool', 'picomatch']);
    }),
    match: /paths do not match the approved path set/u,
  },
  {
    label: 'replaced path set widening the record',
    record: recordVariant((record) => {
      record['paths'] = [
        ['cspell', 'cspell-glob', 'picomatch'],
        ['evil-tool', 'picomatch'],
      ];
    }),
    match: /paths do not match the approved path set/u,
  },
];

void test('invalid approval records are rejected', () => {
  for (const entry of invalidRecordCases) {
    const result = evaluateException(approvedInput({ recordText: entry.record }));
    assert.equal(result.ok, false, entry.label);
    assert.match(failureText(result.failures), entry.match, entry.label);
  }
});

void test('unknown or malformed audit output is rejected', () => {
  const cases: readonly {
    readonly label: string;
    readonly stdout: string;
    readonly match: RegExp;
  }[] = [
    { label: 'not JSON', stdout: 'plain text', match: /not valid JSON/u },
    {
      label: 'unknown report version',
      stdout: JSON.stringify({
        auditReportVersion: 3,
        vulnerabilities: {},
        metadata: {
          vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
        },
      }),
      match: /unknown or malformed schema/u,
    },
    {
      label: 'infrastructure error payload',
      stdout: JSON.stringify({ error: { code: 'ENOTFOUND', summary: 'registry unreachable' } }),
      match: /infrastructure error/u,
    },
    {
      label: 'dangling aggregate reference',
      stdout: auditJson({
        tool: {
          name: 'tool',
          severity: 'high',
          isDirect: false,
          via: ['ghost'],
          effects: [],
          range: '*',
          nodes: ['node_modules/tool'],
        },
      }),
      match: /missing vulnerability entry: ghost/u,
    },
    {
      label: 'empty via list',
      stdout: auditJson({
        tool: {
          name: 'tool',
          severity: 'high',
          isDirect: false,
          via: [],
          effects: [],
          range: '*',
          nodes: ['node_modules/tool'],
        },
      }),
      match: /missing vulnerability entry: tool/u,
    },
  ];
  for (const entry of cases) {
    const result = evaluateException(approvedInput({ audit: command(entry.stdout) }));
    assert.equal(result.ok, false, entry.label);
    assert.match(failureText(result.failures), entry.match, entry.label);
  }
});

void test('audit command failures are rejected', () => {
  const spawnFailure = evaluateException(
    approvedInput({
      audit: {
        status: null,
        signal: null,
        stdout: '',
        stderr: 'spawn failed',
        error: 'spawn ENOENT',
      },
    }),
  );
  assert.equal(spawnFailure.ok, false);
  assert.match(failureText(spawnFailure.failures), /failed to run/u);
  const exitFailure = evaluateException(approvedInput({ audit: command('{}', 2) }));
  assert.equal(exitFailure.ok, false);
  assert.match(failureText(exitFailure.failures), /exit 2/u);
});

void test('a missing lockfile is rejected when the exception is needed', () => {
  const result = evaluateException(approvedInput({ lockText: undefined }));
  assert.equal(result.ok, false);
  assert.match(failureText(result.failures), /lockfile is missing/u);
});

void test('the shipped exception record parses and matches the approved scope', () => {
  const record = parseRecord(SHIPPED_RECORD);
  assert.equal(record.advisoryId, 'GHSA-fc5q-39xc-vjpf');
  assert.equal(record.package, 'picomatch');
  assert.equal(record.lockedVersion, '4.0.7');
  assert.equal(record.scope, 'devOnly');
  assert.equal(record.approvedBy, 'Nika');
  assert.equal(record.approvedAt, '2026-11-18T14:39:00+08:00');
  assert.equal(record.expiresAt, '2026-12-18T14:39:00+08:00');
  assert.ok(record.paths.length > 0);
  for (const chain of record.paths) assert.equal(chain[chain.length - 1], 'picomatch');
});

void test('runAuditGuard preserves raw audit output and fails closed on command failure', () => {
  const root = mkdtempSync(join(tmpdir(), 'audit-guard-'));
  try {
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'fixture', packageManager: 'npm@12.2.2' }) + '\n',
    );
    writeFileSync(
      join(root, 'package-lock.json'),
      npmLock({ chain: ['cspell', 'cspell-glob', 'picomatch'] }),
    );
    const stdout = auditJson(vulnerabilitiesFor('cspell-glob'));
    const passRun = runAuditGuard({
      projectRoot: root,
      now: NOW_OK,
      runCommand: () => command(stdout),
    });
    assert.equal(passRun.code, 0);
    assert.equal(
      readFileSync(join(root, 'artifacts', 'security-exception', 'audit-stdout.txt'), 'utf8'),
      stdout,
    );
    assert.ok(passRun.lines.some((line) => line.includes('WARNING security exception applied')));
    const failRun = runAuditGuard({
      projectRoot: root,
      now: NOW_OK,
      runCommand: () => ({
        status: null,
        signal: null,
        stdout: '',
        stderr: 'spawn failed',
        error: 'spawn ENOENT',
      }),
    });
    assert.equal(failRun.code, 1);
    assert.equal(
      readFileSync(join(root, 'artifacts', 'security-exception', 'audit-stdout.txt'), 'utf8'),
      '',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
