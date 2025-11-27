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
import { Logger } from '../helpers/logger.js';
import type { ActionModelSchema } from '../models/action-model.js';
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
  public async run(config: string, actionIds?: string[]): Promise<void> {
    const data = await this.validateData(config);

    // Filter actions if IDs are provided
    let actions = data.actions;
    if (actionIds && actionIds.length > 0) {
      actions = this.filterActionsByIds(data.actions, actionIds);
    }

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

    for (const action of actions) {
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

  private filterActionsByIds(actions: ActionModelSchema[], requestedIds: string[]): ActionModelSchema[] {
    // Check for duplicate IDs in configuration
    const idCounts = new Map<string, number>();
    for (const action of actions) {
      if (action.id) {
        idCounts.set(action.id, (idCounts.get(action.id) || 0) + 1);
      }
    }

    const duplicateIds = [...idCounts.entries()].filter(([_, count]) => count > 1).map(([id]) => id);

    if (duplicateIds.length > 0) {
      throw new Error(`Duplicate action IDs found in configuration: ${duplicateIds.join(', ')}. Each action must have a unique ID.`);
    }

    // Get actions with IDs and available IDs
    const actionsWithIds = actions.filter((action) => action.id !== undefined);
    const availableIds = new Set(actionsWithIds.map((action) => action.id!));

    // Check if requested IDs exist
    const missingIds = requestedIds.filter((id) => !availableIds.has(id));
    if (missingIds.length > 0) {
      const availableIdsList = [...availableIds].join(', ');
      throw new Error(`The following action IDs were not found: ${missingIds.join(', ')}.\n` + `Available IDs: ${availableIdsList || '(none - no actions have IDs defined)'}`);
    }

    // Warn about actions without IDs that will be excluded
    const actionsWithoutIds = actions.filter((action) => action.id === undefined);
    if (actionsWithoutIds.length > 0) {
      Logger.warn(`Warning: Some actions do not have IDs defined and will be excluded.\n` + `Actions without IDs: ${actionsWithoutIds.map((a) => a.label).join(', ')}`);
      Logger.skipLine();
    }

    // Filter to only requested IDs (preserving order from configuration)
    return actions.filter((action) => action.id && requestedIds.includes(action.id));
  }
}
