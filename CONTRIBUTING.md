# Maintain the frontend presets

The repository self-hosts the vanilla preset. Native TypeScript, React, and Vue projects share one authoritative engineering base and use framework-native components. Each committed `templates/<preset>/` directory is a complete standalone Giget input.

## Apply the development standard

Template maintenance adopts devnorm standard 1.0 draft at `4ade9ed101d946633759b95271f3d42b18e66868`. Its local entry is `../../devnorm/standard/README.md` (from the repository root, two levels up to `devnorm/standard/`). Read that exact version before governed work and stop affected operations if it is unavailable. Generated projects select their own standard and authorizations.

For nontrivial changes, follow the requirement, scope, implementation, independent-review, acceptance, and closure stages. Record decisions and evidence in the task or review record.

## Edit authoritative inputs

| Location                     | Ownership                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `scaffold/common/`           | Shared source, model assertions, styles, browser scenarios, checks, and generic guides.                |
| `scaffold/presets/<preset>/` | Native entry, UI, compiler options, build plugin, component tests, and framework dependency additions. |
| `scaffold/presets.json`      | The finite preset registry and explicit merge permissions.                                             |
| `scaffold/locks/<preset>/`   | Reviewed npm or Bun locks per package-manager and TypeScript major option.                             |
| `tools/template-tests/`      | Assembly, generation, privacy, safety, policy, and bootstrap contracts.                                |

Edit these inputs first. The root core and `templates/` payloads are generated mirrors. Do not hand-edit the twelve committed directories under `templates/`; change `scaffold/` (and related locks or generator code) and run `npm run templates:sync --prefix tools/template-tests`. Assembly rejects unknown registry fields, unsafe paths, source links, undeclared file collisions, and conflicting dependency versions. The root package remains exactly the vanilla package; maintainer commands live in the isolated test host.

Each root or payload has one ordinary manifest and lockfile. The three authoritative locks represent different generated projects.

## Synchronize and verify

Install the locked maintainer tools once:

```sh
npm ci --prefix tools/template-tests
```

After editing inputs:

```sh
npm run format:inputs --prefix tools/template-tests
npm run templates:sync --prefix tools/template-tests
npm ci
npm run check:milestone
npm run check --prefix tools/template-tests
```

When dependencies change, regenerate the mode locks through real npm before synchronization:

```sh
npm run templates:locks --prefix tools/template-tests
```

This command refreshes the locks using registry data. Select current stable releases, review advisory and peer compatibility, and retain the exact lock results.

For a read-only drift check:

```sh
npm run templates:check --prefix tools/template-tests
```

Recomposition compares every payload path, byte, and executable mode. Root parity compares the same complete vanilla core while excluding exact maintainer and output roots. Nested source directories named `reports` or `artifacts` remain checked. A sync refuses to delete a stale root file that no longer matches its previously generated value.

The contracts invoke the installed community Giget CLI against disposable committed sources. They preserve the existing privacy, parent-workspace, destination-safety and behavior protections for all presets, and run each generated project's actual checks. Use a fresh destination that is not a symbolic link.

## Review and publish

Shared contracts, manifests, mode locks, policy configuration, registry and materialized output each have one writer. Preserve original React assertions in the React preset and the shared pure-model/browser protections across every preset. Apply the same quality limits to every preset.

Have a new non-author reviewer execute critical paths and inspect the exact combined tree. Record versions, inputs, commands, exits, original failures, reruns and not run acceptance in existing records. Local static, browser, native, real-service and hosted checks remain separate evidence.

Normal commits describe one reviewable purpose in English and run hooks. Follow `AGENTS.md` for task authorization. After publication, verify the hosted Giget recipe against the published revision.
