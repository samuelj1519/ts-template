import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { enforceTs6Review } from './ts6-review.ts';
import { validateLockUniqueness } from './lock-policy.ts';
import { validateStrykerTsconfigField } from './stryker-policy.ts';
import { validateTsConfigPolicy } from './tsconfig-policy.ts';

function usesTypeScript6(projectRoot: string): boolean {
  const manifest = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as {
    devDependencies?: Record<string, string>;
  };
  const version = manifest.devDependencies?.['typescript'];
  return version?.startsWith('6.') === true;
}

export function runToolchainChecks(
  projectRoot: string,
  mode: 'project' | 'maintainer' = 'project',
): void {
  validateStrykerTsconfigField(join(projectRoot, 'stryker.config.json'));
  if (usesTypeScript6(projectRoot)) enforceTs6Review(projectRoot, mode);
  validateTsConfigPolicy(projectRoot);
  validateLockUniqueness(projectRoot);
}

if (import.meta.main) {
  runToolchainChecks(process.cwd(), 'project');
  process.stdout.write('Toolchain: stryker, tsconfig, lock and TS6 review checks passed.\n');
}
