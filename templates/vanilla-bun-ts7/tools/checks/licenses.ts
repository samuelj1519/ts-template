import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const project = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1),
    license: z.literal('MIT'),
    dependencies: z.record(z.string(), z.string()),
  })
  .parse(JSON.parse(readFileSync('package.json', 'utf8')));
if (!readFileSync('LICENSE', 'utf8').startsWith('MIT License\n')) {
  throw new Error('The project license must match the declared MIT license.');
}

const cli = resolve('node_modules/license-checker-rseidelsohn/bin/license-checker-rseidelsohn.js');
const result = spawnSync(
  process.execPath,
  [
    cli,
    '--production',
    '--excludePackages',
    `${project.name}@${project.version}`,
    '--onlyAllow',
    'MIT;ISC;BSD-2-Clause;BSD-3-Clause;Apache-2.0',
    '--json',
  ],
  { encoding: 'utf8' },
);
if (result.error) throw result.error;
if (result.status !== 0)
  throw new Error(`Dependency license checks failed: ${result.stderr}\n${result.stdout}`);
const report = z
  .record(z.string(), z.object({ licenses: z.union([z.string(), z.array(z.string())]) }))
  .parse(JSON.parse(result.stdout));
for (const name of Object.keys(project.dependencies)) {
  if (!Object.keys(report).some((key) => key.startsWith(`${name}@`))) {
    throw new Error(`The license report omitted the production dependency ${name}.`);
  }
}
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/dependency-licenses.json', JSON.stringify(report, null, 2) + '\n');
process.stdout.write(
  'Licenses: project MIT notice and complete production dependency report passed.\n',
);
