import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

/** Canonical TypeScript 6 type-aware ESLint rules (plan item 5). */
export const TS6_TYPE_AWARE_RULE_NAMES = [
  '@typescript-eslint/no-floating-promises',
  '@typescript-eslint/no-misused-promises',
  '@typescript-eslint/no-unsafe-assignment',
  '@typescript-eslint/no-unsafe-argument',
  '@typescript-eslint/no-unsafe-call',
  '@typescript-eslint/no-unsafe-member-access',
  '@typescript-eslint/no-unsafe-return',
  '@typescript-eslint/switch-exhaustiveness-check',
  '@typescript-eslint/await-thenable',
  '@typescript-eslint/no-array-delete',
  '@typescript-eslint/no-base-to-string',
  '@typescript-eslint/no-duplicate-type-constituents',
  '@typescript-eslint/no-for-in-array',
  '@typescript-eslint/no-implied-eval',
  '@typescript-eslint/no-meaningless-void-operator',
  '@typescript-eslint/no-misused-spread',
  '@typescript-eslint/no-redundant-type-constituents',
  '@typescript-eslint/no-unsafe-unary-minus',
  '@typescript-eslint/no-useless-default-assignment',
  '@typescript-eslint/require-array-sort-compare',
  '@typescript-eslint/restrict-template-expressions',
  '@typescript-eslint/unbound-method',
] as const;

function ruleIsEnabled(severity: unknown): boolean {
  if (severity === 'error' || severity === 2) return true;
  if (!Array.isArray(severity)) return false;
  return severity[0] === 'error' || severity[0] === 2;
}

function collectEnabledRules(config: unknown): Set<string> {
  const names = new Set<string>();
  const blocks = Array.isArray(config) ? config : [config];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const rules = (block as { rules?: Record<string, unknown> }).rules;
    if (!rules) continue;
    for (const [name, severity] of Object.entries(rules)) {
      if (ruleIsEnabled(severity)) names.add(name);
    }
  }
  return names;
}

export async function validateTs6TypeAwareRules(projectRoot: string): Promise<void> {
  const configPath = join(projectRoot, 'eslint.config.mjs');
  const module = (await import(pathToFileURL(configPath).href)) as {
    default: unknown;
  };
  const enabled = collectEnabledRules(module.default);
  const expected = [...TS6_TYPE_AWARE_RULE_NAMES];
  if (enabled.size !== expected.length) {
    throw new Error(
      `TypeScript 6 eslint.config.mjs must enable exactly ${expected.length} type-aware rules; found ${enabled.size}.`,
    );
  }
  const missing = expected.filter((name) => !enabled.has(name));
  const extra = [...enabled].filter(
    (name) => name.startsWith('@typescript-eslint/') && !expected.includes(name as never),
  );
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `TypeScript 6 type-aware rule set mismatch. Missing: ${missing.join(', ') || 'none'}. Unexpected: ${extra.join(', ') || 'none'}.`,
    );
  }
}
