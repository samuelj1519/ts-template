import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { JsonObject } from './merge.ts';
import type { PackageManager, TemplateCombination, TypeScriptMajor } from './registry.ts';

export const PACKAGE_MANAGER_VERSION = {
  npm: 'npm@12.2.2',
  bun: 'bun@1.3.11',
} as const;

export const TYPESCRIPT_VERSION: Record<TypeScriptMajor, string> = {
  7: '7.0.2',
  6: '6.0.3',
};

export const TS6_LINT_DEV_DEPENDENCIES = {
  eslint: '10.15.0',
  'typescript-eslint': '8.72.2',
} as const;

const CONTROLLED_SCRIPT_KEYS = [
  'build',
  'test:e2e',
  'test:mutation',
  'check',
  'check:full',
  'check:milestone',
] as const;

const defaultLintTargets =
  'src e2e tools/checks vite.config.ts playwright.config.ts quality.config.ts .dependency-cruiser.cjs framework.config.ts vite.plugins.ts';

export function templateDirectoryId(combination: TemplateCombination): string {
  if (combination.packageManager === 'npm' && combination.typescriptMajor === 7)
    return combination.preset;
  return `${combination.preset}-${combination.packageManager}-ts${combination.typescriptMajor}`;
}

export function lockFileName(combination: TemplateCombination): string {
  return combination.packageManager === 'npm' ? 'package-lock.json' : 'bun.lock';
}

export function authoritativeLockPath(combination: TemplateCombination): string {
  return `scaffold/locks/${combination.preset}/${combination.packageManager}-ts${combination.typescriptMajor}.${
    combination.packageManager === 'npm' ? 'json' : 'lock'
  }`;
}

export function lockArtifactId(combination: TemplateCombination): string {
  return `${combination.preset}-${combination.packageManager}-ts${combination.typescriptMajor}`;
}

function substituteRunner(script: string, packageManager: PackageManager): string {
  if (packageManager === 'npm') return script;
  return script.replaceAll('npm run ', 'bun run ');
}

export function transformManifest(
  manifest: JsonObject,
  combination: TemplateCombination,
): JsonObject {
  const scripts = { ...(manifest['scripts'] as Record<string, string>) };
  const devDependencies = {
    ...(manifest['devDependencies'] as Record<string, string>),
  };
  const engines = {
    ...(manifest['engines'] as Record<string, string> | undefined),
  };

  for (const key of CONTROLLED_SCRIPT_KEYS) {
    if (key in scripts)
      scripts[key] = substituteRunner(scripts[key] ?? '', combination.packageManager);
  }

  manifest['packageManager'] = PACKAGE_MANAGER_VERSION[combination.packageManager];
  engines['node'] = '>=26.13.1 <27';
  delete engines['npm'];
  delete engines['bun'];
  if (combination.packageManager === 'npm') engines['npm'] = '>=12.2.2 <13';
  else engines['bun'] = '>=1.3.11 <1.4';
  manifest['engines'] = engines;

  devDependencies['typescript'] = TYPESCRIPT_VERSION[combination.typescriptMajor];

  if (combination.typescriptMajor === 6) {
    for (const [name, version] of Object.entries(TS6_LINT_DEV_DEPENDENCIES))
      devDependencies[name] = version;
    delete devDependencies['oxlint-tsgolint'];
    scripts['lint'] =
      `oxlint --deny-warnings --report-unused-disable-directives ${defaultLintTargets} && node node_modules/eslint/bin/eslint.js --max-warnings 0 ${defaultLintTargets}`;
  } else {
    delete devDependencies['eslint'];
    delete devDependencies['typescript-eslint'];
    if (!devDependencies['oxlint-tsgolint']) devDependencies['oxlint-tsgolint'] = '7.0.2007';
  }

  scripts['check:security'] =
    combination.packageManager === 'bun'
      ? 'bun audit --audit-level=low'
      : 'npm audit --audit-level=low';

  manifest['scripts'] = scripts;
  manifest['devDependencies'] = devDependencies;
  return manifest;
}

const combinationIdSchema = z.string();

export function parseTemplateDirectoryId(
  value: string,
  allowed: readonly TemplateCombination[],
): TemplateCombination {
  combinationIdSchema.parse(value);
  const match = allowed.find((entry) => templateDirectoryId(entry) === value);
  if (!match) throw new Error(`Unknown template combination directory: ${value}`);
  return match;
}

export function optionInputPaths(
  root: string,
  combination: TemplateCombination,
): readonly string[] {
  const paths: string[] = [];
  if (combination.packageManager === 'bun') paths.push('scaffold/options/bun/.githooks/pre-commit');
  if (combination.typescriptMajor === 6) {
    paths.push('scaffold/options/ts6/eslint.config.mjs', 'scaffold/options/ts6/.oxlintrc.json');
  }
  for (const path of paths) readFileSync(join(root, path));
  return paths;
}
