import chalk from 'chalk';
import { execa, ExecaError, parseCommandString, type Result } from 'execa';
import { Listr, parseTimer, PRESET_TIMER } from 'listr2';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { findConfigFile, parseConfigData, readConfigFile } from '../helpers/config-file.js';
import { Logger } from '../helpers/logger.js';
import { getConcatenateDirectoryPath } from '../helpers/root-directory-path.js';
import { assertNoSelfInvocation } from '../helpers/self-invocation.js';
import type { ActionModelSchema } from '../models/action-model.js';
import { ConfigModel, type ConfigModelSchema } from '../models/config-model.js';

interface ListrContextReport {
  title: string;
  exitCode: number;
  durationMs: number;
  stdout: string | Readable;
  stderr: string | Readable;
  message: string;
}

interface ListrContext {
  reports: ListrContextReport[];
}

function handleOutput(status: Result | ExecaError, action: string, context: ListrContext): void {
  const stderr = status.stderr?.toString() ?? '';
  const stdout = status.stdout?.toString() ?? '';
  const messages: string[] = [stderr, stdout];

  context.reports.push({
    title: action,
    exitCode: status.exitCode ?? 0,
    // execa measures this on both the result and the error, so a failing action is
    // timed as well. It is absent only when the subprocess never started.
    durationMs: status.durationMs ?? 0,
    stdout,
    stderr,
    message: messages.join('\n\n').trim(),
  });
}

/**
 * One line per action, always. The detailed blocks below skip actions that printed
 * nothing, which would otherwise hide the duration of exactly the actions worth
 * timing -- a slow, quiet `tsc` produces no output at all.
 */
function printSummary(context: ListrContext): void {
  if (context.reports.length === 0) return;

  const width = Math.max(...context.reports.map((report) => report.title.length));

  Logger.skipLine();
  for (const report of context.reports) {
    const hasFailed = report.exitCode !== 0;
    const mark = hasFailed ? chalk.red('✖') : chalk.green('✔');

    console.log(`${mark} ${report.title.padEnd(width)}  ${chalk.dim(parseTimer(report.durationMs))}`);
  }
}

function printContext(context: ListrContext): void {
  for (const report of context.reports) {
    if (report.message.trim() === '') continue;

    // parseTimer is listr2's own formatter, so the duration in the report reads the
    // same as the one the live renderer showed while the action was running.
    console.log(`\n\n${chalk.bgYellow(report.title)} ${chalk.dim(parseTimer(report.durationMs))}`);
    console.log('---------------------------------');
    console.log(report.message);
  }
}

export class CommandRunner {
  public async run(config: string, actionIds?: string[]): Promise<void> {
    const { configFile, data } = await this.validateData(config);

    // Before filtering, not after: an action the user did not select is still a config
    // defect, and reporting it only when it happens to be selected makes the failure
    // depend on the command line rather than on the file.
    // Relative to the project root: findConfigFile returns an absolute path, and an
    // absolute path in the message is noise the reader has to skip past to find the two
    // segments that identify the file. Hoisted out of the call because
    // `unicorn/max-nested-calls` caps the expression at three deep.
    const projectRoot = path.resolve(getConcatenateDirectoryPath(), '..');

    assertNoSelfInvocation(
      data.actions.map((action) => ({ command: action.command, labelPath: [action.label] })),
      path.relative(projectRoot, configFile),
    );

    // Filter actions if IDs are provided
    const actions = actionIds && actionIds.length > 0 ? this.filterActionsByIds(data.actions, actionIds) : data.actions;

    // Read once, not per action: every action of a run sits at the same depth.
    const currentDepth = Number(process.env.CONCATENATE_DEPTH ?? '0') || 0;

    const globalContext = { reports: [] as ListrContextReport[] };

    const tasks = new Listr<ListrContext>([], {
      concurrent: data.type === 'parallel',
      collectErrors: true,
      exitOnError: data.type === 'series',
      rendererOptions: {
        showErrorMessage: false,
        // Live per-task duration. Checks are the kind of thing you watch, and knowing
        // which action is the slow one is most of why you would watch.
        timer: PRESET_TIMER,
      },
      ctx: globalContext,
    });

    for (const action of actions) {
      tasks.add([
        {
          title: action.label,
          task: async (context): Promise<void> => {
            try {
              // execa 10 removed `execaCommand`: same shell-less splitting, in two steps.
              const [file, ...commandArguments] = parseCommandString(action.command);
              const status = await execa(file, commandArguments, {
                cwd: path.resolve(getConcatenateDirectoryPath(), '..'),
                stdio: 'pipe',
                // Commands target the checked project's binaries (eslint, tsc, ...).
                // Without this only the inherited PATH resolves them, which works under
                // `pnpm run` but not from a global install of the CLI.
                preferLocal: true,
                // The marker the pre-scan cannot replace: it survives any amount of
                // indirection, so `command: npm run check` where the script calls
                // concatenate is caught by the child refusing to start.
                env: { ...process.env, FORCE_COLOR: '1', CONCATENATE_ACTIVE: '1', CONCATENATE_DEPTH: String(currentDepth + 1) },
              });

              handleOutput(status, action.label, context);
            } catch (error: unknown) {
              handleOutput(error as ExecaError, action.label, context);
              throw new Error(action.label, { cause: error });
            }
          },
        },
      ]);
    }

    try {
      await tasks.run();
    } catch {
      printContext(globalContext);
      printSummary(globalContext);
      throw new TypeError('Some tasks failed');
    }

    printContext(globalContext);
    printSummary(globalContext);
    if (globalContext.reports.some((report) => report.exitCode !== 0)) {
      throw new TypeError('Some tasks failed');
    }
  }

  /**
   * Returns the resolved path alongside the data: the self-invocation message names the
   * file the offending action came from, and by the time `run()` has the data the path
   * is otherwise gone.
   */
  private async validateData(config: string): Promise<{ configFile: string; data: ConfigModelSchema }> {
    const configFile = await findConfigFile(config);

    const dataString = readConfigFile(configFile);
    const data = parseConfigData(configFile, dataString);

    return { configFile, data: ConfigModel.parse(data) };
  }

  protected filterActionsByIds(actions: ActionModelSchema[], requestedIds: string[]): ActionModelSchema[] {
    // Check for duplicate IDs in configuration
    const idCounts = new Map<string, number>();
    for (const action of actions) {
      if (action.id) {
        idCounts.set(action.id, (idCounts.get(action.id) || 0) + 1);
      }
    }

    const duplicateIds = [...idCounts].filter(([, count]) => count > 1).map(([id]) => id);

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
      throw new Error(`The following action IDs were not found: ${missingIds.join(', ')}.\nAvailable IDs: ${availableIdsList || '(none - no actions have IDs defined)'}`);
    }

    // Warn about actions without IDs that will be excluded
    const actionsWithoutIds = actions.filter((action) => action.id === undefined);
    if (actionsWithoutIds.length > 0) {
      Logger.warn(`Warning: Some actions do not have IDs defined and will be excluded.\nActions without IDs: ${actionsWithoutIds.map((a) => a.label).join(', ')}`);
      Logger.skipLine();
    }

    // Filter to only requested IDs (preserving order from configuration)
    return actions.filter((action) => action.id && requestedIds.includes(action.id));
  }
}
