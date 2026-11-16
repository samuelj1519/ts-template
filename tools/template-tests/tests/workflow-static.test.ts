import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readRegistry } from '../src/registry.ts';

const repository = fileURLToPath(new URL('../../..', import.meta.url));
const workflow = readFileSync(join(repository, '.github/workflows/template.yml'), 'utf8');

const REQUIRED_JOBS = [
  'static:',
  'contracts:',
  'twelve-check:',
  'defaults-full-cross:',
  'defaults-milestone:',
  'npm-audit-advisory:',
] as const;

const REMOVED_JOBS = [
  'pairwise-static:',
  'options-full:',
  'defaults-full:',
  'bun-risk-full:',
  'compatibility-review:',
] as const;

void test('template workflow defines simplified acceptance jobs', () => {
  for (const job of REQUIRED_JOBS) {
    assert.match(workflow, new RegExp(`\\n  ${job.replace(':', '\\:')}`));
  }
  for (const job of REMOVED_JOBS) {
    assert.doesNotMatch(workflow, new RegExp(`\\n  ${job.replace(':', '\\:')}`));
  }
});

void test('twelve-check matrix lists every template directory once', () => {
  const block = workflow.slice(
    workflow.indexOf('twelve-check:'),
    workflow.indexOf('defaults-full-cross:'),
  );
  const expected = [...readRegistry(repository).templateIds].sort();
  const matrix = block.slice(block.indexOf('template:'), block.indexOf('runs-on:'));
  for (const id of expected) {
    assert.match(matrix, new RegExp(`- ${id}\\b`));
  }
  assert.equal((matrix.match(/^\s+- [a-z]/gm) ?? []).length, 12);
});

void test('defaults-full-cross only targets macOS and Windows default presets', () => {
  const block = workflow.slice(
    workflow.indexOf('defaults-full-cross:'),
    workflow.indexOf('defaults-milestone:'),
  );
  assert.match(block, /os: \[macos-latest, windows-latest\]/);
  assert.match(block, /template: \[vanilla, react, vue\]/);
  assert.match(block, /npm run check:full/);
});

void test('defaults-milestone matrix lists the three default presets', () => {
  const block = workflow.slice(
    workflow.indexOf('defaults-milestone:'),
    workflow.indexOf('npm-audit-advisory:'),
  );
  assert.match(block, /template: \[vanilla, react, vue\]/);
  assert.match(block, /npm run check:milestone/);
});

void test('npm-audit-advisory handles error JSON without blocking the workflow', () => {
  const block = workflow.slice(workflow.indexOf('npm-audit-advisory:'));
  assert.match(block, /continue-on-error: true/);
  assert.match(block, /payload\.error/);
  assert.match(block, /process\.exit\(2\)/);
});

void test('twelve-check bun templates do not run npm ci', () => {
  const block = workflow.slice(
    workflow.indexOf('twelve-check:'),
    workflow.indexOf('defaults-full-cross:'),
  );
  const step =
    block.match(/- name: Frozen install and check[\s\S]*?(?=\n  [a-z-]+:)/u)?.[0] ?? block;
  const bunBranch = step.split(/\n\s*else\b/u)[0] ?? '';
  assert.match(bunBranch, /-bun-\*/u);
  assert.match(bunBranch, /bun install --frozen-lockfile/u);
  assert.doesNotMatch(bunBranch, /npm ci/u);
});

void test('static enumerate step uses sorted twelve-way comparison', () => {
  assert.doesNotMatch(workflow, /test \\"\\$\{/u);
  assert.match(workflow, /registry\.templateIds\]\.sort\(\)/u);
  const expected = [...readRegistry(repository).templateIds].sort();
  const actual = readdirSync(join(repository, 'templates')).sort();
  assert.equal(expected.length, 12);
  assert.deepEqual(expected, actual);
});
