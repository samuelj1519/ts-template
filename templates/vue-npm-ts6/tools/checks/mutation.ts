import { readFileSync, realpathSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { z } from 'zod';

const mutationReport = z.object({
  files: z.record(
    z.string(),
    z.object({
      source: z.string(),
      mutants: z.array(z.object({ status: z.string() })),
    }),
  ),
});

export function validateMutations(input: unknown, root: string): void {
  const report = mutationReport.parse(input);
  const files = Object.entries(report.files);
  if (files.length === 0) throw new Error('Mutation testing requires measured source files.');
  let killed = 0;
  for (const [path, file] of files) {
    const source = realpathSync(resolve(root, path));
    if (
      !relative(realpathSync(root), source).startsWith(`src${sep}`) ||
      readFileSync(source, 'utf8') !== file.source
    ) {
      throw new Error('Mutation results do not match the current application source.');
    }
    for (const mutant of file.mutants) {
      if (mutant.status !== 'Killed')
        throw new Error(`Mutation did not fail its behavior test: ${mutant.status}`);
      killed += 1;
    }
  }
  if (killed === 0) throw new Error('Mutation testing did not execute any wrong implementations.');
}

if (import.meta.main) {
  validateMutations(
    JSON.parse(readFileSync('reports/mutation/mutation.json', 'utf8')),
    process.cwd(),
  );
  process.stdout.write('Mutation report: current source and executed behavior failures passed.\n');
}
