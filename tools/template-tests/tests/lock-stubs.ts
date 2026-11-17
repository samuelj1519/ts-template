import { transformManifest } from '../src/options.ts';
import type { JsonObject } from '../src/merge.ts';
import type { PackageManager, PresetId, TypeScriptMajor } from '../src/registry.ts';

function transformedManifest(
  manifest: JsonObject,
  preset: PresetId,
  packageManager: PackageManager,
  typescriptMajor: TypeScriptMajor,
): JsonObject {
  return transformManifest({ ...manifest }, { preset, packageManager, typescriptMajor });
}

export function npmLockStub(
  manifest: JsonObject,
  preset: PresetId,
  packageManager: PackageManager,
  typescriptMajor: TypeScriptMajor,
): JsonObject {
  const transformed = transformedManifest(manifest, preset, packageManager, typescriptMajor);
  return {
    name: transformed['name'],
    version: transformed['version'],
    lockfileVersion: 3,
    packages: {
      '': {
        name: transformed['name'],
        version: transformed['version'],
        license: transformed['license'],
        engines: transformed['engines'],
        dependencies: transformed['dependencies'] ?? {},
        devDependencies: transformed['devDependencies'] ?? {},
      },
    },
  } as JsonObject;
}

export function bunLockStub(
  manifest: JsonObject,
  preset: PresetId,
  packageManager: PackageManager,
  typescriptMajor: TypeScriptMajor,
): string {
  const transformed = transformedManifest(manifest, preset, packageManager, typescriptMajor);
  return JSON.stringify({
    workspaces: {
      '': {
        name: transformed['name'],
        dependencies: transformed['dependencies'] ?? {},
        devDependencies: transformed['devDependencies'] ?? {},
      },
    },
  });
}
