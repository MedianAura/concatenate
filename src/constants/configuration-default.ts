import type { ConfigurationModelSchema } from '../models/configuration-model.js';

export const ConfigurationDefault: Record<string, ConfigurationModelSchema> = {
  check: {
    type: 'parallel',
    actions: [
      {
        label: 'Checking with ESLint',
        command: 'eslint . --format pretty',
      },
      {
        label: 'Checking with Prettier',
        command: 'prettier --list-different --cache .',
      },
      {
        label: 'Checking with Knip',
        command: 'knip',
      },
      {
        label: 'Checking with TSC',
        command: 'tsc --noEmit',
      },
    ],
  },
  fix: {
    type: 'series',
    actions: [
      {
        label: 'Fixing with ESLint',
        command: 'eslint . --format pretty --fix',
      },
      {
        label: 'Fixing with Prettier',
        command: 'prettier --write --list-different --cache .',
      },
    ],
  },
};
