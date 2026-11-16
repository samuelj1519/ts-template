import type { FileMap } from './files.ts';

/** Root-only maintainer scripts tolerated when comparing the repository to template payloads. */
export const maintainerRootScriptKeys = ['templates:verify'] as const;

export type MaintainerRootScriptKey = (typeof maintainerRootScriptKeys)[number];

export function withoutMaintainerRootScripts(files: FileMap): FileMap {
  const entry = files.get('package.json');
  if (!entry) return files;
  const manifest = JSON.parse(entry.content.toString('utf8')) as {
    scripts?: Record<string, string>;
  };
  const scripts = { ...manifest.scripts };
  for (const key of maintainerRootScriptKeys) delete scripts[key];
  const normalized = Buffer.from(JSON.stringify({ ...manifest, scripts }, null, 2) + '\n', 'utf8');
  const clone = new Map(files);
  clone.set('package.json', { content: normalized, mode: entry.mode });
  return clone;
}
