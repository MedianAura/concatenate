import { prompt } from 'enquirer';
import { globby } from 'globby';
import path from 'node:path';
import { getConcatenateDirectoryPath } from './root-directory-path.js';

export async function getConfigFile(): Promise<string> {
  const rootDirectory = getConcatenateDirectoryPath();
  let configFiles = await globby('*.*', { cwd: rootDirectory, dot: true });

  configFiles = configFiles.map((file) => path.parse(file).name);

  const response: { config: string } = await prompt({
    type: 'select',
    name: 'config',
    message: 'Select a command line file : ',
    choices: configFiles,
  });

  return response.config;
}
