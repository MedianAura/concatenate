import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: ['src/index.{js,ts}'],
  project: ['**/*.{js,ts}'],
};

export default config;
