import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { checkSources } from './source-policy.ts';

const graphSchema = z.object({
  modules: z.array(z.object({ source: z.string(), dependencies: z.array(z.unknown()) })).min(1),
  summary: z.object({ error: z.number().int().nonnegative() }),
});

export function validateGraph(input: unknown): void {
  const graph = graphSchema.parse(input);
  if (!graph.modules.some((module) => /^src\/.+\.(ts|tsx)$/u.test(module.source))) {
    throw new Error('Architecture analysis did not inspect the application TypeScript source.');
  }
  if (graph.summary.error !== 0)
    throw new Error('Fix the dependency violations in artifacts/architecture.json.');
}

if (import.meta.main) {
  checkSources(process.cwd());
  const cli = resolve('node_modules/dependency-cruiser/bin/dependency-cruiser.mjs');
  const result = spawnSync(
    process.execPath,
    [cli, '--config', '.dependency-cruiser.cjs', '--output-type', 'json', 'src'],
    {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/architecture.json', result.stdout);
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Dependency checks failed: ${result.stderr}\n${result.stdout}`);
  validateGraph(JSON.parse(result.stdout));
  process.stdout.write('Architecture: resolved TypeScript graph and source policy passed.\n');
}
