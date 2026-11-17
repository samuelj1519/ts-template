# Toolchain reference

The template uses npm scripts and Node.js tooling. Each tool has a distinct job.

## Pinned releases

These direct tool selections were checked against stable release data on 2026-11-13. Common tools are shared across presets. Framework-specific rows apply only to the selected preset; its manifest and lockfile define the exact installed graph.

| Tool                                                     | Release     | Responsibility                                                     |
| -------------------------------------------------------- | ----------- | ------------------------------------------------------------------ |
| Node.js                                                  | 26.13.1 LTS | Runtime for package scripts and TypeScript tooling.                |
| npm                                                      | 12.2.2      | Locked dependency installation and script execution.               |
| giget                                                    | 3.3.1       | Copy a template subdirectory from a Git source.                    |
| TypeScript                                               | 7.0.2       | Strict compiler checks.                                            |
| React and React DOM                                      | 19.3.1      | Application rendering and component state.                         |
| Vite                                                     | 8.3.8       | Development server and production build.                           |
| Vue                                                      | 3.5.45      | Vue preset runtime with Composition API.                           |
| @vue/test-utils                                          | 2.5.1       | Vue preset component mounting and lifecycle tests.                 |
| @vitejs/plugin-react                                     | 6.3.0       | React integration with Vite.                                       |
| Oxlint                                                   | 1.93.0      | JavaScript, TypeScript, React, and accessibility rules.            |
| oxlint-tsgolint                                          | 7.0.2007    | Type-aware lint rules.                                             |
| Prettier                                                 | 3.10.1      | Source and document formatting.                                    |
| dependency-cruiser                                       | 18.7.2      | Resolved import-graph constraints.                                 |
| @swc/core                                                | 1.16.22     | Explicit TypeScript graph parsing and source-policy syntax checks. |
| Zod                                                      | 4.6.7       | Runtime validation of architecture and coverage reports.           |
| Vitest and @vitest/coverage-v8                           | 5.1.0       | Unit and component tests with V8 coverage.                         |
| jsdom                                                    | 31.0.1      | Component-test DOM environment.                                    |
| @testing-library/dom                                     | 10.4.2      | DOM testing queries and utilities.                                 |
| @testing-library/react                                   | 16.3.3      | React component tests.                                             |
| @testing-library/jest-dom                                | 7.0.1       | DOM assertions.                                                    |
| @testing-library/user-event                              | 14.6.10     | Component-test user interactions.                                  |
| @playwright/test                                         | 1.65.0      | Production-browser interaction tests.                              |
| @axe-core/playwright                                     | 4.14.0      | Automated browser accessibility checks.                            |
| @types/node                                              | 26.6.6      | Node.js types.                                                     |
| @types/react and @types/react-dom                        | 19.3.0      | React types.                                                       |
| cspell                                                   | 10.4.1      | Spelling checks.                                                   |
| Knip                                                     | 6.45.1      | Unused files, exports, and dependencies.                           |
| jscpd                                                    | 5.4.3       | Duplicate-source measurement.                                      |
| @stryker-mutator/core and @stryker-mutator/vitest-runner | 10.1.1      | Mutation testing with Vitest.                                      |
| license-checker-rseidelsohn                              | 5.0.1       | Production dependency license inventory and policy checks.         |
| minimatch                                                | 11.0.8      | Security override for transitive path matching.                    |
| glob                                                     | 14.0.6      | Security override for transitive file matching.                    |
| qs                                                       | 6.17.1      | Security override for transitive query parsing.                    |
| actions/checkout                                         | 7.0.1       | CI source checkout.                                                |
| actions/setup-node                                       | 7.1.0       | CI Node.js setup.                                                  |
| actions/upload-artifact                                  | 7.0.2       | CI evidence upload.                                                |

The security overrides select current stable dependency releases for the locked graph. Review their advisory rationale and compatibility when updating the dependency tree. Review dependency-tree changes before updating the locks.

TypeScript 7 projects run Oxlint in two deny-warnings stages: a non-type `.oxlintrc.json` pass, then a type-aware pass using `.oxlintrc.typed.json` with `oxlint-tsgolint`. TypeScript 6 projects run the non-type Oxlint pass and delegate the same twenty-two type rules to ESLint with `typescript-eslint` and `projectService`. The official TypeScript compiler remains a separate check. Real negative probes verify promise safety, unsafe values, React Hooks, accessibility, and architectural boundaries.

Each preset extends its project-local `tsconfig.base.json`; all configuration inputs remain inside the generated project. Stryker uses `tsconfigFile: ""` because its optional configuration-path rewriting uses the older TypeScript compiler API. The official compiler runs before mutation testing, and Vitest executes each instrumented version in Stryker's sandbox. If configuration references are added, review their sandbox resolution before changing this setting.

Use current stable packages with supported peer dependencies. See [the framework guide](framework.md) for the selected preset's component format and compiler integration. Assign one owner to version and lockfile updates, then rerun the affected checks.

## Official references

The following references were checked on 2026-11-13:

- [Node.js release policy](https://nodejs.org/en/about/previous-releases) explains supported release lines.
- [npm ci](https://docs.npmjs.com/cli/v12/commands/npm-ci) documents clean installation from a matching lockfile.
- [giget](https://github.com/unjs/giget) documents Git sources and subdirectory selection.
- [Vue render functions and JSX](https://vuejs.org/guide/extras/render-function.html) documents the supported Vue render-function authoring mode.
- [React application setup](https://react.dev/learn/build-a-react-app-from-scratch) describes the SPA tradeoffs of a build-tool setup.
- [Vite](https://vite.dev/guide/) documents development and production commands. [Vite environment variables](https://vite.dev/guide/env-and-mode) explains why client-exposed values cannot contain secrets.
- [TypeScript compiler options](https://www.typescriptlang.org/tsconfig/) defines the strict compiler checks.
- [Oxlint type-aware linting](https://oxc.rs/docs/guide/usage/linter/type-aware.html) explains its separate type-aware engine. Its [rule reference](https://oxc.rs/docs/guide/usage/linter/rules.html) lists React, accessibility, and TypeScript rules.
- [dependency-cruiser rules](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) describes resolved dependency policies.
- [Vitest coverage](https://vitest.dev/guide/coverage.html) and [Stryker's Vitest runner](https://stryker-mutator.io/docs/stryker-js/vitest-runner/) define the measurement tools.
- [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing) explains automated accessibility checks and their limits.

See [verification](verification.md) for acceptance and [collaboration](collaboration.md) for agent workflow.
