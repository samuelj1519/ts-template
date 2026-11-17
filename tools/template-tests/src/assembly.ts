import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';
import { z } from 'zod';
import {
  compareFiles,
  lstatIfPresent,
  readFiles,
  readGitVisibleFiles,
  realDirectory,
  rootExcluded,
  templatePayloadExcluded,
  sameEntry,
  validateDestination,
  writeFiles,
} from './files.ts';
import type { FileEntry, FileMap } from './files.ts';
import { canonicalJson, jsonFile, mergeObjects, parseObject } from './merge.ts';
import { withMaintainerRootScripts, withoutMaintainerRootScripts } from './root-scripts.ts';
import type { JsonObject } from './merge.ts';
import { authoritativeLockPath, templateDirectoryId, transformManifest } from './options.ts';
import { presetIdSchema, readRegistry } from './registry.ts';
import type { Preset, PresetId, TemplateCombination } from './registry.ts';

export type Composition = {
  readonly rootPreset: 'vanilla';
  readonly templates: readonly {
    readonly id: string;
    readonly combination: TemplateCombination;
    readonly files: FileMap;
  }[];
};
const packageSchema = z.object({
  name: z.literal('frontend-project'),
  version: z.string(),
  private: z.literal(true),
  license: z.literal('MIT'),
  scripts: z.record(z.string(), z.string()),
  dependencies: z.record(z.string(), z.string()),
  devDependencies: z.record(z.string(), z.string()),
});

function inputs(root: string, id: PresetId) {
  const common = readFiles(join(root, 'scaffold/common'));
  const overlay = readFiles(join(root, 'scaffold/presets', id));
  for (const path of [...common.keys(), ...overlay.keys()]) {
    if (path.split('/').some((part) => part === '.handoff')) {
      throw new Error(`Unapproved generation input: ${path}`);
    }
    if (
      path === 'package-lock.json' ||
      path === 'bun.lock' ||
      path
        .split('/')
        .some((_, index, parts) => rootExcluded(parts.slice(0, index + 1).join('/'))) ||
      path
        .split('/')
        .some(
          (part) =>
            part === '.git' ||
            part === '.aws' ||
            part === 'node_modules' ||
            part === '.private' ||
            /^\.env(?:\.|$)/u.test(part),
        )
    )
      throw new Error(`Unapproved generation input: ${path}`);
  }
  return { common, overlay };
}

function mergedPackage(common: FileMap, overlay: FileMap, preset: Preset): JsonObject {
  const base = common.get('package.json');
  if (!base) throw new Error('Common input requires package.json.');
  const fragment = overlay.get('package.json');
  const merged = fragment
    ? mergeObjects(parseObject(base.content), parseObject(fragment.content), 'package.json', preset)
    : parseObject(base.content);
  packageSchema.parse(merged);
  return merged;
}

export async function composePackage(
  root: string,
  combination: TemplateCombination,
): Promise<JsonObject> {
  const preset = readRegistry(root).presets.find((entry) => entry.id === combination.preset);
  if (!preset) throw new Error(`Unknown preset: ${combination.preset}`);
  const { common, overlay } = inputs(root, combination.preset);
  const manifest = transformManifest(mergedPackage(common, overlay, preset), combination);
  packageSchema.parse(manifest);
  return manifest;
}

async function applyOptionFiles(
  root: string,
  preset: Preset,
  combination: TemplateCombination,
  files: Map<string, FileEntry>,
): Promise<void> {
  if (combination.packageManager === 'bun') {
    const preCommit = readFileSync(join(root, 'scaffold/options/bun/.githooks/pre-commit'));
    files.set('.githooks/pre-commit', { content: preCommit, mode: 0o755 });
  }
  if (combination.typescriptMajor === 6) {
    files.set('eslint.config.mjs', {
      content: readFileSync(join(root, 'scaffold/options/ts6/eslint.config.mjs')),
      mode: 0o644,
    });
    const existing = files.get('.oxlintrc.json');
    if (!existing) throw new Error('Missing merged .oxlintrc.json before TS6 options apply.');
    const ts6Oxlint = parseObject(readFileSync(join(root, 'scaffold/options/ts6/.oxlintrc.json')));
    const mergedOxlint = mergeObjects(
      parseObject(existing.content),
      ts6Oxlint,
      '.oxlintrc.json',
      preset,
    );
    files.set('.oxlintrc.json', {
      content: await jsonFile(
        mergedOxlint,
        join(root, 'scaffold/common/package.json'),
        '.oxlintrc.json',
      ),
      mode: existing.mode,
    });
    files.delete('.oxlintrc.typed.json');
  } else {
    files.delete('eslint.config.mjs');
  }
  if (combination.typescriptMajor === 7) files.delete('ts6-review.json');
}

async function composeTemplate(
  root: string,
  preset: Preset,
  combination: TemplateCombination,
): Promise<FileMap> {
  const { common, overlay } = inputs(root, combination.preset);
  const files = new Map(common);
  const replaced = new Set<string>();
  for (const [path, entry] of overlay) {
    const base = common.get(path);
    if (!base) {
      files.set(path, entry);
      continue;
    }
    if (path === 'package.json' || path === '.oxlintrc.json') {
      const value = mergeObjects(
        parseObject(base.content),
        parseObject(entry.content),
        path,
        preset,
      );
      files.set(path, {
        content: await jsonFile(value, join(root, 'scaffold/common/package.json'), path),
        mode: base.mode,
      });
    } else if (preset.replaces.includes(path)) {
      files.set(path, entry);
      replaced.add(path);
    } else throw new Error(`Undeclared input collision in ${preset.id}: ${path}`);
  }
  if (preset.replaces.some((path) => !replaced.has(path)))
    throw new Error(`Unused file replacement in ${preset.id}.`);

  const manifest = transformManifest(mergedPackage(common, overlay, preset), combination);
  files.set('package.json', {
    content: await jsonFile(manifest, join(root, 'scaffold/common/package.json')),
    mode: 0o644,
  });

  await applyOptionFiles(root, preset, combination, files);

  const lockPath = authoritativeLockPath(combination);
  const lock = readFileSync(join(root, lockPath));
  if (combination.packageManager === 'npm') {
    validateNpmLock(parseObject(lock), manifest);
    files.set('package-lock.json', { content: lock, mode: 0o644 });
    files.delete('bun.lock');
  } else {
    validateBunLock(lock, manifest);
    files.set('bun.lock', { content: lock, mode: 0o644 });
    files.delete('package-lock.json');
  }

  return new Map([...files].sort(([left], [right]) => left.localeCompare(right)));
}

export function validateNpmLock(lock: JsonObject, manifest: JsonObject): void {
  const parsed = z
    .object({
      name: z.string(),
      version: z.string(),
      lockfileVersion: z.literal(3),
      packages: z.record(z.string(), z.record(z.string(), z.json())),
    })
    .parse(lock);
  const root = parsed.packages[''];
  if (!root || parsed.name !== manifest['name'] || parsed.version !== manifest['version'])
    throw new Error('Lock identity does not match its manifest.');
  for (const key of ['name', 'version', 'dependencies', 'devDependencies', 'engines', 'license']) {
    const empty = key === 'dependencies' || key === 'devDependencies' ? {} : undefined;
    if (canonicalJson(root[key] ?? empty) !== canonicalJson(manifest[key] ?? empty))
      throw new Error(`Lock root does not match manifest: ${key}`);
  }
}

export function validateBunLock(lock: Buffer, manifest: JsonObject): void {
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
    .safeParse(parseJsonc(lock.toString('utf8'), [], { allowTrailingComma: true }));
  if (!parsed.success) throw new Error('Bun lock must be JSON with a workspace root entry.');
  const root = parsed.data.workspaces[''];
  if (root.name !== manifest['name'])
    throw new Error('Bun lock identity does not match its manifest.');
  for (const key of ['dependencies', 'devDependencies'] as const) {
    const empty = {};
    if (canonicalJson(root[key] ?? empty) !== canonicalJson(manifest[key] ?? empty))
      throw new Error(`Bun lock root does not match manifest: ${key}`);
  }
}

export async function composeRepository(root: string): Promise<Composition> {
  const registry = readRegistry(root);
  const ids = registry.presets.map((preset) => preset.id);
  realDirectory(join(root, 'scaffold/presets'));
  if (
    readdirSync(join(root, 'scaffold/presets')).some(
      (name) => !ids.includes(presetIdSchema.parse(name)),
    )
  )
    throw new Error('Unexpected preset input directory.');
  const templates = [];
  for (const combination of registry.combinations) {
    const preset = registry.presets.find((entry) => entry.id === combination.preset);
    if (!preset) throw new Error(`Missing preset: ${combination.preset}`);
    templates.push({
      id: templateDirectoryId(combination),
      combination,
      files: await composeTemplate(root, preset, combination),
    });
  }
  return { rootPreset: registry.rootPreset, templates };
}

function selectFiles(
  files: FileMap,
  prefix = '',
  exclude: (path: string) => boolean = () => false,
): FileMap {
  const selected = new Map<string, FileEntry>();
  for (const [repositoryPath, entry] of files) {
    if (prefix && !repositoryPath.startsWith(`${prefix}/`)) continue;
    const path = prefix ? repositoryPath.slice(prefix.length + 1) : repositoryPath;
    const excluded = path
      .split('/')
      .some((_, index, parts) => exclude(parts.slice(0, index + 1).join('/')));
    if (!excluded) selected.set(path, entry);
  }
  return selected;
}

export async function checkTemplates(root: string): Promise<void> {
  const composition = await composeRepository(root);
  const current = readGitVisibleFiles(root);
  const output = join(root, 'templates');
  realDirectory(output);
  const expectedIds = new Set(composition.templates.map((entry) => entry.id));
  const actual = readdirSync(output);
  if (actual.length !== composition.templates.length)
    throw new Error('Complete template output directories differ.');
  if (actual.some((name) => !expectedIds.has(name)))
    throw new Error('Unknown generated output directory.');
  for (const template of composition.templates)
    compareFiles(
      current
        ? selectFiles(current, `templates/${template.id}`, templatePayloadExcluded)
        : readFiles(join(output, template.id), templatePayloadExcluded),
      template.files,
      `templates/${template.id}`,
    );
  const selected = composition.templates.find((entry) => entry.id === composition.rootPreset);
  if (!selected) throw new Error('Root preset is missing.');
  compareFiles(
    withoutMaintainerRootScripts(
      current ? selectFiles(current, '', rootExcluded) : readFiles(root, rootExcluded),
    ),
    selected.files,
    'Root bootstrap',
  );
}

function staleRootFiles(root: string, expected: FileMap): string[] {
  const previous = join(root, 'templates/vanilla');
  if (!existsSync(previous)) return [];
  const stale = [];
  for (const [path, entry] of readFiles(previous, templatePayloadExcluded)) {
    if (expected.has(path)) continue;
    const current = join(root, path);
    if (!lstatIfPresent(current)) continue;
    const found = readFiles(root, (name) => name !== path && !path.startsWith(`${name}/`)).get(
      path,
    );
    if (!found || !sameEntry(found, entry))
      throw new Error(`Refusing to remove a changed root file: ${path}`);
    stale.push(current);
  }
  return stale;
}

function rootComparableEntry(path: string, current: FileEntry): FileEntry {
  if (path !== 'package.json') return current;
  const normalized = withoutMaintainerRootScripts(new Map([['package.json', current]])).get(
    'package.json',
  );
  if (!normalized) throw new Error('Unable to normalize root package.json.');
  return normalized;
}

function validateRootOwnership(root: string, expected: FileMap): void {
  const directory = join(root, 'templates/vanilla');
  const previous = existsSync(directory)
    ? readFiles(directory, templatePayloadExcluded)
    : new Map<string, FileEntry>();
  for (const [path, entry] of expected) {
    if (!lstatIfPresent(join(root, path))) continue;
    const current = readFiles(root, (name) => name !== path && !path.startsWith(`${name}/`)).get(
      path,
    );
    if (!current) throw new Error(`Unable to inspect root output: ${path}`);
    if (sameEntry(current, entry)) continue;
    const comparable = rootComparableEntry(path, current);
    const owned = previous.get(path);
    if (owned && sameEntry(comparable, owned)) continue;
    if (sameEntry(comparable, entry)) continue;
    throw new Error(`Refusing to overwrite changed or unowned root file: ${path}`);
  }
}

export async function syncTemplates(root: string): Promise<void> {
  const composition = await composeRepository(root);
  const selected = composition.templates.find((entry) => entry.id === composition.rootPreset);
  if (!selected) throw new Error('Root preset is missing.');
  const stale = staleRootFiles(root, selected.files);
  const output = join(root, 'templates');
  const expectedIds = new Set(composition.templates.map((entry) => entry.id));
  if (lstatIfPresent(output)) {
    realDirectory(output);
    if (readdirSync(output).some((name) => !expectedIds.has(name)))
      throw new Error('Unknown generated output directory.');
  }
  validateDestination(root, selected.files);
  validateRootOwnership(root, selected.files);
  for (const template of composition.templates) {
    const destination = join(output, template.id);
    if (lstatIfPresent(destination)) readFiles(destination, templatePayloadExcluded);
  }
  const stage = mkdtempSync(join(tmpdir(), 'frontend-preset-stage-'));
  try {
    for (const template of composition.templates)
      writeFiles(join(stage, template.id), template.files);
    for (const path of stale) rmSync(path);
    const currentRoot = readFiles(root, (name) => name !== 'package.json');
    writeFiles(root, withMaintainerRootScripts(selected.files, currentRoot));
    mkdirSync(output, { recursive: true });
    for (const template of composition.templates) {
      const destination = join(output, template.id);
      rmSync(destination, { recursive: true, force: true });
      cpSync(join(stage, template.id), destination, { recursive: true, dereference: false });
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
