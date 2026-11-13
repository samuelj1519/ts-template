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
import { join } from 'node:path';
import { composePackage, validateLock } from './assembly.ts';
import { readFiles, writeFiles } from './files.ts';
import { parseObject } from './merge.ts';
import { readRegistry } from './registry.ts';
import type { PresetId } from './registry.ts';

function installLock(root: string, directory: string, cli: string, id: PresetId): void {
  const args = [
    cli,
    'install',
    '--package-lock-only',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--workspaces=false',
  ];
  const result = spawnSync(process.execPath, args, {
    cwd: directory,
    encoding: 'utf8',
    timeout: 300_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const log = [
    `cwd: ${directory}`,
    `command: ${JSON.stringify([process.execPath, ...args])}`,
    `exit: ${String(result.status)}`,
    `signal: ${String(result.signal)}`,
    `error: ${String(result.error ?? '')}`,
    result.stdout,
    result.stderr,
  ].join('\n');
  writeFiles(
    root,
    new Map([[`artifacts/template-locks/${id}.log`, { content: Buffer.from(log), mode: 0o644 }]]),
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `Lock generation failed for ${id}; inspect artifacts/template-locks/${id}.log.`,
    );
}

export async function updateLocks(root: string): Promise<void> {
  const cli = process.env['TEMPLATE_NPM_CLI'] ?? process.env['npm_execpath'];
  if (!cli || !existsSync(cli))
    throw new Error('Run templates:locks through npm or provide TEMPLATE_NPM_CLI.');
  readFiles(join(root, 'scaffold/locks'));
  const stage = mkdtempSync(join(tmpdir(), 'frontend-lock-stage-'));
  const completed = new Map<string, Buffer>();
  try {
    for (const preset of readRegistry(root).presets) {
      const directory = join(stage, preset.id);
      mkdirSync(directory);
      const manifest = await composePackage(root, preset.id);
      writeFileSync(join(directory, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
      const npmrc = join(root, 'scaffold/common/.npmrc');
      if (existsSync(npmrc)) copyFileSync(npmrc, join(directory, '.npmrc'));
      installLock(root, directory, cli, preset.id);
      const lock = readFileSync(join(directory, 'package-lock.json'));
      validateLock(parseObject(lock), manifest);
      completed.set(`${preset.id}.json`, lock);
    }
    writeFiles(
      join(root, 'scaffold/locks'),
      new Map([...completed].map(([name, content]) => [name, { content, mode: 0o644 }])),
    );
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
