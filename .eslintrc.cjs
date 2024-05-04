/* eslint-env node */
require('@rushstack/eslint-patch/modern-module-resolution');

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  extends: ['eslint:recommended', 'plugin:eslint-comments/recommended', 'plugin:n/recommended', 'plugin:unicorn/recommended', 'plugin:@typescript-eslint/recommended'],
  plugins: ['@typescript-eslint', 'simple-import-sort', 'prettier', 'unused-imports', 'eslint-comments', 'import', 'promise', 'unicorn', 'n'],
  settings: {
    node: {
      resolvePaths: [__dirname],
      tryExtensions: ['.js', '.json', '.ts', '.node'],
    },
  },
  rules: {
    'simple-import-sort/imports': [
      'error',
      {
        groups: [['^\\u0000'], ['^', '^@\\w', '^\\.'], ['^.+\\.vue$']],
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
    'prettier/prettier': [
      'error',
      {},
      {
        usePrettierrc: true,
      },
    ],
  },
};
