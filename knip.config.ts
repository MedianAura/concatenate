import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: ['src/index.{js,ts}'],
  project: ['**/*.{js,ts}'],
  // Invoqués depuis les `command` de `.concatenate/*.yaml`, que knip ne lit pas.
  ignoreDependencies: ['prettier', 'eslint-formatter-pretty'],
};

export default config;
