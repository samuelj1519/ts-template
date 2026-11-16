import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';
import { z } from 'zod';

export type PackageManagerFamily = 'npm' | 'bun';

const allowedLockFiles = ['package-lock.json', 'bun.lock'] as const;
const forbiddenLockFiles = [
  'yarn.lock',
  'pnpm-lock.yaml',
  'pnpm-lock.yml',
  'npm-shrinkwrap.json',
  'bun.lockb',
] as const;

const exactPackageManagers: Record<PackageManagerFamily, string> = {
  npm: 'npm@12.2.2',
  bun: 'bun@1.3.11',
};

export function readPackageManagerField(projectRoot: string): string | undefined {
  const manifest = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as {
    packageManager?: string;
  };
  return manifest.packageManager;
}

export function detectLocks(projectRoot: string): string[] {
  return [...allowedLockFiles, ...forbiddenLockFiles].filter((name) =>
    existsSync(join(projectRoot, name)),
  );
}

export function expectedManagerFamily(packageManager: string | undefined): PackageManagerFamily {
  if (!packageManager) throw new Error('package.json must declare an exact packageManager field.');
  if (packageManager.startsWith('npm@')) return 'npm';
  if (packageManager.startsWith('bun@')) return 'bun';
  throw new Error(`Unsupported packageManager field: ${packageManager}`);
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  return JSON.stringify(value);
}

function readManifest(projectRoot: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as Record<
    string,
    unknown
  >;
}

function assertForeignLocksAbsent(present: readonly string[]): void {
  for (const forbidden of forbiddenLockFiles) {
    if (present.includes(forbidden)) {
      throw new Error(
        `Forbidden lock file ${forbidden} is present. Keep only the reviewed lock for the selected package manager.`,
      );
    }
  }
}

function assertExactPackageManager(
  packageManager: string | undefined,
  family: PackageManagerFamily,
): void {
  const expected = exactPackageManagers[family];
  if (packageManager !== expected) {
    throw new Error(
      `packageManager must be exactly ${expected} for this variant, not ${String(packageManager)}.`,
    );
  }
}

function assertNpmLockMatchesManifest(
  projectRoot: string,
  manifest: Record<string, unknown>,
): void {
  const lock = JSON.parse(readFileSync(join(projectRoot, 'package-lock.json'), 'utf8')) as {
    name: string;
    version: string;
    packages: Record<string, Record<string, unknown>>;
  };
  const root = lock.packages[''];
  if (!root || lock.name !== manifest['name'] || lock.version !== manifest['version'])
    throw new Error('Lock identity does not match its manifest.');
  for (const key of ['name', 'version', 'dependencies', 'devDependencies', 'engines', 'license']) {
    const empty = key === 'dependencies' || key === 'devDependencies' ? {} : undefined;
    if (canonicalJson(root[key] ?? empty) !== canonicalJson(manifest[key] ?? empty))
      throw new Error(`Lock root does not match manifest: ${key}`);
  }
}

function assertBunLockMatchesManifest(
  projectRoot: string,
  manifest: Record<string, unknown>,
): void {
  const lock = readFileSync(join(projectRoot, 'bun.lock'));
  const parsed = z
    .object({
      workspaces: z.object({
        '': z.object({
          name: z.string(),
          devDependencies: z.record(z.string(), z.string()).optional(),
          dependencies: z.record(z.string(), z.string()).optional(),
        }),
      }),
    })
    .parse(parseJsonc(lock.toString('utf8'), [], { allowTrailingComma: true }));
  const root = parsed.workspaces[''];
  if (root.name !== manifest['name'])
    throw new Error('Bun lock identity does not match its manifest.');
  for (const key of ['dependencies', 'devDependencies'] as const) {
    const empty = {};
    if (canonicalJson(root[key] ?? empty) !== canonicalJson(manifest[key] ?? empty))
      throw new Error(`Bun lock root does not match manifest: ${key}`);
  }
}

export function validateLockUniqueness(projectRoot: string): void {
  const packageManager = readPackageManagerField(projectRoot);
  const family = expectedManagerFamily(packageManager);
  const present = detectLocks(projectRoot);
  assertForeignLocksAbsent(present);
  assertExactPackageManager(packageManager, family);
  const allowed = family === 'npm' ? 'package-lock.json' : 'bun.lock';
  const forbidden = family === 'npm' ? 'bun.lock' : 'package-lock.json';
  const owned = present.filter((name) => (allowedLockFiles as readonly string[]).includes(name));
  if (owned.length === 0) {
    throw new Error(
      `${family} variant requires exactly one lock file (${allowed}). Run the approved install command to create it.`,
    );
  }
  if (owned.length > 1) {
    throw new Error(
      `${family} variant allows only ${allowed}, but found: ${owned.join(', ')}. Keep the reviewed lock and remove the extra manager lock.`,
    );
  }
  if (owned[0] !== allowed) {
    throw new Error(
      `packageManager ${String(packageManager)} requires ${allowed}, not ${owned[0] ?? forbidden}.`,
    );
  }
  const manifest = readManifest(projectRoot);
  if (family === 'npm') assertNpmLockMatchesManifest(projectRoot, manifest);
  else assertBunLockMatchesManifest(projectRoot, manifest);
}
