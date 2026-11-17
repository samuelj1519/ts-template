# Frontend architecture

The application is a client-rendered frontend built by Vite. Its selected preset provides native DOM code, React components, or Vue render functions. Read [the framework guide](framework.md) for its concrete mounting, state, and test APIs.

The text preview demonstrates a complete feature: the view owns source text and a pure function derives the displayed result.

## Responsibilities

| Location                                             | Responsibility                                           |
| ---------------------------------------------------- | -------------------------------------------------------- |
| `src/app/main.ts`                                    | Mount the selected application and load shared styles.   |
| `src/app/App.ts` or `App.tsx`                        | Compose feature public entries.                          |
| `src/features/text-preview/index.ts`                 | Expose the feature's supported interface.                |
| `src/features/text-preview/TextPreview.ts` or `.tsx` | Own input, rendering, and focus behavior.                |
| `src/features/text-preview/model.ts`                 | Normalize text without UI or transport dependencies.     |
| Colocated tests                                      | Verify pure results and user-visible behavior.           |
| `src/test/`                                          | Register assertions and framework-specific test cleanup. |
| `e2e/`                                               | Exercise the actual production build in a browser.       |

Add shared modules and framework facilities when actual consumers need them.

## Enforced dependencies

Five constraints apply:

1. `app` composes features. A feature uses its own implementation and shared modules, not another feature or `app`.
2. Shared modules do not depend on features or `app`.
3. External feature imports use `index.ts`, including type imports and re-exports. Public entries contain re-exports only.
4. Pure model imports remain independent of UI runtimes, components, Node.js, and transport adapters. Put reusable pure helpers in `src/domain/`.
5. The resolved graph has no cycles or unresolved dependencies. Production modules cannot import test or test-support modules.

The parser inspects all accepted JavaScript and TypeScript extensions. Dynamic imports require string literals. Use `import type` declarations for module types; nested inline import types are rejected so dependencies remain resolvable. Source symbolic links and unsupported `.vue` files are rejected explicitly.

New feature directories participate automatically. Relative imports, aliases, type imports, literal dynamic imports, tests, and directories named like output folders remain part of the relevant checks. Preserve the runnable negative probes when changing policy.

## State and external data

Each framework view owns its input using its native API. The pure model derives the preview. Keep one owner for each writable state value.

At an external-service adapter, parse `unknown` responses into an explicit domain schema, then return typed values to the feature. Derive types from schemas. Keep HTTP, filesystem, database, and native IPC details out of pure code.

Add explicit loading, success, failure, cancellation, and unknown-result states when introducing a real asynchronous capability. Guard late responses with operation identity or revision. An acknowledgement is not completion; hiding a view does not cancel a side effect.

## Integrate with a backend monorepo

Generate into a new frontend directory, such as `apps/web/`.

Give one owner the workspace integration. Choose one lockfile strategy, then migrate the manifest, lockfile, CI working directory, and scripts together. Run the full checks on the exact combined tree. Keep framework-specific runtime dependencies inside the frontend package.

Keep backend contracts authoritative. Generate client types from backend schemas where available and validate runtime responses. Change both endpoints and contract tests together. Keep secrets and authorization enforcement on the backend.

For server rendering or server components, select the appropriate framework facilities and deployment model.
