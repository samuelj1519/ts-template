import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { readRegistry } from './registry.ts';

const root = fileURLToPath(new URL('../../..', import.meta.url));

type Row = { readonly id: string; readonly code: number; readonly seconds: number };

function packageManagerFor(directory: string): 'npm' | 'bun' {
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as {
    packageManager?: string;
  };
  const value = manifest.packageManager ?? '';
  if (value.startsWith('bun@')) return 'bun';
  if (value.startsWith('npm@')) return 'npm';
  throw new Error(`Unknown packageManager in ${directory}: ${value}`);
}

function runStep(cwd: string, command: string, args: string[]): number {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, npm_config_registry: 'https://registry.npmjs.org/' },
  });
  return result.status ?? 1;
}

function verifyDirectory(id: string): Row {
  const directory = join(root, 'templates', id);
  const started = performance.now();
  const manager = packageManagerFor(directory);
  const installCode =
    manager === 'bun'
      ? runStep(directory, 'bun', ['install', '--frozen-lockfile'])
      : runStep(directory, 'npm', ['ci']);
  const checkCode = installCode === 0 ? runStep(directory, manager, ['run', 'check']) : installCode;
  const seconds = Math.round((performance.now() - started) / 1000);
  return { id, code: checkCode, seconds };
}

const ids = [...readRegistry(root).templateIds].sort();
const rows: Row[] = [];
let failed = false;
for (const id of ids) {
  const row = verifyDirectory(id);
  rows.push(row);
  if (row.code !== 0) failed = true;
}
for (const row of rows) {
  process.stdout.write(`${row.id}\t${row.code}\t${row.seconds}s\n`);
}
process.exit(failed ? 1 : 0);
