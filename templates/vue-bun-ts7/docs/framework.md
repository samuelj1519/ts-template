# Vue preset

This preset uses Vue 3.5.45 with the Composition API and typed render functions. Components are ordinary TypeScript files, so the TypeScript compiler and type-aware Oxlint inspect the same source used by the production build. Vite builds these TypeScript modules directly.

Keep mounting and feature composition in `src/app/`. A feature exposes its public component through `index.ts`. Use Vue's `ref` for owned interface state and `computed` for derived values. Pure rules remain ordinary TypeScript and do not import Vue or browser APIs.

Render functions use `h`, and native form binding uses Vue's `withDirectives` and `vModelText`. See the [official render function guide](https://vuejs.org/guide/extras/render-function.html).

Supported component format: TypeScript render functions in `.ts` files. SFC (`.vue`) and TSX authoring require a compatible type, lint, import, coverage, and build pipeline before they can be enabled. See [Vue's TypeScript guide](https://vuejs.org/guide/typescript/overview.html).

Component tests mount real Vue components and use DOM user events. Automatic unmounting and DOM cleanup keep tests independent. The shared browser scenarios verify the production build, including text normalization, reset focus, narrow layout, themes, and accessibility.
