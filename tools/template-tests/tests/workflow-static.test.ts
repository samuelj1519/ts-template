import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readRegistry } from '../src/registry.ts';

const repository = fileURLToPath(new URL('../../..', import.meta.url));
const workflow = readFileSync(join(repository, '.github/workflows/template.yml'), 'utf8');

void test('template workflow defines required contract jobs', () => {
  for (const job of [
    'static:',
    'contracts:',
    'options-full:',
    'defaults-full:',
    'compatibility-review:',
    'defaults-milestone:',
    'bun-risk-full:',
  ]) {
    assert.match(workflow, new RegExp(`\\n  ${job.replace(':', '\\:')}`));
  }
});

void test('static enumerate step uses sorted twelve-way comparison', () => {
  assert.doesNotMatch(workflow, /test \\"\\$\{/u);
  assert.match(workflow, /registry\.templateIds\]\.sort\(\)/u);
  const expected = [...readRegistry(repository).templateIds].sort();
  const actual = readdirSync(join(repository, 'templates')).sort();
  assert.equal(expected.length, 12);
  assert.deepEqual(expected, actual);
});

void test('bun-risk-full does not run npm ci in bun template', () => {
  const section = workflow.slice(workflow.indexOf('bun-risk-full:'));
  const gBlock = section.slice(0, section.indexOf('defaults-milestone:'));
  assert.doesNotMatch(gBlock, /npm ci/);
  assert.match(gBlock, /bun install --frozen-lockfile/u);
});
