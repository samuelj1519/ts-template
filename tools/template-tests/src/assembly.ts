import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import {
  compareFiles,
  lstatIfPresent,
  readFiles,
  realDirectory,
  rootExcluded,
  sameEntry,
  validateDestination,
  writeFiles,
} from './files.ts';
import type { FileEntry, FileMap } from './files.ts';
import { canonicalJson, jsonFile, mergeObjects, parseObject } from './merge.ts';
import type { JsonObject } from './merge.ts';
import { presetIdSchema, readRegistry } from './registry.ts';
import type { Preset, PresetId } from './registry.ts';

export type Composition = {
  readonly rootPreset: 'vanilla';
  readonly presets: readonly { readonly id: PresetId; readonly files: FileMap }[];
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
    if (
      path === 'package-lock.json' ||
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

export async function composePackage(root: string, id: PresetId): Promise<JsonObject> {
  const preset = readRegistry(root).presets.find((entry) => entry.id === id);
  if (!preset) throw new Error(`Unknown preset: ${id}`);
  const { common, overlay } = inputs(root, id);
  return mergedPackage(common, overlay, preset);
}

async function composePreset(root: string, preset: Preset): Promise<FileMap> {
  const { common, overlay } = inputs(root, preset.id);
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
  const manifest = mergedPackage(common, overlay, preset);
  files.set('package.json', {
    content: await jsonFile(manifest, join(root, 'scaffold/common/package.json')),
    mode: 0o644,
  });
  const locks = readFiles(join(root, 'scaffold/locks'));
  const lock = locks.get(`${preset.id}.json`);
  if (!lock) throw new Error(`Missing authoritative lock for ${preset.id}.`);
  validateLock(parseObject(lock.content), manifest);
  files.set('package-lock.json', lock);
  return new Map([...files].sort(([left], [right]) => left.localeCompare(right)));
}

export function validateLock(lock: JsonObject, manifest: JsonObject): void {
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
  const presets = [];
  for (const preset of registry.presets)
    presets.push({ id: preset.id, files: await composePreset(root, preset) });
  return { rootPreset: registry.rootPreset, presets };
}

export async function checkTemplates(root: string): Promise<void> {
  const composition = await composeRepository(root);
  const output = join(root, 'templates');
  realDirectory(output);
  if (readdirSync(output).length !== composition.presets.length)
    throw new Error('Complete preset output directories differ.');
  for (const preset of composition.presets)
    compareFiles(readFiles(join(output, preset.id)), preset.files, `templates/${preset.id}`);
  const selected = composition.presets.find((preset) => preset.id === composition.rootPreset);
  if (!selected) throw new Error('Root preset is missing.');
  compareFiles(readFiles(root, rootExcluded), selected.files, 'Root bootstrap');
}

function staleRootFiles(root: string, expected: FileMap): string[] {
  const previous = join(root, 'templates/vanilla');
  if (!existsSync(previous)) return [];
  const stale = [];
  for (const [path, entry] of readFiles(previous)) {
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

function validateRootOwnership(root: string, expected: FileMap): void {
  const directory = join(root, 'templates/vanilla');
  const previous = existsSync(directory) ? readFiles(directory) : new Map<string, FileEntry>();
  for (const [path, entry] of expected) {
    if (!lstatIfPresent(join(root, path))) continue;
    const current = readFiles(root, (name) => name !== path && !path.startsWith(`${name}/`)).get(
      path,
    );
    if (!current) throw new Error(`Unable to inspect root output: ${path}`);
    if (sameEntry(current, entry)) continue;
    const owned = previous.get(path);
    if (!owned || !sameEntry(current, owned))
      throw new Error(`Refusing to overwrite changed or unowned root file: ${path}`);
  }
}

export async function syncTemplates(root: string): Promise<void> {
  const composition = await composeRepository(root);
  const selected = composition.presets.find((preset) => preset.id === composition.rootPreset);
  if (!selected) throw new Error('Root preset is missing.');
  const stale = staleRootFiles(root, selected.files);
  const output = join(root, 'templates');
  if (lstatIfPresent(output)) {
    realDirectory(output);
    if (
      readdirSync(output).some((name) => !composition.presets.some((preset) => preset.id === name))
    )
      throw new Error('Unknown generated output directory.');
  }
  validateDestination(root, selected.files);
  validateRootOwnership(root, selected.files);
  for (const preset of composition.presets) {
    const destination = join(output, preset.id);
    if (lstatIfPresent(destination)) readFiles(destination);
  }
  const stage = mkdtempSync(join(tmpdir(), 'frontend-preset-stage-'));
  try {
    for (const preset of composition.presets) writeFiles(join(stage, preset.id), preset.files);
    for (const path of stale) rmSync(path);
    writeFiles(root, selected.files);
    mkdirSync(output, { recursive: true });
    for (const preset of composition.presets) {
      const destination = join(output, preset.id);
      rmSync(destination, { recursive: true, force: true });
      cpSync(join(stage, preset.id), destination, { recursive: true, dereference: false });
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
