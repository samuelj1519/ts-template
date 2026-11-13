import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { PresetId } from '../src/registry.ts';

type Result = {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly signal: string | null;
  readonly error?: Error;
};

type Npm = (args: readonly string[], cwd: string, label: string) => Result;

type Probe = {
  readonly name: string;
  readonly files: Readonly<Record<string, string>>;
  readonly expected: RegExp;
};

const feature = {
  'src/features/policy-a/index.ts': "export { readMessage } from './internal';\n",
  'src/features/policy-a/internal.ts':
    "export function readMessage(): string { return 'boundary'; }\n",
};

const architectureProbes: readonly Probe[] = [
  {
    name: 'private-import',
    files: {
      ...feature,
      'src/app/policy-probe.ts':
        "import { readMessage } from '../features/policy-a/internal'; export const result = readMessage();\n",
    },
    expected: /feature-policy-a-owns-internals/u,
  },
  {
    name: 'cross-feature-public-import',
    files: {
      ...feature,
      'src/features/policy-b/index.ts': "export { result } from './implementation';\n",
      'src/features/policy-b/implementation.ts':
        "import { readMessage } from '../policy-a'; export const result = readMessage();\n",
    },
    expected: /feature-policy-b-has-no-peers/u,
  },
  {
    name: 'automatically-discovered-feature',
    files: {
      ...feature,
      'src/features/policy-b/index.ts': "export { result } from './implementation';\n",
      'src/features/policy-b/implementation.ts': "export const result = 'boundary';\n",
      'src/app/policy-probe.ts':
        "import { result } from '../features/policy-b/implementation'; export const resultText = result;\n",
    },
    expected: /feature-policy-b-owns-internals/u,
  },
  {
    name: 'alias-private-import',
    files: {
      ...feature,
      'src/app/policy-probe.ts':
        "import { readMessage } from '@/features/policy-a/internal'; export const result = readMessage();\n",
    },
    expected: /feature-policy-a-owns-internals/u,
  },
  {
    name: 'private-re-export',
    files: {
      ...feature,
      'src/app/policy-probe.ts': "export { readMessage } from '../features/policy-a/internal';\n",
    },
    expected: /feature-policy-a-owns-internals/u,
  },
  {
    name: 'private-type-import',
    files: {
      ...feature,
      'src/features/policy-a/internal.ts':
        "export type Secret = { readonly message: string }; export function readMessage(): string { return 'boundary'; }\n",
      'src/app/policy-probe.ts':
        "import type { Secret } from '../features/policy-a/internal'; export const value: Secret = { message: 'boundary' };\n",
    },
    expected: /feature-policy-a-owns-internals/u,
  },
  {
    name: 'private-inline-type-import',
    files: {
      ...feature,
      'src/features/policy-a/internal.ts':
        "export type Secret = { readonly message: string }; export function readMessage(): string { return 'boundary'; }\n",
      'src/app/policy-probe.ts':
        "export type Secret = import('../features/policy-a/internal').Secret;\n",
    },
    expected: /import type declarations/u,
  },
  {
    name: 'private-nested-inline-type-import',
    files: {
      ...feature,
      'src/features/policy-a/internal.ts':
        "export type Secret = { readonly message: string }; export function readMessage(): string { return 'boundary'; }\n",
      'src/app/policy-probe.ts':
        "export type Envelope = { readonly item: { readonly secret: import('../features/policy-a/internal').Secret } };\n",
    },
    expected: /import type declarations/u,
  },
  {
    name: 'literal-dynamic-private-import',
    files: {
      ...feature,
      'src/app/policy-probe.ts':
        "export async function loadPrivate() { return import('../features/policy-a/internal'); }\n",
    },
    expected: /feature-policy-a-owns-internals/u,
  },
  {
    name: 'dependency-cycle',
    files: {
      'src/app/policy-cycle-a.ts':
        "import { second } from './policy-cycle-b'; export function first(): string { return second(); }\n",
      'src/app/policy-cycle-b.ts':
        "import { first } from './policy-cycle-a'; export function second(): string { return first(); }\n",
    },
    expected: /no-cycles/u,
  },
  {
    name: 'pure-model-react-import',
    files: {
      ...feature,
      'src/features/policy-a/model.ts':
        "import { useState } from 'react'; export function useValue() { return useState('boundary'); }\n",
    },
    expected: /pure-models/u,
  },
  {
    name: 'pure-model-bare-node-import',
    files: {
      ...feature,
      'src/features/policy-a/model.ts':
        "import { readFileSync } from 'fs'; export const readExample = readFileSync;\n",
    },
    expected: /pure-models-node-runtime/u,
  },
  {
    name: 'pure-model-prefixed-node-import',
    files: {
      ...feature,
      'src/features/policy-a/model.ts':
        "import { readFileSync } from 'node:fs'; export const readExample = readFileSync;\n",
    },
    expected: /pure-models-node-runtime/u,
  },
  {
    name: 'shared-imports-app',
    files: {
      'src/app/policy-probe.ts': "export const message = 'boundary';\n",
      'src/shared/policy-probe.ts':
        "import { message } from '../app/policy-probe'; export const value = message;\n",
    },
    expected: /shared-is-independent/u,
  },
  {
    name: 'nonliteral-dynamic-import',
    files: {
      'src/app/policy-probe.ts':
        'export async function loadModule(path: string) { return import(path); }\n',
    },
    expected: /dynamic|literal|source.policy/iu,
  },
  {
    name: 'javascript-nonliteral-dynamic-import',
    files: {
      'src/app/policy-probe.js':
        '/** @param {string} path */\nexport async function loadModule(path) { return import(path); }\n',
    },
    expected: /literal module path/u,
  },
  {
    name: 'mts-inline-type-import',
    files: {
      ...feature,
      'src/features/policy-a/internal.ts':
        "export type Secret = { readonly message: string }; export function readMessage(): string { return 'boundary'; }\n",
      'src/app/policy-probe.mts':
        "export type Secret = import('../features/policy-a/internal').Secret;\n",
    },
    expected: /import type declarations/u,
  },
  {
    name: 'mts-nested-inline-type-import',
    files: {
      ...feature,
      'src/features/policy-a/internal.ts':
        "export type Secret = { readonly message: string }; export function readMessage(): string { return 'boundary'; }\n",
      'src/app/policy-probe.mts':
        "export type Envelope = { readonly item: { readonly secret: import('../features/policy-a/internal').Secret } };\n",
    },
    expected: /import type declarations/u,
  },
  {
    name: 'runtime-imports-private-spec',
    files: {
      ...feature,
      'src/features/policy-a/private.spec.ts':
        "export function readTestMessage(): string { return 'boundary'; }\n",
      'src/app/policy-probe.ts':
        "import { readTestMessage } from '../features/policy-a/private.spec'; export const result = readTestMessage();\n",
    },
    expected: /runtime-does-not-import-tests/u,
  },
  {
    name: 'runtime-index-reexports-hidden-spec',
    files: {
      ...feature,
      'src/features/policy-a/index.ts': "export { readMessage } from './hidden.spec';\n",
      'src/features/policy-a/hidden.spec.ts':
        "export function readMessage(): string { return 'boundary'; }\n",
    },
    expected: /runtime-does-not-import-tests/u,
  },
];

const lintProbes: readonly Probe[] = [
  {
    name: 'floating-promise',
    files: {
      'src/app/policy-probe.ts':
        "export function ignorePromise(): void { Promise.resolve('boundary'); }\n",
    },
    expected: /no-floating-promises/u,
  },
  {
    name: 'unsafe-json-assignment',
    files: {
      'src/app/policy-probe.ts': 'export const message: string = JSON.parse(\'"boundary"\');\n',
    },
    expected: /no-unsafe-assignment/u,
  },
  {
    name: 'conditional-react-hook',
    files: {
      'src/app/PolicyProbe.tsx':
        "import { useState } from 'react'; export function ConditionalHook({ enabled }: { enabled: boolean }) { if (enabled) { const [value] = useState('boundary'); return <p>{value}</p>; } return <p>Disabled</p>; }\n",
    },
    expected: /rules-of-hooks/u,
  },
  {
    name: 'missing-effect-dependency',
    files: {
      'src/app/PolicyProbe.tsx':
        "import { useEffect } from 'react'; export function MissingDependency({ message }: { message: string }) { useEffect(() => { document.title = message; }, []); return <p>{message}</p>; }\n",
    },
    expected: /exhaustive-deps/u,
  },
  {
    name: 'unlabeled-button',
    files: {
      'src/app/PolicyProbe.tsx':
        'export function MissingLabel() { return <button type="button" />; }\n',
    },
    expected: /control-has-associated-label/u,
  },
  {
    name: 'pure-model-dom-global',
    files: {
      'src/features/policy-a/model.ts':
        'export function pageTitle(): string { return document.title; }\n',
    },
    expected: /no-restricted-globals/u,
  },
  {
    name: 'javascript-pure-model-dom-global',
    files: {
      'src/features/policy-a/model.js': 'export function pageTitle() { return document.title; }\n',
    },
    expected: /no-restricted-globals/u,
  },
  {
    name: 'javascript-pure-model-global-alias',
    files: {
      'src/features/policy-a/model.js':
        'export function pageTitle() { return globalThis.document.title; }\n',
    },
    expected: /no-restricted-globals/u,
  },
];

function installProbe(root: string, files: Readonly<Record<string, string>>): () => void {
  const created: string[] = [];
  for (const [path, source] of Object.entries(files)) {
    const absolute = join(root, path);
    assert.equal(
      existsSync(absolute),
      false,
      `A probe must not overwrite existing source: ${path}`,
    );
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, source);
    created.push(absolute);
  }
  return () => {
    for (const path of created) rmSync(path);
    for (const name of ['policy-a', 'policy-b']) {
      rmSync(join(root, 'src/features', name), { recursive: true, force: true });
    }
  };
}

function succeeds(result: Result, label: string): void {
  assert.equal(result.error, undefined, `${label}: ${String(result.error)}`);
  assert.equal(result.signal, null, `${label} must finish normally`);
  assert.equal(result.status, 0, `${label}\n${result.stdout}\n${result.stderr}`);
}

function rejects(result: Result, expected: RegExp, label: string, details = ''): void {
  assert.equal(result.error, undefined, `${label} must execute normally`);
  assert.equal(result.signal, null, `${label} must finish normally`);
  assert.ok(
    result.status !== null && result.status > 0,
    `${label} must reject its compilable violation`,
  );
  assert.match(
    result.stdout + result.stderr + details,
    expected,
    `${label} must name the intended rule`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function verifyPublicEntry(root: string, npm: Npm, preset: PresetId): void {
  const clean = installProbe(root, {
    ...feature,
    'src/features/policy-a/model.ts':
      'export function computeLength(value: string): number { return value.length; }\n',
    'src/features/policy-a/model.test.ts':
      "import { expect, it } from 'vitest'; import { computeLength } from './model'; it('measures text', () => { expect(computeLength('safe')).toBe(4); });\n",
    'src/app/policy-probe.ts':
      "import { readMessage } from '../features/policy-a'; export const result = readMessage();\n",
  });
  try {
    succeeds(
      npm(['run', 'typecheck'], root, 'positive-policy-typecheck'),
      'The public API control compiles',
    );
    succeeds(
      npm(['run', 'check:architecture'], root, 'positive-policy-architecture'),
      'The public API control passes architecture',
    );
    const graph = npm(
      [
        '--loglevel=error',
        'exec',
        '--offline',
        '--',
        'depcruise',
        '--config',
        '.dependency-cruiser.cjs',
        '--output-type',
        'json',
        'src',
      ],
      root,
      'positive-real-graph',
    );
    succeeds(graph, 'The graph tool produces a real JSON graph');
    const value: unknown = JSON.parse(graph.stdout);
    assert.ok(isRecord(value));
    assert.ok(Array.isArray(value['modules']));
    const modules: readonly unknown[] = value['modules'];
    const paths = modules.map((entry) => {
      assert.ok(isRecord(entry));
      assert.equal(typeof entry['source'], 'string');
      return entry['source'];
    });
    assert.ok(
      paths.includes(preset === 'react' ? 'src/app/App.tsx' : 'src/app/App.ts'),
      'The graph must contain the real application',
    );
    assert.ok(paths.includes('src/app/main.ts'), 'The graph must contain the real entry');
    assert.ok(
      paths.includes('src/features/text-preview/model.ts'),
      'The graph must contain the real example model',
    );
    assert.ok(
      paths.includes('src/features/policy-a/internal.ts'),
      'The graph must contain the actual control internals',
    );
    assert.ok(modules.length > 3, 'An empty graph cannot pass architecture');
  } finally {
    clean();
  }
}

export function verifyInheritedPolicies(root: string, npm: Npm, preset: PresetId): void {
  verifyPublicEntry(root, npm, preset);
  for (const probe of frameworkArchitectureProbes(preset)) {
    const clean = installProbe(root, probe.files);
    try {
      succeeds(
        npm(['run', 'typecheck'], root, `${probe.name}-typecheck`),
        `${probe.name} compiles`,
      );
      const report = join(root, 'artifacts/architecture.json');
      rmSync(report, { force: true });
      const result = npm(['run', 'check:architecture'], root, `${probe.name}-architecture`);
      rejects(
        result,
        probe.expected,
        probe.name,
        existsSync(report) ? readFileSync(report, 'utf8') : '',
      );
    } finally {
      clean();
    }
  }

  for (const probe of frameworkLintProbes(preset)) {
    const clean = installProbe(root, probe.files);
    try {
      succeeds(
        npm(['run', 'typecheck'], root, `${probe.name}-typecheck`),
        `${probe.name} compiles`,
      );
      rejects(npm(['run', 'lint'], root, `${probe.name}-lint`), probe.expected, probe.name);
    } finally {
      clean();
    }
  }
}

function frameworkArchitectureProbes(preset: PresetId): readonly Probe[] {
  if (preset === 'react') return architectureProbes;
  const common = architectureProbes.filter((probe) => probe.name !== 'pure-model-react-import');
  const imports =
    preset === 'vue'
      ? {
          ...feature,
          'src/features/policy-a/model.ts':
            "import { ref } from 'vue'; export function createValue() { return ref('boundary'); }\n",
        }
      : {
          ...feature,
          'src/features/policy-a/view.ts':
            "export function createView(): HTMLElement { return document.createElement('section'); }\n",
          'src/features/policy-a/model.ts':
            "import { createView } from './view'; export const create = createView;\n",
        };
  return [
    ...common,
    { name: preset + '-pure-model-runtime', files: imports, expected: /pure-models/u },
  ];
}

function frameworkLintProbes(preset: PresetId): readonly Probe[] {
  if (preset === 'react') return lintProbes;
  return lintProbes.filter((probe) => {
    if (['conditional-react-hook', 'missing-effect-dependency'].includes(probe.name)) return false;
    return probe.name !== 'unlabeled-button';
  });
}
