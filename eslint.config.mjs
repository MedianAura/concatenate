import { defineConfig } from 'eslint/config';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import eslintPluginEslintComments from 'eslint-plugin-eslint-comments';
import { importX } from 'eslint-plugin-import-x';
import eslintPluginN from 'eslint-plugin-n';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import eslintPluginPromise from 'eslint-plugin-promise';
import * as eslintPluginRegExp from 'eslint-plugin-regexp';
import eslintPluginSimpleImportSort from 'eslint-plugin-simple-import-sort';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import eslintPluginUnusedImports from 'eslint-plugin-unused-imports';
import eslintPluginZod from 'eslint-plugin-zod';
import * as typescriptEslint from 'typescript-eslint';
import eslint from '@eslint/js';
import tsParser from '@typescript-eslint/parser';

export default defineConfig([
  {
    ignores: ['dist/**/*', 'coverage/**/*', 'node_modules/**/*', 'automaton.config.mts'],
  },

  // General
  eslint.configs.recommended,
  typescriptEslint.configs.recommended,

  // ImportX
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
    },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver({ alwaysTryTypes: true })],
    },
  },

  // Unicorn Options
  eslintPluginUnicorn.configs.recommended,
  {
    rules: {
      'unicorn/filename-case': 'off',
    },
  },

  // Prettier
  eslintPluginPrettierRecommended,
  {
    // now override just the prettier/prettier rule:
    rules: {
      'prettier/prettier': [2, {}, { usePrettierrc: true }],
    },
  },

  // Plugins
  {
    plugins: {
      'simple-import-sort': eslintPluginSimpleImportSort,
      'unused-imports': eslintPluginUnusedImports,
      'eslint-comments': eslintPluginEslintComments,
      promise: eslintPluginPromise,
      zod: eslintPluginZod,
      regexp: eslintPluginRegExp,
      n: eslintPluginN,
    },
    rules: {
      'n/no-missing-import': 'off',
      'simple-import-sort/imports': [
        'error',
        {
          groups: [[String.raw`^\u0000`], ['^', String.raw`^@\w`, String.raw`^\.`], [String.raw`^.+\.vue$`]],
        },
      ],
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      'zod/prefer-enum': 2,
      'zod/require-strict': 2,
    },
  },
]);
