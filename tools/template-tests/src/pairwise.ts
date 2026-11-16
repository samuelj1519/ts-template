import type { PresetId, PackageManager, TypeScriptMajor } from './registry.ts';

export type PairwiseRowId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export type PairwiseScheduleRow = {
  readonly id: PairwiseRowId;
  readonly preset: PresetId;
  readonly packageManager: PackageManager;
  readonly typescriptMajor: TypeScriptMajor;
  readonly note: string;
};

/** Installed combinations for maintainer `check:full` scheduling (plan 6.2). */
export const PAIRWISE_FULL_SCHEDULE = [
  {
    id: 'A',
    preset: 'vanilla',
    packageManager: 'npm',
    typescriptMajor: 7,
    note: 'Default baseline',
  },
  {
    id: 'B',
    preset: 'vanilla',
    packageManager: 'bun',
    typescriptMajor: 6,
    note: 'Bun install tree with TS 6 split lint',
  },
  {
    id: 'C',
    preset: 'react',
    packageManager: 'npm',
    typescriptMajor: 6,
    note: 'React types and TS 6 lint',
  },
  {
    id: 'D',
    preset: 'react',
    packageManager: 'bun',
    typescriptMajor: 7,
    note: 'Bun with TS 7 type-aware tooling',
  },
  {
    id: 'E',
    preset: 'vue',
    packageManager: 'npm',
    typescriptMajor: 6,
    note: 'Vue typing risk with TS 6',
  },
  {
    id: 'F',
    preset: 'vue',
    packageManager: 'bun',
    typescriptMajor: 7,
    note: 'Vue dependency graph on Bun',
  },
  {
    id: 'G',
    preset: 'vue',
    packageManager: 'bun',
    typescriptMajor: 6,
    note: 'Fixed risk row; not inferred from pairwise coverage',
  },
] as const satisfies readonly PairwiseScheduleRow[];

const CORE_PAIRWISE_ROWS = PAIRWISE_FULL_SCHEDULE.filter((row) => row.id !== 'G');

type PairBucket = 'presetManager' | 'presetTs' | 'managerTs';

function bucketKey(bucket: PairBucket, parts: readonly string[]): string {
  return `${bucket}:${parts.join('/')}`;
}

function collectPairs(rows: readonly PairwiseScheduleRow[]): Set<string> {
  const covered = new Set<string>();
  for (const row of rows) {
    covered.add(bucketKey('presetManager', [row.preset, row.packageManager]));
    covered.add(bucketKey('presetTs', [row.preset, `ts${row.typescriptMajor}`]));
    covered.add(bucketKey('managerTs', [row.packageManager, `ts${row.typescriptMajor}`]));
  }
  return covered;
}

function expectedPairs(): Set<string> {
  const expected = new Set<string>();
  for (const preset of ['vanilla', 'react', 'vue'] as const) {
    for (const packageManager of ['npm', 'bun'] as const) {
      expected.add(bucketKey('presetManager', [preset, packageManager]));
    }
    for (const typescriptMajor of [7, 6] as const) {
      expected.add(bucketKey('presetTs', [preset, `ts${typescriptMajor}`]));
    }
  }
  for (const packageManager of ['npm', 'bun'] as const) {
    for (const typescriptMajor of [7, 6] as const) {
      expected.add(bucketKey('managerTs', [packageManager, `ts${typescriptMajor}`]));
    }
  }
  return expected;
}

/** Throws when A–F no longer cover all sixteen preset/manager/TS value pairs. */
export function assertSixteenPairwisePairs(
  rows: readonly PairwiseScheduleRow[] = CORE_PAIRWISE_ROWS,
): void {
  const covered = collectPairs(rows);
  const expected = expectedPairs();
  const missing = [...expected].filter((key) => !covered.has(key));
  if (missing.length > 0) {
    throw new Error(
      `Pairwise schedule must cover sixteen value pairs; missing: ${missing.sort().join(', ')}`,
    );
  }
  if (covered.size !== 16) {
    throw new Error(`Expected exactly sixteen covered pairs, found ${covered.size}.`);
  }
}

export function pairwiseTemplatePath(row: PairwiseScheduleRow): string {
  if (row.packageManager === 'npm' && row.typescriptMajor === 7) return row.preset;
  return `${row.preset}-${row.packageManager}-ts${row.typescriptMajor}`;
}
