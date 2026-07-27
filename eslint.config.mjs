import { defineConfig, globalIgnores } from 'eslint/config';
import eslintConfigPrettier from 'eslint-config-prettier';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { flatConfigs as importX } from 'eslint-plugin-import-x';
import n from 'eslint-plugin-n';
import promise from 'eslint-plugin-promise';
import { configs as regexpConfigs } from 'eslint-plugin-regexp';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unicorn from 'eslint-plugin-unicorn';
import unusedImports from 'eslint-plugin-unused-imports';
import { configs as tseslintConfigs } from 'typescript-eslint';
import js from '@eslint/js';
import { recommended as eslintComments } from '@eslint-community/eslint-plugin-eslint-comments/configs';

// The root config files (knip.config.ts) are TS too: without them in this glob no TS
// parser applies and `import type` fails to parse.
const TS_FILES = ['**/*.ts'];
const ALL_FILES = ['**/*.{js,mjs,cjs,ts,mts,cts}'];

// simple-import-sort and unused-imports ship no config, so register the plugins only.
const pluginOnly = {
  files: ALL_FILES,
  plugins: {
    'simple-import-sort': simpleImportSort,
    'unused-imports': unusedImports,
  },
  rules: {
    // Side effects, then bare packages, then `@scope/...`, then relative paths.
    'simple-import-sort/imports': [2, { groups: [[String.raw`^\u0000`, '^', String.raw`^@\w`, String.raw`^\.`]] }],
    '@typescript-eslint/no-unused-vars': 0,
    'unused-imports/no-unused-imports': 2,
    'unused-imports/no-unused-vars': [1, { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' }],
  },
};

// `n/no-missing-import` does not follow NodeNext's `.js` -> `.ts` rewriting.
const nodeOverrides = {
  files: ALL_FILES,
  rules: {
    'n/no-missing-import': 0,
  },
};

// Config files exist for their side effects. `src/index.ts` is the CLI wiring: the
// commander command registration is the whole point of the module, not an accident.
// `bin/run.js` is the executable shim, and its exit code is the contract with the
// shell -- hence the `process.exit`.
const configFiles = {
  files: ['*.config.{js,mjs,cjs,ts,mts}', 'knip.config.ts', 'bin/run.js', 'src/index.ts'],
  rules: {
    'unicorn/no-top-level-side-effects': 0,
    'unicorn/prefer-module': 0,
    'import-x/no-anonymous-default-export': 0,
    'n/no-process-exit': 0,
  },
};

// unicorn 72 enforces private-before-public. This codebase follows the opposite
// convention (public API first), which was never an accident -- disabled rather than
// reordering every class for a stylistic preference nobody chose.
const classMemberOrder = {
  files: TS_FILES,
  rules: {
    'unicorn/consistent-class-member-order': 0,
  },
};

export default defineConfig([
  globalIgnores([
    'dist/**',
    'coverage/**',
    'node_modules/**',
    'reports/**',
    // Outside every tsconfig: the parser cannot resolve it.
    'automaton.config.mts',
  ]),

  js.configs.recommended,

  {
    files: TS_FILES,
    extends: [tseslintConfigs.recommended],
  },

  regexpConfigs['flat/recommended'],
  eslintComments,
  promise.configs['flat/recommended'],
  n.configs['flat/recommended'],
  importX.recommended,
  importX.typescript,
  // eslint-import-resolver-typescript v4 dropped the legacy interface that
  // importX.typescript's `{ typescript: true }` expects, so wire resolver-next.
  {
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver({ alwaysTryTypes: true, project: 'tsconfig.json' })],
    },
  },

  pluginOnly,
  nodeOverrides,

  unicorn.configs.recommended,
  classMemberOrder,
  configFiles,

  // Prettier last: formatting is checked by the prettier action in
  // `.concatenate/check.yaml`, not by a lint rule.
  eslintConfigPrettier,
]);
