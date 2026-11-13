# Template contracts

This isolated package maintains the shared engineering inputs and tests all three complete generation payloads. It is excluded from generated projects.

```sh
npm ci
npm run templates:check
npm run check
```

## Synchronize the inputs

`scaffold/common/` owns shared files. `scaffold/presets/vanilla/`, `react/`, and `vue/` own their framework files and dependency fragments. `scaffold/presets.json` declares the supported presets and exact replacements. Each authoritative npm lock lives in `scaffold/locks/<preset>.json`.

After editing the inputs, run:

```sh
npm run format:inputs
npm run templates:sync
npm run templates:check
```

When dependencies change, run `npm run templates:locks` before synchronization. This explicit command uses fresh staging directories and the real npm CLI with `--package-lock-only` and disabled lifecycle scripts. It needs authorized registry access. It validates every completed lock before writing the three authoritative files. Run lock updates explicitly before synchronization.

The composer rejects unsafe paths, source links, unknown registry fields, undeclared file collisions, conflicting package versions and scripts, mismatched locks, and unused replacement declarations. Package objects merge recursively; Oxlint plugins are combined. Only explicitly declared supported rule-option replacements may alter an existing rule, and their severity remains an error. JSON output uses the shared Prettier configuration. Ordinary files and npm locks retain their exact bytes.

`templates:sync` prepares all complete payloads before writing the generated `templates/` directories and the vanilla repository core. Root file removal is limited to unchanged files owned by the previous vanilla payload. It preserves other root files; `templates:check` reports any unexpected core drift. Output exclusions use complete root-relative paths, so a feature named `reports` remains source.

Existing root files must match either their previous managed content or the newly composed result. A new output path cannot replace different unowned content. Protected maintainer and runtime paths cannot be supplied as generation input. A rejected ownership or path check happens before the root and preset outputs are written.

## Exercise the generated projects

The tests invoke the pinned Giget CLI against a synthetic committed Git repository. For each preset they compare every generated path and byte, compare two independent generations, test destination refusal, and check package/lock identity, MIT, private-input exclusion, Git and hook boundaries, and parent-workspace preservation.

Each generated workspace receives fresh physical dependencies and runs its public check, tests, production build and complete milestone. The wrong normalization implementation must still compile and fail the unchanged model assertions. Every preset supplies a real nonempty graph control and compilable violations of ownership, aliases, re-exports, type imports, dynamic imports, cycles, Node built-ins, test-source imports and pure-model boundaries.

React retains its original Hooks and accessibility lint controls. All presets exercise unsafe values, floating promises and DOM access from pure models. Vue checks its framework dependency boundary and rejects a stale derived view through real interaction assertions. An actual unnamed DOM button is injected into each application's entry; the wrong implementation compiles, then the built-browser accessibility test must reject `button-name`. All modified source bytes are restored and compared.

Generate into a new destination under a trusted parent, with no symbolic links in the destination path.

## Environment and evidence

Use the pinned Node and npm versions. The CLI requires Git. Set `TEMPLATE_NPM_CLI` to an absolute npm CLI JavaScript path when using a task-local npm installation; otherwise the invoking npm process supplies it. Set `PLAYWRIGHT_BROWSERS_PATH` only when the matching browser is installed in a dedicated location.

This package owns its dependency lock and runs formatting, strict typed lint and strict TypeScript. Command, exit, signal and output evidence is retained in `artifacts/template-contracts/`, outside disposable fixture source and build directories. Override `TEMPLATE_EVIDENCE_DIR` when the task provides another evidence location. Lock-generation logs use `artifacts/template-locks/`.
