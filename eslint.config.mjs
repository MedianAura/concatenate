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

// Les fichiers de config à la racine (knip.config.ts) sont du TS aussi : sans eux
// dans ce glob, aucun parseur TS ne s'applique et `import type` ne parse pas.
const TS_FILES = ['**/*.ts'];
const ALL_FILES = ['**/*.{js,mjs,cjs,ts,mts,cts}'];

// simple-import-sort et unused-imports ne publient aucun config : plugin seul.
const pluginOnly = {
  files: ALL_FILES,
  plugins: {
    'simple-import-sort': simpleImportSort,
    'unused-imports': unusedImports,
  },
  rules: {
    // Effets de bord, puis paquets nus, puis `@scope/…`, puis chemins relatifs.
    'simple-import-sort/imports': [2, { groups: [[String.raw`^\u0000`, '^', String.raw`^@\w`, String.raw`^\.`]] }],
    '@typescript-eslint/no-unused-vars': 0,
    'unused-imports/no-unused-imports': 2,
    'unused-imports/no-unused-vars': [1, { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' }],
  },
};

// `n/no-missing-import` ne suit pas la réécriture `.js` -> `.ts` de NodeNext.
const nodeOverrides = {
  files: ALL_FILES,
  rules: {
    'n/no-missing-import': 0,
  },
};

// Les fichiers de configuration ont pour raison d'être leurs effets de bord.
// `src/index.ts` est le câblage de la CLI : l'enregistrement des commandes commander
// est l'objet même du module, pas un accident. `bin/run.js` est le shim exécutable :
// son code de sortie est le contrat avec le shell, d'où le `process.exit`.
const configFiles = {
  files: ['*.config.{js,mjs,cjs,ts,mts}', 'knip.config.ts', 'bin/run.js', 'src/index.ts'],
  rules: {
    'unicorn/no-top-level-side-effects': 0,
    'unicorn/prefer-module': 0,
    'import-x/no-anonymous-default-export': 0,
    'n/no-process-exit': 0,
  },
};

// unicorn 72 impose privé-avant-public. La base de code suit la convention inverse
// (API publique en tête), qui n'a jamais été un accident — désactivé plutôt que de
// réordonner toutes les classes pour une préférence stylistique non choisie.
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
    // Hors de tout tsconfig : le parseur ne peut pas le résoudre.
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
  // eslint-import-resolver-typescript v4 a supprimé l'interface héritée qu'attend
  // le `{ typescript: true }` de importX.typescript : on câble resolver-next.
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

  // Prettier en dernier : le formatage est vérifié par l'action prettier de
  // `.concatenate/check.json`, pas par une règle de lint.
  eslintConfigPrettier,
]);
