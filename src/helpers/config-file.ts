import { globby } from 'globby';
import json5 from 'json5';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { getConcatenateDirectoryPath } from './root-directory-path.js';

// Need to be disable to work once compiled with TSC.
// eslint-disable-next-line import-x/no-named-as-default-member
const { parse: parseJSON } = json5;

/**
 * Locates a config by name inside `.concatenate/`.
 *
 * `findConfigFile`, not `getConfigFile`: `config-selector.ts` already exports that name
 * for the interactive picker, and the two do opposite things -- this one resolves a name
 * the caller already has, that one asks the user for one.
 *
 * The only async member of this module, because globby is. Keeping the rest sync is what
 * makes the failure ordering deterministic: a locate error always precedes a read error,
 * which always precedes a parse error, with no interleaving to reason about.
 */
export async function findConfigFile(config: string = 'default'): Promise<string> {
  const _configPath = path.resolve(`${getConcatenateDirectoryPath()}/`);

  const configFiles = await globby(`${config}.*`, { dot: true, cwd: _configPath, absolute: true });
  if (configFiles.length !== 1) {
    throw new Error(`There was an issue trying to find the configuration file for ${config}`);
  }

  return configFiles.pop() ?? '';
}

export function readConfigFile(configFile: string): string {
  try {
    return fs.readFileSync(configFile, { encoding: 'utf8' });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new TypeError(`There was an issue trying to parse the configuration file: ${error.message}`, { cause: error });
    }
    return '';
  }
}

/**
 * Parses by extension. Takes the path rather than the extension so the caller does not
 * have to know that the extension is what selects the parser.
 */
export function parseConfigData(configFile: string, data: string): unknown {
  const { ext } = path.parse(configFile);

  if (ext === '.yaml' || ext === '.yml') {
    return parseYaml(data);
  }

  if (ext === '.json' || ext === '.json5') {
    return parseJSON(data);
  }

  throw new Error(`Unsupported file type: ${ext}`);
}
