import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { enforceTs6Review, evaluateTs6Review, loadTs6Review } from './ts6-review.ts';

function writeReview(root: string, reviewBy: string): void {
  writeFileSync(join(root, 'ts6-review.json'), JSON.stringify({ reviewBy }) + '\n');
}

void test('ts6 review dates: before, equal, after and missing', () => {
  const reviewBy = new Date('2026-12-16T00:00:00Z');
  assert.equal(
    evaluateTs6Review(reviewBy, new Date('2026-12-15T23:59:59Z'), 'maintainer').status,
    'ok',
  );
  assert.equal(evaluateTs6Review(reviewBy, reviewBy, 'maintainer').status, 'expired');
  assert.equal(
    evaluateTs6Review(reviewBy, new Date('2026-12-17T00:00:00Z'), 'maintainer').status,
    'expired',
  );
  const root = mkdtempSync(join(tmpdir(), 'ts6-review-'));
  try {
    writeReview(root, '2026-12-16T00:00:00Z');
    assert.throws(() => enforceTs6Review(root, 'maintainer', new Date('2026-12-17T00:00:00Z')));
    enforceTs6Review(root, 'project', new Date('2026-12-17T00:00:00Z'));
    enforceTs6Review(root, 'maintainer', new Date('2026-11-16T00:00:00Z'));
    rmSync(join(root, 'ts6-review.json'));
    assert.throws(() => loadTs6Review(root), /Missing ts6-review.json/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
