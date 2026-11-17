# TypeScript conventions

These conventions apply to every generated preset. Oxlint enforces the syntax names for TypeScript 6 and TypeScript 7. TypeScript 7 enforces the type-aware names with Oxlint and `oxlint-tsgolint`. TypeScript 6 enforces those same names with `typescript-eslint`. Type-aware names stay off in `.oxlintrc.json` and on in `.oxlintrc.typed.json`. TypeScript 6 lists them in `eslint.config.mjs`.

## Rules lint enforces

- `typescript/no-explicit-any`, `typescript/no-unsafe-argument`, `typescript/no-unsafe-assignment`, `typescript/no-unsafe-call`, `typescript/no-unsafe-member-access`, and `typescript/no-unsafe-return`. `strict` includes `noImplicitAny`.
- `typescript/no-non-null-assertion`
- `typescript/ban-ts-comment`. `@ts-ignore` and `@ts-nocheck` are banned. `@ts-expect-error` needs a description of at least 12 characters.
- `typescript/no-floating-promises` and `typescript/no-misused-promises`
- `typescript/only-throw-error`
- `eslint/eqeqeq`
- `import/no-default-export`
- `typescript/no-namespace`
- `typescript/consistent-type-imports` and `verbatimModuleSyntax`
- `typescript/switch-exhaustiveness-check` and `noFallthroughCasesInSwitch`
- `noUnusedLocals` and `noUnusedParameters`
- `typescript/prefer-readonly`
- `typescript/prefer-optional-chain` and `typescript/prefer-nullish-coalescing`
- `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`

`import/no-default-export` is off for `vite.config.ts` and `playwright.config.ts`. Vite and Playwright load a default export from those files.

## Practices lint does not cover

Use `unknown` for a value you have not parsed yet. Narrow it before you use it. `typescript/no-explicit-any` already rejects `any`.

Mark public fields `readonly` when nothing assigns them after construction. Use `readonly` arrays and `as const` for values that callers must not change. `typescript/prefer-readonly` checks private members only. `typescript/prefer-readonly-parameter-types` stays off because it flags ordinary parameters.

Write a reason on every `oxlint-disable` and `eslint-disable` comment. The lint command reports a disable that matches no problem. No installed rule checks that the comment text gives a reason. `@ts-expect-error` does, through `typescript/ban-ts-comment`.

## Libraries and applications

A library is a package published to npm or imported by another project. Export named functions and types. Do not add a default export. Accept and return `unknown` at the boundary, then parse it. Put `readonly` on public fields and on arrays in the public signature. Keep `exactOptionalPropertyTypes` on so an omitted option and an option set to `undefined` stay different.

An application is this template's frontend or a script. Use the same rules. The only default-export exception is the Vite config and the Playwright config named above. Keep named exports in `src`.

## Sources

The web pages below were not fetched for this change. 未在线核对. Rule names were checked on 2026-11-17 against Oxlint 1.93.0 in `node_modules` and the locked `typescript-eslint` 8.72.2 package in the local npm cache.

- Google TypeScript Style Guide, https://google.github.io/styleguide/tsguide.html. The items used are avoid `any`, avoid non-null assertions, do not use `@ts-ignore`, throw only `Error`, use `===`, avoid default exports, avoid namespaces, use `import type`, prefer `unknown`, use `readonly`, and prefer optional chains and `??`. This file does not copy the guide. `vite.config.ts` and `playwright.config.ts` keep a default export because those tools require one.
- typescript-eslint shared configs, https://typescript-eslint.io/users/configs/. `strict-type-checked` includes `only-throw-error`. `stylistic-type-checked` includes `prefer-nullish-coalescing` and `prefer-optional-chain`. `prefer-readonly` is enabled here and is not part of the 8.72.2 `stylistic-type-checked` config. `prefer-readonly-parameter-types` stays off.
