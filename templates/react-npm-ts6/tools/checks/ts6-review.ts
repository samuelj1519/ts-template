import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const reviewSchema = z.object({
  reviewBy: z.string().datetime({ offset: true }),
});

export type Ts6ReviewMode = 'project' | 'maintainer';

export type Ts6ReviewResult =
  | { readonly status: 'ok'; readonly reviewBy: Date }
  | { readonly status: 'warning'; readonly reviewBy: Date; readonly message: string }
  | { readonly status: 'expired'; readonly reviewBy: Date; readonly message: string };

const warningLink =
  'https://github.com/samuelj1519/ts-template/blob/main/.handoff/%E9%80%89%E9%A1%B9%E6%96%B9%E6%A1%88.md';

export function loadTs6Review(
  projectRoot: string,
  fileName = 'ts6-review.json',
): { readonly reviewBy: Date } {
  const path = join(projectRoot, fileName);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      `Missing ${fileName}: TypeScript 6 support must record an explicit reviewBy date instead of an open-ended commitment.`,
    );
  }
  const parsed = reviewSchema.safeParse(JSON.parse(raw));
  if (!parsed.success)
    throw new Error(
      `${fileName} must contain a UTC reviewBy timestamp (for example "2026-12-16T00:00:00Z").`,
    );
  return { reviewBy: new Date(parsed.data.reviewBy) };
}

export function evaluateTs6Review(reviewBy: Date, now: Date, mode: Ts6ReviewMode): Ts6ReviewResult {
  if (Number.isNaN(reviewBy.getTime()))
    throw new Error('reviewBy is not a valid instant for TypeScript 6 compatibility review.');
  const expired = now.getTime() >= reviewBy.getTime();
  const message = expired
    ? `TypeScript 6 compatibility review expired at ${reviewBy.toISOString()}. See ${warningLink} before extending support.`
    : `TypeScript 6 compatibility is temporary until ${reviewBy.toISOString()}. Plan the exit review: ${warningLink}`;
  if (expired) {
    return { status: 'expired', reviewBy, message };
  }
  if (mode === 'project') return { status: 'warning', reviewBy, message };
  return { status: 'ok', reviewBy };
}

export function runTs6Review(
  projectRoot: string,
  mode: Ts6ReviewMode,
  now: Date = new Date(),
): Ts6ReviewResult {
  const { reviewBy } = loadTs6Review(projectRoot);
  return evaluateTs6Review(reviewBy, now, mode);
}

export function enforceTs6Review(
  projectRoot: string,
  mode: Ts6ReviewMode,
  now: Date = new Date(),
): void {
  const outcome = runTs6Review(projectRoot, mode, now);
  if (outcome.status === 'warning') {
    process.stderr.write(`TS6 review: ${outcome.message}\n`);
    return;
  }
  if (outcome.status === 'expired') throw new Error(outcome.message);
}
