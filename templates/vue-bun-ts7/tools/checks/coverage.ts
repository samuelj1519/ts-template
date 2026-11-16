import { globSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { coverageSources, coverageExclusions, coverageThresholds } from '../../quality.config.ts';

const counter = z
  .object({
    total: z.number().int().nonnegative(),
    covered: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    pct: z.number(),
  })
  .refine(
    (value) => value.covered <= value.total && value.skipped <= value.total,
    'Coverage counters cannot exceed the measured total.',
  );
const summary = z.object({
  lines: counter,
  functions: counter,
  statements: counter,
  branches: counter,
});
const reportSchema = z.record(z.string(), summary);
const metrics = [
  'lines',
  'functions',
  'statements',
  'branches',
] satisfies (keyof typeof coverageThresholds)[];

export function validateCoverage(input: unknown, expectedFiles: string[]): void {
  const report = reportSchema.parse(input);
  const total = report['total'];
  if (!total || expectedFiles.length === 0)
    throw new Error('Coverage requires nonempty source and counters.');
  const measured = Object.keys(report)
    .filter((name) => name !== 'total')
    .map((name) => realpathSync.native(name))
    .sort();
  const expected = expectedFiles.map((name) => realpathSync.native(name)).sort();
  if (JSON.stringify(measured) !== JSON.stringify(expected))
    throw new Error(
      `Coverage contains missing or unrelated source files. Expected ${JSON.stringify(expected)}; measured ${JSON.stringify(measured)}.`,
    );
  for (const metric of metrics) {
    const sum = Object.entries(report)
      .filter(([name]) => name !== 'total')
      .reduce(
        (value, [, file]) => ({
          total: value.total + file[metric].total,
          covered: value.covered + file[metric].covered,
        }),
        { total: 0, covered: 0 },
      );
    if (sum.total < 1 || sum.total !== total[metric].total || sum.covered !== total[metric].covered)
      throw new Error(`Invalid ${metric} coverage totals.`);
    if (BigInt(sum.covered) * 100n < BigInt(sum.total) * BigInt(coverageThresholds[metric]))
      throw new Error(`${metric} coverage decreased below its policy.`);
  }
}

if (import.meta.main) {
  const files = globSync(coverageSources, { exclude: coverageExclusions }).map((path) =>
    resolve(path),
  );
  validateCoverage(JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8')), files);
  process.stdout.write('Coverage: exact source set and nonempty counters passed.\n');
}
