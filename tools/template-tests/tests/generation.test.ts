/**
 * CI scheduling (simplified acceptance): `template.yml / contracts` runs this full suite on three
 * systems. Defaults use `defaults-full-cross` and `defaults-milestone`; all twelve payloads use
 * `twelve-check` with frozen install and `check`. This file stays the behavioral contract source;
 * `npm run test:static` stays cheap and excludes it.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { verifyInheritedPolicies } from './policy-probes.ts';
import { checkTemplates } from '../src/assembly.ts';
import { withoutMaintainerRootScripts } from '../src/root-scripts.ts';
import { templatePayloadExcluded, type FileEntry, type FileMap } from '../src/files.ts';
import {
  verifyAccessibilityMutation,
  verifyWrongNormalization,
  verifyVueDerivedState,
  verifyVueValueTypes,
  verifyUnsupportedSfc,
} from './runtime-probes.ts';
import type { PresetId } from '../src/registry.ts';

const host = fileURLToPath(new URL('..', import.meta.url));
const repository = resolve(host, '../..');
const payloadRoot = join(repository, 'templates');
const ids: PresetId[] = ['vanilla', 'react', 'vue'];
const generator = join(host, 'node_modules/giget/dist/cli.mjs');
const scratch = realpathSync.native(mkdtempSync(join(tmpdir(), 'ts-template-contracts-')));
const source = join(scratch, 'source');
const evidence = resolve(
  process.env['TEMPLATE_EVIDENCE_DIR'] ?? join(repository, 'artifacts/template-contracts'),
);
const emptyGitConfig = join(scratch, 'empty-gitconfig');
const ignoredDirectories = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  'artifacts',
  'reports',
  '.stryker-tmp',
  '.worktrees',
]);
const maintainerPaths = new Set(['CONTRIBUTING.md', '.github/workflows/template.yml']);
let commandNumber = 0;
const contracts: Promise<void>[] = [];

function environment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      key.startsWith('GIT_') ||
      key.startsWith('GIGET_') ||
      key === 'NODE_OPTIONS' ||
      key.startsWith('NODE_TEST_') ||
      key === 'NODE_V8_COVERAGE' ||
      key === 'VITEST' ||
      key === 'VITE_COVERAGE'
    ) {
      delete env[key];
    }
  }
  return {
    ...env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: emptyGitConfig,
    GIT_TERMINAL_PROMPT: '0',
    XDG_CACHE_HOME: join(scratch, 'cache'),
    npm_config_fund: 'false',
    npm_config_audit: 'false',
  };
}

function command(input: {
  executable: string;
  args: readonly string[];
  cwd: string;
  label: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
}) {
  const result = spawnSync(input.executable, input.args, {
    cwd: input.cwd,
    env: input.env ?? environment(),
    encoding: 'utf8',
    timeout: input.timeout ?? 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  commandNumber += 1;
  writeFileSync(
    join(evidence, `${String(commandNumber).padStart(3, '0')}-${input.label}.log`),
    [
      `cwd: ${input.cwd}`,
      `command: ${JSON.stringify([input.executable, ...input.args])}`,
      `exit: ${String(result.status)}`,
      `signal: ${String(result.signal)}`,
      `error: ${String(result.error ?? '')}`,
      result.stdout,
      result.stderr,
    ].join('\n'),
  );
  return result;
}

function succeeds(result: ReturnType<typeof command>, label: string): void {
  assert.equal(result.error, undefined, `${label}: ${String(result.error)}`);
  assert.equal(result.signal, null, `${label} must finish normally`);
  assert.equal(result.status, 0, `${label}\n${result.stdout}\n${result.stderr}`);
}

function refuses(
  result: ReturnType<typeof command>,
  label: string,
  expected = /already exists|EEXIST/u,
): void {
  assert.equal(result.error, undefined, `${label} must execute normally`);
  assert.equal(result.signal, null, `${label} must finish normally`);
  assert.ok(result.status !== null && result.status > 0, `${label} must fail`);
  assert.match(result.stdout + result.stderr, expected, `${label} must refuse the target`);
}

function git(args: readonly string[], cwd = source) {
  return command({ executable: 'git', args, cwd, label: 'git' });
}

function isMaintainerPath(path: string): boolean {
  return (
    maintainerPaths.has(path) ||
    path === '.handoff' ||
    path.startsWith('.handoff/') ||
    path === 'templates' ||
    path.startsWith('templates/') ||
    path === 'scaffold' ||
    path.startsWith('scaffold/') ||
    path === 'tools/template-tests' ||
    path.startsWith('tools/template-tests/')
  );
}

function files(
  root: string,
  excludeMaintainer = false,
  excludeOutputs = false,
): Map<string, Buffer> {
  const found = new Map<string, Buffer>();
  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      const path = relative(root, absolute).split(sep).join('/');
      if (templatePayloadExcluded(path)) continue;
      if (excludeOutputs && ignoredDirectories.has(path)) continue;
      if (excludeMaintainer && isMaintainerPath(path)) continue;
      assert.equal(entry.isSymbolicLink(), false, `Unexpected source link: ${path}`);
      if (entry.isDirectory()) visit(absolute);
      else {
        assert.equal(entry.isFile(), true, `Unexpected source entry: ${path}`);
        found.set(path, readFileSync(absolute));
      }
    }
  }
  visit(root);
  return new Map([...found].sort(([left], [right]) => left.localeCompare(right)));
}

function equalFiles(actual: Map<string, Buffer>, expected: Map<string, Buffer>): void {
  assert.deepEqual([...actual.keys()], [...expected.keys()], 'Complete file sets differ');
  for (const [path, bytes] of expected) {
    assert.deepEqual(actual.get(path), bytes, `File bytes differ: ${path}`);
  }
}

function asFileMap(files: Map<string, Buffer>): FileMap {
  return new Map(
    [...files].map(([path, content]): [string, FileEntry] => [path, { content, mode: 0o644 }]),
  );
}

function asByteMap(files: FileMap): Map<string, Buffer> {
  return new Map([...files].map(([path, entry]) => [path, entry.content]));
}

function jsonRecord(path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  assert.ok(isRecord(value), `${path} must contain a JSON object`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function npm(args: readonly string[], cwd: string, label: string) {
  const cli = process.env['TEMPLATE_NPM_CLI'] ?? process.env['npm_execpath'];
  assert.ok(cli !== undefined, 'Run through npm or set TEMPLATE_NPM_CLI to npm-cli.js');
  assert.equal(existsSync(cli), true, 'The npm CLI must exist');
  return command({
    executable: process.execPath,
    args: [cli, ...args],
    cwd,
    label,
    timeout: 300_000,
  });
}

before(() => {
  mkdirSync(evidence, { recursive: true });
  writeFileSync(emptyGitConfig, '');
  assert.equal(existsSync(payloadRoot), true, 'The generation payload must exist');
  assert.ok(files(payloadRoot).size > 0, 'The generation payload must not be empty');
  mkdirSync(source);
  cpSync(payloadRoot, join(source, 'templates'), {
    recursive: true,
    dereference: false,
    filter: (src) => {
      const rel = relative(payloadRoot, src).split(sep).join('/');
      return rel === '' || !templatePayloadExcluded(rel);
    },
  });
  for (const id of ids) mkdirSync(join(scratch, id));
  writeFileSync(join(source, 'SOURCE_ONLY_README.md'), 'Synthetic maintainer document\n');
  writeFileSync(join(source, '.env'), 'SYNTHETIC_PRIVATE_MARKER=fixture-only\n');
  mkdirSync(join(source, 'private'));
  writeFileSync(join(source, 'private', 'fixture.txt'), 'Synthetic private fixture\n');
  writeFileSync(join(source, 'CONTRIBUTING.md'), 'Synthetic template maintenance\n');
  mkdirSync(join(source, 'scaffold'));
  writeFileSync(join(source, 'scaffold/presets.json'), '{"synthetic":true}\n');
  mkdirSync(join(source, 'tools/template-tests'), { recursive: true });
  writeFileSync(join(source, 'tools/template-tests/fixture.txt'), 'Synthetic maintainer tool\n');
  mkdirSync(join(source, '.github/workflows'), { recursive: true });
  writeFileSync(
    join(source, '.github/workflows/template.yml'),
    'name: Synthetic maintainer workflow\n',
  );
  succeeds(git(['init', '-b', 'main']), 'Initialize synthetic source');
  succeeds(git(['add', '--all', '--force']), 'Stage synthetic source');
  succeeds(
    git([
      '-c',
      'user.name=Template tests',
      '-c',
      'user.email=template-tests@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-m',
      'test: create a synthetic generation source',
    ]),
    'Commit synthetic source',
  );
  writeFileSync(join(source, '.git/hooks/pre-commit'), '#!/bin/sh\nexit 79\n');
});

after(() => {
  rmSync(scratch, { recursive: true, force: true });
});

contracts.push(
  test('the repository bootstraps from every payload path and byte', async () => {
    await checkTemplates(repository);
    equalFiles(
      asByteMap(withoutMaintainerRootScripts(asFileMap(files(repository, true, true)))),
      files(join(payloadRoot, 'vanilla')),
    );
  }),
);

for (const id of ids) {
  const payload = join(payloadRoot, id);
  const profileScratch = join(scratch, id);
  function generate(destination: string, cwd = scratch) {
    return command({
      executable: process.execPath,
      args: [generator, `git:${source}#main:templates/${id}`, destination, '--no-registry'],
      cwd,
      label: id + '-generate',
    });
  }

  contracts.push(
    test(`${id}: the actual generator preserves all payload paths and bytes including hidden files`, () => {
      const destination = join(profileScratch, 'complete-project');
      succeeds(generate(destination), 'Generate a complete project');
      equalFiles(files(destination), files(payload));
      for (const path of ['.gitignore', '.github/workflows/ci.yml', 'AGENTS.md', 'LICENSE']) {
        assert.equal(existsSync(join(destination, path)), true, `Missing shared file: ${path}`);
      }
    }),
  );

  contracts.push(
    test(`${id}: two independent generations have identical complete contents`, () => {
      const first = join(profileScratch, 'independent-first');
      const second = join(profileScratch, 'independent-second');
      succeeds(generate(first), 'Generate the first project');
      succeeds(generate(second), 'Generate the second project');
      assert.notEqual(realpathSync(first), realpathSync(second));
      equalFiles(files(first), files(second));
    }),
  );

  contracts.push(
    test(`${id}: generation excludes source history, maintainer input and synthetic private data`, () => {
      const destination = join(profileScratch, 'private-boundary');
      succeeds(generate(destination), 'Generate without source internals');
      for (const path of [
        '.git',
        '.env',
        'private',
        'SOURCE_ONLY_README.md',
        'CONTRIBUTING.md',
        'template',
        'templates',
        'scaffold',
        'tools/template-tests',
        '.github/workflows/template.yml',
        'node_modules',
      ]) {
        assert.equal(existsSync(join(destination, path)), false, `Leaked source path: ${path}`);
      }
      const root = git(['rev-parse', '--show-toplevel'], destination);
      assert.notEqual(root.status, 0, 'Generation must not copy or initialize source history');
      const manifest = jsonRecord(join(destination, 'package.json'));
      assert.ok(isRecord(manifest['scripts']));
      for (const lifecycle of ['prepare', 'preinstall', 'install', 'postinstall']) {
        assert.equal(
          lifecycle in manifest['scripts'],
          false,
          `Unexpected install side effect: ${lifecycle}`,
        );
      }
    }),
  );

  contracts.push(
    test(`${id}: neutral package and lock identities agree and MIT is retained`, () => {
      const destination = join(profileScratch, 'lock-identity');
      succeeds(generate(destination), 'Generate a lock-consistent project');
      const manifest = jsonRecord(join(destination, 'package.json'));
      const lock = jsonRecord(join(destination, 'package-lock.json'));
      assert.equal(manifest['name'], 'frontend-project');
      assert.equal(manifest['private'], true);
      assert.equal(manifest['license'], 'MIT');
      assert.equal(lock['name'], manifest['name']);
      assert.ok(isRecord(lock['packages']));
      const lockRoot = lock['packages'][''];
      assert.ok(isRecord(lockRoot));
      assert.equal(lockRoot['name'], manifest['name']);
      assert.equal(lockRoot['version'], manifest['version']);
      assert.match(readFileSync(join(destination, 'LICENSE'), 'utf8'), /MIT License/u);
    }),
  );

  contracts.push(
    test(`${id}: a nonempty destination is refused without altering its sentinel`, () => {
      const destination = join(profileScratch, 'existing-project');
      mkdirSync(destination);
      writeFileSync(join(destination, 'sentinel.txt'), 'preserve existing data\n');
      const before = files(destination);
      const result = generate(destination);
      refuses(result, 'The generator must refuse a nonempty target');
      equalFiles(files(destination), before);
    }),
  );

  contracts.push(
    test(`${id}: generation cannot overwrite its own template input`, () => {
      const destination = join(source, 'templates', id);
      const before = files(destination);
      const result = generate(destination);
      refuses(result, 'The generator must refuse the existing input');
      equalFiles(files(destination), before);
    }),
  );

  contracts.push(
    test(`${id}: a live link to a nonempty target is refused and its target stays unchanged`, () => {
      const target = join(profileScratch, 'live-target');
      const destination = join(profileScratch, 'live-link');
      mkdirSync(target);
      writeFileSync(join(target, 'sentinel.txt'), 'preserve linked data\n');
      symlinkSync(target, destination, process.platform === 'win32' ? 'junction' : 'dir');
      const originalLink = readlinkSync(destination);
      const before = files(target);
      const result = generate(destination);
      refuses(result, 'A nonempty linked target must be refused');
      assert.equal(lstatSync(destination).isSymbolicLink(), true);
      assert.equal(readlinkSync(destination), originalLink);
      equalFiles(files(target), before);
    }),
  );

  contracts.push(
    test(`${id}: a dangling destination link is refused without creating its target`, () => {
      const target = join(profileScratch, 'missing-target');
      const destination = join(profileScratch, 'dangling-link');
      symlinkSync(target, destination, process.platform === 'win32' ? 'junction' : 'dir');
      const originalLink = readlinkSync(destination);
      const result = generate(destination);
      refuses(
        result,
        'A dangling linked target must be refused',
        /already exists|EEXIST|ENOENT:.*mkdir/u,
      );
      assert.equal(lstatSync(destination).isSymbolicLink(), true);
      assert.equal(readlinkSync(destination), originalLink);
      assert.equal(existsSync(target), false);
    }),
  );

  contracts.push(
    test(`${id}: generation in another workspace does not change the parent manifest or Git config`, () => {
      const parent = join(profileScratch, 'parent-workspace');
      mkdirSync(parent);
      const manifest = '{"name":"synthetic-parent","private":true,"workspaces":["packages/*"]}\n';
      writeFileSync(join(parent, 'package.json'), manifest);
      succeeds(git(['init', '-b', 'main'], parent), 'Initialize a synthetic parent');
      const gitConfig = readFileSync(join(parent, '.git/config'));
      const destination = join(parent, 'packages/generated');
      succeeds(generate(destination, parent), 'Generate in a parent workspace');
      assert.equal(readFileSync(join(parent, 'package.json'), 'utf8'), manifest);
      assert.deepEqual(readFileSync(join(parent, '.git/config')), gitConfig);
      assert.equal(existsSync(join(destination, '.git')), false);
      equalFiles(files(destination), files(payload));
    }),
  );

  contracts.push(
    test(`${id}: a generated project builds, passes real checks and rejects a compilable behavior defect`, () => {
      const destination = join(profileScratch, 'working-project');
      succeeds(generate(destination), 'Generate the runnable project');
      assert.ok(realpathSync(destination).startsWith(realpathSync(scratch) + sep));
      assert.equal(lstatSync(destination).isSymbolicLink(), false);
      const original = files(destination);
      succeeds(
        npm(['ci', '--no-audit', '--no-fund'], destination, 'generated-install'),
        'Install generated dependencies',
      );
      assert.equal(lstatSync(join(destination, 'node_modules')).isSymbolicLink(), false);
      succeeds(
        npm(['run', 'check'], destination, 'generated-check'),
        'Run the generated check command',
      );
      const manifest = jsonRecord(join(destination, 'package.json'));
      assert.ok(isRecord(manifest['scripts']));
      const testCommand = 'test:unit' in manifest['scripts'] ? ['run', 'test:unit'] : ['test'];
      succeeds(npm(testCommand, destination, 'generated-unit'), 'Run generated unit tests');
      succeeds(
        npm(['run', 'build'], destination, 'generated-build'),
        'Build the generated application',
      );
      assert.equal(
        existsSync(join(destination, 'dist/index.html')),
        true,
        'The built app must exist',
      );
      const policy = npm(['run', 'test:policy'], destination, 'generated-policy');
      succeeds(policy, 'Run the generated policy tests');
      const policyOutput = stripVTControlCharacters(policy.stdout + policy.stderr);
      assert.doesNotMatch(policyOutput, /being called recursively|skipping running files/iu);
      const policyTests = /^(?:#|ℹ)\s+tests ([1-9]\d*)\s*$/mu.exec(policyOutput);
      const policyPassed = /^(?:#|ℹ)\s+pass ([1-9]\d*)\s*$/mu.exec(policyOutput);
      assert.ok(policyTests, 'Generated policy tests must report a nonzero test count.');
      assert.ok(policyPassed, 'Generated policy tests must report actual passing tests.');
      const policyCount = Number(policyTests[1]);
      assert.ok(Number.isSafeInteger(policyCount) && policyCount > 0);
      assert.equal(
        Number(policyPassed[1]),
        policyCount,
        'All reported policy tests must execute and pass.',
      );
      succeeds(
        npm(['run', 'check:milestone'], destination, 'generated-milestone'),
        'Run the complete generated milestone',
      );
      equalFiles(files(destination, false, true), original);
      verifyWrongNormalization(destination, npm);
      equalFiles(files(destination, false, true), original);
      verifyInheritedPolicies(destination, npm, id);
      equalFiles(files(destination, false, true), original);
      verifyAccessibilityMutation(destination, npm, join(evidence, id + '-unnamed-control'));
      verifyUnsupportedSfc(destination, npm);
      if (id === 'vue') {
        verifyVueDerivedState(destination, npm);
        verifyVueValueTypes(destination, npm);
      }
      equalFiles(files(destination, false, true), original);
    }),
  );
}

contracts.push(
  test('bootstrap scanning detects nested features named like root output directories', () => {
    const root = join(scratch, 'nested-output-root');
    const input = join(scratch, 'nested-output-payload');
    mkdirSync(root);
    mkdirSync(input);
    for (const path of [root, input]) writeFileSync(join(path, 'README.md'), 'Synthetic core\n');
    mkdirSync(join(root, 'reports'));
    writeFileSync(join(root, 'reports', 'run.log'), 'Synthetic runtime output\n');
    equalFiles(files(root, true, true), files(input));

    const feature = join(root, 'src/features/reports');
    mkdirSync(feature, { recursive: true });
    writeFileSync(join(feature, 'index.ts'), "export { title } from './model';\n");
    writeFileSync(join(feature, 'model.ts'), "export const title = 'Synthetic feature';\n");
    assert.throws(
      () => equalFiles(files(root, true, true), files(input)),
      /Complete file sets differ/u,
      'A root-only feature must not disappear behind an output-directory name',
    );
  }),
);

contracts.push(
  test('the installed generator is the exact version declared by its lockfile', () => {
    const manifest = jsonRecord(join(host, 'package.json'));
    assert.ok(isRecord(manifest['devDependencies']));
    assert.equal(manifest['devDependencies']['giget'], '3.3.1');
    const installed = jsonRecord(join(dirname(generator), '../package.json'));
    assert.equal(installed['version'], '3.3.1');
    const lock = jsonRecord(join(host, 'package-lock.json'));
    assert.ok(isRecord(lock['packages']));
    const entry = lock['packages']['node_modules/giget'];
    assert.ok(isRecord(entry));
    assert.equal(entry['version'], '3.3.1');
  }),
);

await Promise.all(contracts);
