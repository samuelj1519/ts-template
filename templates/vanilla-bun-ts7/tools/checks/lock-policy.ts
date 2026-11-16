import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type PackageManagerFamily = 'npm' | 'bun';

const lockFiles = ['package-lock.json', 'bun.lock', 'bun.lockb'] as const;

export function readPackageManagerField(projectRoot: string): string | undefined {
  const manifest = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as {
    packageManager?: string;
  };
  return manifest.packageManager;
}

export function detectLocks(projectRoot: string): string[] {
  return lockFiles.filter((name) => existsSync(join(projectRoot, name)));
}

export function expectedManagerFamily(packageManager: string | undefined): PackageManagerFamily {
  if (!packageManager) throw new Error('package.json must declare an exact packageManager field.');
  if (packageManager.startsWith('npm@')) return 'npm';
  if (packageManager.startsWith('bun@')) return 'bun';
  throw new Error(`Unsupported packageManager field: ${packageManager}`);
}

export function validateLockUniqueness(projectRoot: string): void {
  const packageManager = readPackageManagerField(projectRoot);
  const family = expectedManagerFamily(packageManager);
  const present = detectLocks(projectRoot);
  if (present.includes('bun.lockb')) {
    throw new Error(
      'Remove binary bun.lockb; this template accepts only package-lock.json or text bun.lock.',
    );
  }
  const allowed = family === 'npm' ? 'package-lock.json' : 'bun.lock';
  const forbidden = family === 'npm' ? 'bun.lock' : 'package-lock.json';
  if (present.length === 0) {
    throw new Error(
      `${family} variant requires exactly one lock file (${allowed}). Run the approved install command to create it.`,
    );
  }
  if (present.length > 1) {
    throw new Error(
      `${family} variant allows only ${allowed}, but found: ${present.join(', ')}. Keep the reviewed lock and remove the extra manager lock.`,
    );
  }
  if (present[0] !== allowed) {
    throw new Error(
      `packageManager ${packageManager} requires ${allowed}, not ${present[0] ?? forbidden}.`,
    );
  }
}
