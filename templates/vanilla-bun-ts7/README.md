# TypeScript frontend starter

A frontend project with strict TypeScript, executable architecture rules, tests, security checks, and CI. The selected framework is recorded in `framework.config.ts` and described in [the framework guide](docs/framework.md).

## Create a project

Use a committed `ts-template` source checkout on `main`. Replace `/absolute/path/to/ts-template` with your checkout. Each Giget path selects preset, package manager, and TypeScript major. Defaults are npm 12.2.2 with TypeScript 7.0.2 (`templates/vanilla`, `templates/react`, `templates/vue`).

```sh
npm exec --yes --package=giget@3.3.1 -- giget 'git:/absolute/path/to/ts-template#main:templates/vanilla' my-app
npm exec --yes --package=giget@3.3.1 -- giget 'git:/absolute/path/to/ts-template#main:templates/vanilla-npm-ts6' my-app-ts6
npm exec --yes --package=giget@3.3.1 -- giget 'git:/absolute/path/to/ts-template#main:templates/vanilla-bun-ts7' my-app-bun
npm exec --yes --package=giget@3.3.1 -- giget 'git:/absolute/path/to/ts-template#main:templates/vanilla-bun-ts6' my-app-bun-ts6

npm exec --yes --package=giget@3.3.1 -- giget 'git:/absolute/path/to/ts-template#main:templates/react' my-react-app
npm exec --yes --package=giget@3.3.1 -- giget 'git:/absolute/path/to/ts-template#main:templates/react-npm-ts6' my-react-ts6
npm exec --yes --package=giget@3.3.1 -- giget 'git:/absolute/path/to/ts-template#main:templates/react-bun-ts7' my-react-bun
npm exec --yes --package=giget@3.3.1 -- giget 'git:/absolute/path/to/ts-template#main:templates/react-bun-ts6' my-react-bun-ts6

npm exec --yes --package=giget@3.3.1 -- giget 'git:/absolute/path/to/ts-template#main:templates/vue' my-vue-app
npm exec --yes --package=giget@3.3.1 -- giget 'git:/absolute/path/to/ts-template#main:templates/vue-npm-ts6' my-vue-ts6
npm exec --yes --package=giget@3.3.1 -- giget 'git:/absolute/path/to/ts-template#main:templates/vue-bun-ts7' my-vue-bun
npm exec --yes --package=giget@3.3.1 -- giget 'git:/absolute/path/to/ts-template#main:templates/vue-bun-ts6' my-vue-bun-ts6
```

| Giget path suffix | Preset  | Package manager | TypeScript |
| ----------------- | ------- | --------------- | ---------- |
| `vanilla`         | vanilla | npm (default)   | 7          |
| `vanilla-npm-ts6` | vanilla | npm             | 6          |
| `vanilla-bun-ts7` | vanilla | Bun 1.3.11      | 7          |
| `vanilla-bun-ts6` | vanilla | Bun             | 6          |
| `react`           | react   | npm (default)   | 7          |
| `react-npm-ts6`   | react   | npm             | 6          |
| `react-bun-ts7`   | react   | Bun             | 7          |
| `react-bun-ts6`   | react   | Bun             | 6          |
| `vue`             | vue     | npm (default)   | 7          |
| `vue-npm-ts6`     | vue     | npm             | 6          |
| `vue-bun-ts7`     | vue     | Bun             | 7          |
| `vue-bun-ts6`     | vue     | Bun             | 6          |

| Preset    | Application style                                                     |
| --------- | --------------------------------------------------------------------- |
| `vanilla` | Native HTML, CSS, and TypeScript. No UI framework runtime dependency. |
| `react`   | React components and Hooks with TypeScript.                           |
| `vue`     | Vue 3.5.45 Composition API and typed render functions.                |

See [the framework guide](docs/framework.md) for the selected preset's component format and tooling requirements.

Giget copies the selected payload from the committed source revision. Use a new destination that is not a symbolic link, under a trusted parent directory.

The private package name is independent of the destination directory. If you rename it, update and review `package-lock.json` together with `package.json`.

## Develop

Use Node.js 26.13.1. npm templates use npm 12.2.2; Bun templates use Bun 1.3.11 for installs and `bun run` script dispatch while Node still runs the engineering tools. From the generated project:

```sh
npm ci
npm run dev
```

For a Bun template, replace `npm ci` with `bun install --frozen-lockfile` and use `bun run <script>` for the scripts listed in `package.json`.

Open Vite's printed URL. The example normalizes whitespace as you type and resets the input with keyboard focus restored.

Prepare Chromium before running browser acceptance:

```sh
npm exec -- playwright install chromium
```

## Verify changes

```sh
npm run check
npm run check:full
npm run check:milestone
```

`check` runs formatting, typed lint, types, architecture, and spelling. `check:full` adds policy tests, application coverage, production build, real-browser acceptance, unused code, dependency security, and licenses. `check:milestone` also runs mutation testing and duplicate-source checks. See [verification](docs/verification.md).

Apply formatting with `npm run format`. Build production assets with `npm run build`; preview them with `npm run preview`.

For a new repository, initialize Git before enabling the optional commit checks:

```sh
git init -b main
git config --local core.hooksPath .githooks
```

## Extend the application

Keep application composition in `src/app/`, feature behavior in `src/features/`, and reusable pure helpers in `src/domain/` when needed. Framework components use their native APIs.

Read [architecture](docs/architecture.md) before changing modules or connecting a backend, and [collaboration](docs/collaboration.md) before concurrent agent work. Tool selections and their boundaries are in [toolchain](docs/toolchain.md).

## License

[MIT](LICENSE). Retain the original notice and add notices for your contributions as appropriate.
