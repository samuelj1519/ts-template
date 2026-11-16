import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { templateDirectoryId } from './options.ts';
import { validPath } from './files.ts';

export const presetIdSchema = z.enum(['vanilla', 'react', 'vue']);
export type PresetId = z.infer<typeof presetIdSchema>;
export const packageManagerSchema = z.enum(['npm', 'bun']);
export type PackageManager = z.infer<typeof packageManagerSchema>;
export const typescriptMajorSchema = z.union([z.literal(7), z.literal(6)]);
export type TypeScriptMajor = z.infer<typeof typescriptMajorSchema>;

const pathSchema = z.string().refine(validPath, 'Expected a safe, canonical relative path.');
const presetSchema = z.strictObject({
  id: presetIdSchema,
  replaces: z.array(pathSchema),
  ruleOverrides: z.array(z.literal('jsx-a11y/label-has-associated-control')).default([]),
});
const forbiddenSchema = z.strictObject({
  preset: presetIdSchema,
  packageManager: packageManagerSchema,
  typescriptMajor: typescriptMajorSchema,
});
const optionsSchema = z.strictObject({
  packageManagers: z.array(packageManagerSchema).length(2),
  typescriptMajors: z.array(typescriptMajorSchema).length(2),
  forbidden: z.array(forbiddenSchema).default([]),
});
const registrySchema = z.strictObject({
  rootPreset: z.literal('vanilla'),
  presets: z.array(presetSchema).length(3),
  options: optionsSchema,
});
export type Preset = z.infer<typeof presetSchema>;
export type TemplateCombination = {
  readonly preset: PresetId;
  readonly packageManager: PackageManager;
  readonly typescriptMajor: TypeScriptMajor;
};
export type Registry = z.infer<typeof registrySchema> & {
  readonly combinations: readonly TemplateCombination[];
  readonly templateIds: readonly string[];
};

function isForbidden(
  combination: TemplateCombination,
  forbidden: z.infer<typeof forbiddenSchema>[],
): boolean {
  return forbidden.some(
    (entry) =>
      entry.preset === combination.preset &&
      entry.packageManager === combination.packageManager &&
      entry.typescriptMajor === combination.typescriptMajor,
  );
}

export function enumerateCombinations(
  registry: z.infer<typeof registrySchema>,
): TemplateCombination[] {
  const combinations: TemplateCombination[] = [];
  for (const preset of registry.presets) {
    for (const packageManager of registry.options.packageManagers) {
      for (const typescriptMajor of registry.options.typescriptMajors) {
        const combination = { preset: preset.id, packageManager, typescriptMajor };
        if (isForbidden(combination, registry.options.forbidden)) continue;
        combinations.push(combination);
      }
    }
  }
  if (combinations.length !== 12)
    throw new Error(`Expected exactly 12 template combinations, found ${combinations.length}.`);
  const ids = new Set(combinations.map((entry) => templateDirectoryId(entry)));
  if (ids.size !== 12) throw new Error('Template combination directory names must be unique.');
  return combinations;
}

export function readRegistry(root: string): Registry {
  const registry = registrySchema.parse(
    JSON.parse(readFileSync(join(root, 'scaffold/presets.json'), 'utf8')),
  );
  if (new Set(registry.presets.map((preset) => preset.id)).size !== 3)
    throw new Error('Declare each supported preset exactly once.');
  for (const preset of registry.presets) {
    if (
      new Set(preset.replaces).size !== preset.replaces.length ||
      new Set(preset.ruleOverrides).size !== preset.ruleOverrides.length
    )
      throw new Error(`Duplicate replacement declaration: ${preset.id}`);
    if (
      preset.replaces.some((path) =>
        ['package.json', '.oxlintrc.json', 'package-lock.json', 'bun.lock'].includes(path),
      )
    )
      throw new Error('JSON merge and lock files cannot use whole-file replacement.');
  }
  const combinations = enumerateCombinations(registry);
  const templateIds = combinations.map((combination) => templateDirectoryId(combination));
  return { ...registry, combinations, templateIds };
}

export function parseCombinationInput(
  registry: Registry,
  input: { preset: string; packageManager: string; typescriptMajor: number },
): TemplateCombination {
  const preset = presetIdSchema.parse(input.preset);
  const packageManager = packageManagerSchema.parse(input.packageManager);
  const typescriptMajor = typescriptMajorSchema.parse(input.typescriptMajor);
  const combination = registry.combinations.find(
    (entry) =>
      entry.preset === preset &&
      entry.packageManager === packageManager &&
      entry.typescriptMajor === typescriptMajor,
  );
  if (!combination) throw new Error(`Forbidden or unknown combination: ${JSON.stringify(input)}`);
  return combination;
}
