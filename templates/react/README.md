# TypeScript frontend starter

A frontend project with strict TypeScript, executable architecture rules, tests, security checks, and CI. The selected framework is recorded in `framework.config.ts` and described in [the framework guide](docs/framework.md).

## Create a project

Use a committed `ts-template` source checkout on `main`. Choose one command and replace the source path with that checkout's absolute path:

```sh
npm exec --yes --package=giget@3.3.1 -- giget 'git:/absolute/path/to/ts-template#main:templates/vanilla' my-app
npm exec --yes --package=giget@3.3.1 -- giget 'git:/absolute/path/to/ts-template#main:templates/react' my-react-app
npm exec --yes --package=giget@3.3.1 -- giget 'git:/absolute/path/to/ts-template#main:templates/vue' my-vue-app
```

| Preset    | Application style                                                     |
| --------- | --------------------------------------------------------------------- |
| `vanilla` | Native HTML, CSS, and TypeScript. No UI framework runtime dependency. |
| `react`   | React components and Hooks with TypeScript.                           |
| `vue`     | Vue 3.5.45 Composition API and typed render functions.                |

See [the framework guide](docs/framework.md) for the selected preset's component format and tooling requirements.

Giget copies the selected payload from the committed source revision. Use a new destination that is not a symbolic link, under a trusted parent directory.

The private package name is independent of the destination directory. If you rename it, update and review `package-lock.json` together with `package.json`.

## Develop

Use Node.js 26.13.1 and npm 12.2.2. From the generated project:

```sh
npm ci
npm run dev
```

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
