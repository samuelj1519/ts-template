const { readdirSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { sourceExtensions } = require('./quality.config.ts');

const featureRoot = join(process.cwd(), 'src/features');
const features = existsSync(featureRoot)
  ? readdirSync(featureRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  : [];
/** @param {string} text */
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const extensionPattern = `(?:${sourceExtensions.join('|')})`;
const pureModels = `^src/(domain/|features/[^/]+/model\\.${extensionPattern}$)`;
const testCode = `(\\.(test|spec)\\.${extensionPattern}$|^src/test/)`;

module.exports = {
  forbidden: [
    { name: 'no-cycles', severity: 'error', from: {}, to: { circular: true } },
    { name: 'no-unresolved', severity: 'error', from: {}, to: { couldNotResolve: true } },
    {
      name: 'runtime-does-not-import-tests',
      severity: 'error',
      from: { pathNot: testCode },
      to: { path: testCode },
    },
    {
      name: 'pure-models-node-runtime',
      severity: 'error',
      from: { path: pureModels },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'pure-models-use-pure-helpers',
      severity: 'error',
      from: { path: pureModels },
      to: { path: '^src/(app|features|shared|adapters)/', pathNot: pureModels },
    },
    {
      name: 'features-do-not-compose',
      severity: 'error',
      from: { path: '^src/features/' },
      to: { path: '^src/app/' },
    },
    {
      name: 'shared-is-independent',
      severity: 'error',
      from: { path: '^src/(shared|domain)/' },
      to: { path: '^src/(features|app|adapters)/' },
    },
    {
      name: 'pure-models',
      severity: 'error',
      from: { path: pureModels },
      to: {
        path: '(^src/(app|adapters)/|^src/features/.+\\.[jt]sx$|^node_modules/(react|react-dom|vue|@vue)(/|$)|^node:)',
      },
    },
    ...features.flatMap((name) => {
      const path = `^src/features/${escape(name)}/`;
      return [
        {
          name: `feature-${name}-owns-internals`,
          severity: 'error',
          from: { pathNot: path },
          to: { path, pathNot: `${path}index\\.ts$` },
        },
        {
          name: `feature-${name}-has-no-peers`,
          severity: 'error',
          from: { path },
          to: { path: '^src/features/', pathNot: path },
        },
      ];
    }),
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    parser: 'swc',
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      extensions: [...sourceExtensions.map((extension) => `.${extension}`), '.json'],
      conditionNames: ['import', 'browser', 'default'],
    },
  },
};
