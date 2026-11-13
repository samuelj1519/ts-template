import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

type Result = {
  readonly status: number | null;
  readonly signal: string | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: Error;
};
type Npm = (args: readonly string[], cwd: string, label: string) => Result;

function succeeds(result: Result, label: string): void {
  assert.equal(result.error, undefined, `${label}: ${String(result.error)}`);
  assert.equal(result.signal, null, `${label} must finish normally`);
  assert.equal(result.status, 0, `${label}\n${result.stdout}\n${result.stderr}`);
}

function rejects(result: Result, expected: RegExp, label: string): void {
  assert.equal(result.error, undefined, `${label} must execute normally`);
  assert.equal(result.signal, null, `${label} must finish normally`);
  assert.ok(result.status !== null && result.status > 0, label);
  assert.match(
    stripVTControlCharacters(result.stdout + result.stderr),
    expected,
    `${label} must name the intended failure`,
  );
}

export function verifyWrongNormalization(root: string, npm: Npm): void {
  const model = join(root, 'src/features/text-preview/model.ts');
  const correct = readFileSync(model, 'utf8');
  const wrong = correct.replace(
    /const text = input\.trim\(\)\.replace\([^\n]+\);/u,
    'const text = input;',
  );
  assert.notEqual(wrong, correct, 'The negative control must change real model behavior');
  try {
    writeFileSync(model, wrong);
    succeeds(
      npm(['run', 'typecheck'], root, 'mutant-typecheck'),
      'The wrong implementation must still compile',
    );
    rejects(
      npm(['test', '--', 'src/features/text-preview/model.test.ts'], root, 'mutant-unit'),
      /AssertionError/u,
      'Behavior tests must reject the compilable defect',
    );
  } finally {
    writeFileSync(model, correct);
  }
}

export function verifyAccessibilityMutation(root: string, npm: Npm, proof: string): void {
  const main = join(root, 'src/app/main.ts');
  const probe = join(root, 'src/app/accessibility-probe.ts');
  const original = readFileSync(main, 'utf8');
  assert.equal(
    existsSync(probe),
    false,
    'The accessibility probe must not overwrite existing source',
  );
  try {
    writeFileSync(
      probe,
      "const button = document.createElement('button'); button.type = 'button'; document.body.append(button);\n",
    );
    writeFileSync(main, "import './accessibility-probe';\n" + original);
    succeeds(
      npm(['run', 'typecheck'], root, 'unlabeled-dom-typecheck'),
      'The unlabeled DOM implementation compiles',
    );
    const result = npm(['run', 'test:e2e'], root, 'unlabeled-dom-browser');
    mkdirSync(proof, { recursive: true });
    cpSync(join(root, 'artifacts/playwright'), proof, { recursive: true });
    rejects(
      result,
      /button-name/u,
      'Browser accessibility must reject an unnamed real DOM control',
    );
  } finally {
    writeFileSync(main, original);
    rmSync(probe, { force: true });
  }
}

export function verifyVueDerivedState(root: string, npm: Npm): void {
  const component = join(root, 'src/features/text-preview/TextPreview.ts');
  const original = readFileSync(component, 'utf8');
  const wrong = original.replace(
    /return \(\) => \{\s*const result = preview\.value;/u,
    'const result = preview.value;\n    return () => {',
  );
  assert.notEqual(
    wrong,
    original,
    'The Vue control must move derived state out of the render function',
  );
  try {
    writeFileSync(component, wrong);
    succeeds(
      npm(['run', 'typecheck'], root, 'vue-stale-state-typecheck'),
      'The stale Vue view still compiles',
    );
    const result = npm(
      ['test', '--', 'src/features/text-preview/TextPreview.test.ts'],
      root,
      'vue-stale-state-unit',
    );
    rejects(
      result,
      /Error: expect\(element\)\.toHaveTextContent\(\)/u,
      'Vue interaction tests must reject stale derived state',
    );
    assert.match(
      stripVTControlCharacters(result.stdout + result.stderr),
      /Expected element to have text content:\s+a b\s+Received:\s+Enter text to see a preview\./u,
    );
  } finally {
    writeFileSync(component, original);
  }
}

export function verifyUnsupportedSfc(root: string, npm: Npm): void {
  const source = join(root, 'src/app/UnsupportedPolicyProbe.vue');
  assert.equal(existsSync(source), false, 'The SFC probe must not overwrite existing source');
  try {
    writeFileSync(
      source,
      '<script setup lang="ts">const value: string = "example";</script><template><p>{{ value }}</p></template>\n',
    );
    rejects(
      npm(['run', 'check:architecture'], root, 'unsupported-sfc-source'),
      /Vue SFC sources need a separately verified/u,
      'Unsupported SFC files must not be silently ignored',
    );
  } finally {
    rmSync(source, { force: true });
  }
}

export function verifyVueValueTypes(root: string, npm: Npm): void {
  const source = join(root, 'src/features/text-preview/VueTypePolicyProbe.ts');
  assert.equal(existsSync(source), false, 'The Vue value probe must not overwrite existing source');
  const valid =
    "import { ref } from 'vue'; import { normalizePreview } from './model'; const source = ref('example'); export const result = normalizePreview(source.value);\n";
  try {
    writeFileSync(source, valid);
    succeeds(
      npm(['run', 'typecheck'], root, 'vue-valid-value-typecheck'),
      'The valid Vue ref value compiles',
    );
    const wrong = valid.replace("ref('example')", 'ref(123)');
    assert.notEqual(wrong, valid, 'The Vue type control must change the actual ref value type');
    writeFileSync(source, wrong);
    rejects(
      npm(['run', 'typecheck'], root, 'vue-invalid-value-typecheck'),
      /TS2345/u,
      'TypeScript must reject the incompatible Vue ref value',
    );
  } finally {
    rmSync(source, { force: true });
  }
}
