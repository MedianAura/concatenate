import { type ExecaChildPromise, execaCommand, type ExecaReturnValue } from 'execa';
import { globby } from 'globby';
import json5 from 'json5';
import { Listr } from 'listr2';
import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { getRootDirectoryPath } from '../helpers/root-directory-path.js';
import { ConfigurationModel, type ConfigurationModelSchema } from '../models/configuration-model.js';

const parseJSON = json5.parse;

export class CommandRunner {
  public async run(config: string): Promise<void> {
    const data = await this.validateData(config);

    const tasks = new Listr<unknown>([], {
      concurrent: data.type === 'parallel',
      collectErrors: 'full',
      exitOnError: data.type === 'series',
    });

    for (const action of data.actions) {
      tasks.add([
        {
          title: action.label,
          task: async (): Promise<ChildProcess & ExecaChildPromise<string> & Promise<ExecaReturnValue<string>>> => {
            return execaCommand(action.command, { cwd: path.resolve(getRootDirectoryPath(), '..') });
          },
        },
      ]);
    }

    try {
      await tasks.run();
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new TypeError(`There was an issue trying to parse the configuration file: ${error.message}`);
      }
    }
  }

  private async getConfigFile(config: string = 'default'): Promise<string> {
    const _configPath = path.resolve(`${getRootDirectoryPath()}/`);

    const configFiles = await globby(`${config}.*`, { dot: true, cwd: _configPath, absolute: true });
    if (configFiles.length !== 1) {
      throw new Error(`There was an issue trying to find the configuration file for ${config}`);
    }

    return configFiles.pop() ?? '';
  }

  private readConfigFile(configFile: string): string {
    try {
      return fs.readFileSync(configFile, { encoding: 'utf8' });
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new TypeError(`There was an issue trying to parse the configuration file: ${error.message}`);
      }
      return '';
    }
  }

  private parseConfigData(configFile: string, data: string): unknown {
    const { ext } = path.parse(configFile);

    if (ext === '.yaml' || ext === '.yml') {
      return parseYaml(data);
    } else if (ext === '.json' || ext === '.json5') {
      return parseJSON(data);
    } else {
      throw new Error(`Unsupported file type: ${ext}`);
    }
  }

  private async validateData(config: string): Promise<ConfigurationModelSchema> {
    const configFile = await this.getConfigFile(config);

    const dataString = this.readConfigFile(configFile);
    const data = this.parseConfigData(configFile, dataString);

    return ConfigurationModel.parse(data);
  }
}
