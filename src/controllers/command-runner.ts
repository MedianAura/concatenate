import chalk from 'chalk';
import { execaCommand, type ExecaReturnValue } from 'execa';
import { globby } from 'globby';
import json5 from 'json5';
import { Listr } from 'listr2';
import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { parse as parseYaml } from 'yaml';
import { getConcatenateDirectoryPath } from '../helpers/root-directory-path.js';
import { ConfigurationModel, type ConfigurationModelSchema } from '../models/configuration-model.js';

const parseJSON = json5.parse;

interface ListrContextReport {
  title: string;
  exitCode: number;
  stdout: string | Readable;
  stderr: string | Readable;
  message: string;
}

interface ListrContext {
  reports: ListrContextReport[];
}

function handleOutput(status: ExecaReturnValue<string>, action: string, context: ListrContext): void {
  const messages: string[] = [status.stderr.toString(), status.stdout.toString()];

  context.reports.push({
    title: action,
    exitCode: status.exitCode ?? 0,
    stdout: status.stdout ?? '',
    stderr: status.stderr ?? '',
    message: messages.join('\n\n').trim(),
  });
}

function printContext(context: ListrContext): void {
  for (const report of context.reports) {
    if (report.exitCode === 0) continue;

    console.log(`\n\n${chalk.bgYellow(report.title)}`);
    console.log('---------------------------------');
    console.log(report.message);
  }
}

export class CommandRunner {
  public async run(config: string): Promise<void> {
    const data = await this.validateData(config);
    const globalContext = { reports: [] as ListrContextReport[] };

    const tasks = new Listr<ListrContext>([], {
      concurrent: data.type === 'parallel',
      collectErrors: 'full',
      exitOnError: data.type === 'series',
      rendererOptions: {
        showErrorMessage: false,
      },
      ctx: globalContext,
    });

    for (const action of data.actions) {
      tasks.add([
        {
          title: action.label,
          task: async (context): Promise<void> => {
            try {
              const status = await execaCommand(action.command, {
                cwd: path.resolve(getConcatenateDirectoryPath(), '..'),
                stdio: 'pipe',
                env: { ...process.env, FORCE_COLOR: '1' },
              });

              handleOutput(status, action.label, context);
            } catch (error: unknown) {
              handleOutput(error as ExecaReturnValue<string>, action.label, context);
              throw new Error(action.label);
            }
          },
        },
      ]);
    }

    try {
      await tasks.run();
    } catch {
      printContext(globalContext);
      throw new TypeError('Some tasks failed');
    }

    if (globalContext.reports.some((report) => report.exitCode !== 0)) {
      printContext(globalContext);
      throw new TypeError('Some tasks failed');
    }
  }

  private async getConfigFile(config: string = 'default'): Promise<string> {
    const _configPath = path.resolve(`${getConcatenateDirectoryPath()}/`);

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
