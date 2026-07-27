import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: ['src/index.{js,ts}'],
  project: ['**/*.{js,ts}'],
  // Invoked from the `command` fields of `.concatenate/*.yaml`, which knip does not
  // read, or straight from the shell. None of them is ever imported.
  ignoreDependencies: ['prettier', 'eslint-formatter-pretty', '@medianaura/komity'],
};

export default config;
