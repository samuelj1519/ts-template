import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { realDirectory, validPath } from './files.ts';

export const presetIdSchema = z.enum(['vanilla', 'react', 'vue']);
export type PresetId = z.infer<typeof presetIdSchema>;
const pathSchema = z.string().refine(validPath, 'Expected a safe, canonical relative path.');
const presetSchema = z.strictObject({
  id: presetIdSchema,
  replaces: z.array(pathSchema),
  ruleOverrides: z.array(z.literal('jsx-a11y/label-has-associated-control')).default([]),
});
const registrySchema = z.strictObject({
  rootPreset: z.literal('vanilla'),
  presets: z.array(presetSchema).length(3),
});
export type Preset = z.infer<typeof presetSchema>;
export type Registry = z.infer<typeof registrySchema>;

export function readRegistry(root: string): Registry {
  realDirectory(join(root, 'scaffold'));
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
        ['package.json', '.oxlintrc.json', 'package-lock.json'].includes(path),
      )
    )
      throw new Error('JSON merge and lock files cannot use whole-file replacement.');
  }
  return registry;
}
