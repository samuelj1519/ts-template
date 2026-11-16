import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { composePackage, validateNpmLock } from './assembly.ts';
import { readFiles, writeFiles } from './files.ts';
import { authoritativeLockPath, lockArtifactId } from './options.ts';
import { parseObject } from './merge.ts';
import { readRegistry } from './registry.ts';
import type { TemplateCombination } from './registry.ts';

const HANDOFF_BLOCKER = '.handoff/待Nika拍板.md';

function writeLog(root: string, combination: TemplateCombination, body: string): void {
  writeFiles(
    root,
    new Map([
      [
        `artifacts/template-locks/${lockArtifactId(combination)}.log`,
        { content: Buffer.from(body), mode: 0o644 },
      ],
    ]),
  );
}

function runCommand(
  root: string,
  combination: TemplateCombination,
  cwd: string,
  label: string,
  executable: string,
  args: readonly string[],
  env?: NodeJS.ProcessEnv,
): ReturnType<typeof spawnSync> {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    timeout: 300_000,
    maxBuffer: 32 * 1024 * 1024,
    env,
  });
  const log = [
    `label: ${label}`,
    `cwd: ${cwd}`,
    `command: ${JSON.stringify([executable, ...args])}`,
    `exit: ${String(result.status)}`,
    `signal: ${String(result.signal)}`,
    `error: ${String(result.error ?? '')}`,
    result.stdout,
    result.stderr,
  ].join('\n');
  writeLog(root, combination, log);
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${label} failed for ${lockArtifactId(combination)}; inspect artifacts/template-locks/${lockArtifactId(combination)}.log.`,
    );
  return result;
}

type NpmAuditMetadata = {
  metadata?: { vulnerabilities?: Record<string, number> };
  error?: unknown;
};

function npmAuditCounts(stdout: string): { high: number; critical: number } | null {
  let metadata: NpmAuditMetadata;
  try {
    metadata = JSON.parse(stdout) as NpmAuditMetadata;
  } catch {
    return null;
  }
  if (metadata.error !== undefined) return null;
  const counts = metadata.metadata?.vulnerabilities;
  if (!counts) return null;
  return {
    high: Number(counts['high'] ?? 0),
    critical: Number(counts['critical'] ?? 0),
  };
}

function auditNpm(
  root: string,
  combination: TemplateCombination,
  directory: string,
  cli: string,
): void {
  const result = spawnSync(process.execPath, [cli, 'audit', '--audit-level=low', '--json'], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 300_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  writeLog(
    root,
    combination,
    `${String(result.stdout ?? '')}\n${String(result.stderr ?? '')}\nexit: ${String(result.status)}\n`,
  );
  if (result.status !== 0) {
    blockOnAudit(root, combination, {
      auditCommandFailed: true,
      status: result.status,
      stderr: String(result.stderr ?? '').slice(0, 500),
    });
    return;
  }
  const counts = npmAuditCounts(String(result.stdout ?? ''));
  if (!counts) {
    blockOnAudit(root, combination, {
      parseError: true,
      stdout: String(result.stdout ?? '').slice(0, 500),
    });
    return;
  }
  if (counts.high > 0 || counts.critical > 0) blockOnAudit(root, combination, counts);
}

function auditBun(
  root: string,
  combination: TemplateCombination,
  directory: string,
  bunCli: string,
): void {
  const result = runCommand(root, combination, directory, 'bun-audit', bunCli, [
    'audit',
    '--audit-level=low',
  ]);
  const output = `${String(result.stdout ?? '')}${String(result.stderr ?? '')}`;
  if (/\b(high|critical)\b/iu.test(output) && !/0 high|0 critical/iu.test(output))
    blockOnAudit(root, combination, { output });
}

function blockOnAudit(
  root: string,
  combination: TemplateCombination,
  evidence: Record<string, unknown>,
): void {
  const body = [
    '# 锁生成安全阻断',
    '',
    `组合：${lockArtifactId(combination)}`,
    '',
    'npm/bun audit 报告 high 或 critical 漏洞。在 Nika 批准前不得写入权威锁或同步成品。',
    '',
    '```json',
    JSON.stringify(evidence, null, 2),
    '```',
    '',
  ].join('\n');
  writeFileSync(join(root, HANDOFF_BLOCKER), body);
  throw new Error(`Audit blocked lock generation; see ${HANDOFF_BLOCKER}.`);
}

function npmLock(
  root: string,
  combination: TemplateCombination,
  directory: string,
  cli: string,
): Buffer {
  runCommand(root, combination, directory, 'npm-lock', process.execPath, [
    cli,
    'install',
    '--package-lock-only',
    '--ignore-scripts',
    '--no-fund',
    '--workspaces=false',
  ]);
  auditNpm(root, combination, directory, cli);
  return readFileSync(join(directory, 'package-lock.json'));
}

function bunLock(
  root: string,
  combination: TemplateCombination,
  directory: string,
  bunCli: string,
): Buffer {
  runCommand(root, combination, directory, 'bun-lock', bunCli, [
    'install',
    '--lockfile-only',
    '--ignore-scripts',
  ]);
  auditBun(root, combination, directory, bunCli);
  return readFileSync(join(directory, 'bun.lock'));
}

function resolveBunCli(): string {
  const fromEnv = process.env['TEMPLATE_BUN_CLI'];
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const which = spawnSync('which', ['bun'], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  throw new Error('Run templates:locks with Bun 1.3.11 on PATH or set TEMPLATE_BUN_CLI.');
}

function persistLocks(
  root: string,
  completed: Map<string, Buffer>,
  hashLines: readonly string[],
): void {
  const lockRoot = join(root, 'scaffold/locks');
  for (const path of completed.keys()) {
    mkdirSync(dirname(join(lockRoot, path.replace(/^locks\//u, ''))), { recursive: true });
  }
  writeFiles(
    lockRoot,
    new Map(
      [...completed].map(([path, content]) => [
        path.replace(/^locks\//u, ''),
        { content, mode: 0o644 },
      ]),
    ),
  );
  writeFiles(
    root,
    new Map([
      [
        'artifacts/template-locks/sha256.txt',
        { content: Buffer.from(hashLines.join('\n') + '\n'), mode: 0o644 },
      ],
    ]),
  );
}

async function generateCombinationLock(
  root: string,
  combination: TemplateCombination,
  stage: string,
  cli: string,
  bunCli: string,
): Promise<{ readonly relative: string; readonly lock: Buffer }> {
  const directory = join(stage, lockArtifactId(combination));
  mkdirSync(directory, { recursive: true });
  const manifest = await composePackage(root, combination);
  writeFileSync(join(directory, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  const npmrc = join(root, 'scaffold/common/.npmrc');
  if (existsSync(npmrc)) copyFileSync(npmrc, join(directory, '.npmrc'));
  if (combination.typescriptMajor === 6) {
    copyFileSync(
      join(root, 'scaffold/options/ts6/eslint.config.mjs'),
      join(directory, 'eslint.config.mjs'),
    );
    copyFileSync(
      join(root, 'scaffold/options/ts6/.oxlintrc.json'),
      join(directory, '.oxlintrc.json'),
    );
  }
  const lock =
    combination.packageManager === 'npm'
      ? npmLock(root, combination, directory, cli)
      : bunLock(root, combination, directory, bunCli);
  if (combination.packageManager === 'npm') validateNpmLock(parseObject(lock), manifest);
  return { relative: authoritativeLockPath(combination).replace(/^scaffold\//u, ''), lock };
}

export async function updateLocks(root: string): Promise<void> {
  const registry = readRegistry(root);
  const cli = process.env['TEMPLATE_NPM_CLI'] ?? process.env['npm_execpath'];
  if (!cli || !existsSync(cli))
    throw new Error('Run templates:locks through npm or provide TEMPLATE_NPM_CLI.');
  const bunCli = resolveBunCli();
  const version = spawnSync(bunCli, ['--version'], { encoding: 'utf8' });
  if (version.stdout.trim() !== '1.3.11')
    throw new Error(`Expected Bun 1.3.11 for authoritative locks, found ${version.stdout.trim()}.`);
  readFiles(join(root, 'scaffold/locks'));
  const stage = mkdtempSync(join(tmpdir(), 'frontend-lock-stage-'));
  const completed = new Map<string, Buffer>();
  const hashLines: string[] = [];
  try {
    for (const combination of registry.combinations) {
      const generated = await generateCombinationLock(root, combination, stage, cli, bunCli);
      completed.set(generated.relative, generated.lock);
      hashLines.push(
        `${lockArtifactId(combination)} ${createHash('sha256').update(generated.lock).digest('hex')}`,
      );
    }
    persistLocks(root, completed, hashLines);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
