import type { ConfigurationModelSchema } from '../models/configuration-model.js';

export const ConfigurationDefault: Record<string, ConfigurationModelSchema> = {
  check: {
    type: 'parallel',
    actions: [
      {
        id: 'eslint',
        label: 'Checking with ESLint',
        command: 'eslint . --format pretty',
      },
      {
        id: 'prettier',
        label: 'Checking with Prettier',
        command: 'prettier --list-different --cache .',
      },
      {
        id: 'knip',
        label: 'Checking with Knip',
        command: 'knip',
      },
      {
        id: 'tsc',
        label: 'Checking with TSC',
        command: 'tsc --noEmit',
      },
    ],
  },
  fix: {
    type: 'series',
    actions: [
      {
        id: 'eslint',
        label: 'Fixing with ESLint',
        command: 'eslint . --format pretty --fix',
      },
      {
        id: 'prettier',
        label: 'Fixing with Prettier',
        command: 'prettier --write --list-different --cache .',
      },
    ],
  },
};
