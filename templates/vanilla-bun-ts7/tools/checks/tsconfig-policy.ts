import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parse, type ParseError } from 'jsonc-parser';

const forbiddenCompilerOptionNames = new Set([
  'downlevelIteration',
  'baseUrl',
  'outFile',
  'ignoreDeprecations',
  'importsNotUsedAsValues',
  'preserveValueImports',
  'noStrictGenericChecks',
  'noImplicitUseStrict',
  'keyofStringsOnly',
  'suppressExcessPropertyErrors',
  'suppressImplicitAnyIndexErrors',
  'charset',
  'prepend',
]);

const allowedCompilerOptionNames = new Set([
  'target',
  'lib',
  'module',
  'moduleResolution',
  'types',
  'noEmit',
  'allowImportingTsExtensions',
  'allowJs',
  'checkJs',
  'verbatimModuleSyntax',
  'isolatedModules',
  'moduleDetection',
  'resolveJsonModule',
  'strict',
  'noUncheckedIndexedAccess',
  'exactOptionalPropertyTypes',
  'noImplicitOverride',
  'noImplicitReturns',
  'noFallthroughCasesInSwitch',
  'noPropertyAccessFromIndexSignature',
  'noUnusedLocals',
  'noUnusedParameters',
  'allowUnreachableCode',
  'allowUnusedLabels',
  'skipLibCheck',
  'paths',
  'jsx',
  'jsxImportSource',
  'useDefineForClassFields',
  'noUncheckedSideEffectImports',
  'libReplacement',
  'rootDir',
  'stableTypeOrdering',
  'esModuleInterop',
  'allowSyntheticDefaultImports',
  'alwaysStrict',
]);

const allowedRootKeys = new Set([
  'compilerOptions',
  'include',
  'exclude',
  'extends',
  'references',
  'files',
]);

const forbiddenModules = new Set(['amd', 'umd', 'system', 'systemjs', 'none']);
const forbiddenResolutions = new Set(['node', 'node10', 'classic']);

type JsonObject = Record<string, unknown>;

function parseJsonc(path: string): JsonObject {
  const text = readFileSync(path, 'utf8');
  const errors: ParseError[] = [];
  const value: unknown = parse(text, errors, { allowTrailingComma: true, disallowComments: false });
  if (errors.length > 0) {
    const first = errors[0];
    if (!first) throw new Error(`Invalid JSONC in ${path}.`);
    throw new Error(`Invalid JSONC in ${path} at offset ${first.offset}: ${first.error}`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be a JSON object.`);
  }
  return value as JsonObject;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function assertAllowedOptionName(path: string, key: string): void {
  if (!allowedCompilerOptionNames.has(key)) {
    throw new Error(
      `${path}: compilerOptions.${key} is not allowed for shared TypeScript 6/7 policy.`,
    );
  }
  if (forbiddenCompilerOptionNames.has(key)) {
    throw new Error(`${path}: compilerOptions.${key} is deprecated and must not appear.`);
  }
}

function checkTarget(path: string, value: unknown): void {
  const target = stringValue(value)?.toLowerCase();
  if (target === 'es3' || target === 'es5') {
    throw new Error(`${path}: compilerOptions.target must not be es3 or es5.`);
  }
}

function checkModuleResolution(path: string, value: unknown): void {
  const resolution = stringValue(value)?.toLowerCase();
  if (resolution && forbiddenResolutions.has(resolution)) {
    throw new Error(
      `${path}: compilerOptions.moduleResolution must not be ${JSON.stringify(value)}.`,
    );
  }
}

function checkModule(path: string, value: unknown): void {
  const module = stringValue(value)?.toLowerCase();
  if (module && forbiddenModules.has(module)) {
    throw new Error(`${path}: compilerOptions.module must not be ${JSON.stringify(value)}.`);
  }
}

function checkBooleanFlags(path: string, key: string, value: unknown): void {
  if (
    (key === 'esModuleInterop' ||
      key === 'allowSyntheticDefaultImports' ||
      key === 'alwaysStrict' ||
      key === 'stableTypeOrdering') &&
    value === false
  ) {
    throw new Error(`${path}: compilerOptions.${key} must not be false.`);
  }
}

function checkCompilerOption(path: string, key: string, value: unknown): void {
  assertAllowedOptionName(path, key);
  if (key === 'target') checkTarget(path, value);
  if (key === 'moduleResolution') checkModuleResolution(path, value);
  if (key === 'module') checkModule(path, value);
  checkBooleanFlags(path, key, value);
}

function validateCompilerOptions(path: string, options: unknown): void {
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw new Error(`${path}: compilerOptions must be an object.`);
  }
  for (const [key, value] of Object.entries(options)) checkCompilerOption(path, key, value);
}

function referencePath(entry: unknown): string | undefined {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return undefined;
  return stringValue((entry as JsonObject)['path']);
}

function validateReferences(path: string, references: unknown): void {
  if (!Array.isArray(references)) throw new Error(`${path}: references must be an array.`);
  for (const entry of references) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`${path}: each references entry must be an object.`);
    }
    const refPath = referencePath(entry);
    if (!refPath) throw new Error(`${path}: each references entry needs a string path.`);
  }
}

function resolveReferences(
  path: string,
  references: unknown,
  visited: Set<string>,
  load: (path: string) => JsonObject,
): void {
  if (!Array.isArray(references)) return;
  for (const entry of references) {
    const refPath = referencePath(entry);
    if (!refPath) continue;
    const reference = resolve(dirname(path), refPath);
    if (!existsSync(reference)) throw new Error(`${path}: missing references target ${refPath}.`);
    resolveConfigChain(reference, visited, load);
  }
}

function validateConfigObject(path: string, config: JsonObject): void {
  for (const key of Object.keys(config)) {
    if (!allowedRootKeys.has(key)) throw new Error(`${path}: unknown root key "${key}".`);
  }
  if (config['compilerOptions'] !== undefined) {
    validateCompilerOptions(path, config['compilerOptions']);
  }
  if (config['references'] !== undefined) validateReferences(path, config['references']);
}

function extendsEntries(value: unknown): unknown[] {
  if (value === undefined) return [];
  if (typeof value === 'string' || Array.isArray(value))
    return typeof value === 'string' ? [value] : value;
  throw new Error('tsconfig extends must be a string or an array of strings.');
}

function resolveConfigChain(
  path: string,
  visited: Set<string>,
  load: (path: string) => JsonObject,
): void {
  const canonical = resolve(path);
  if (visited.has(canonical)) throw new Error(`Circular tsconfig chain at ${path}.`);
  visited.add(canonical);
  try {
    const config = load(path);
    validateConfigObject(path, config);
    for (const entry of extendsEntries(config['extends'])) {
      const parent = stringValue(entry);
      if (!parent) throw new Error(`${path}: each extends entry needs a string path.`);
      const base = parent.startsWith('.') ? resolve(dirname(path), parent) : parent;
      if (!existsSync(base))
        throw new Error(`${path}: could not resolve extends target ${parent}.`);
      resolveConfigChain(base, visited, load);
    }
    resolveReferences(path, config['references'], visited, load);
  } finally {
    visited.delete(canonical);
  }
}

export function validateTsConfigPolicy(projectRoot: string, entry = 'tsconfig.json'): void {
  const entryPath = join(projectRoot, entry);
  if (!existsSync(entryPath)) throw new Error(`Missing ${entry} for tsconfig policy checks.`);
  resolveConfigChain(entryPath, new Set(), parseJsonc);
}
