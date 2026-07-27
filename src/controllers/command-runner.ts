import chalk from 'chalk';
import { execa, ExecaError, parseCommandString, type Result } from 'execa';
import { Listr, type ListrTask, parseTimer, PRESET_TIMER } from 'listr2';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { filterTree } from '../helpers/action-filter.js';
import { findConfigFile } from '../helpers/config-file.js';
import { Logger } from '../helpers/logger.js';
import { getConcatenateDirectoryPath } from '../helpers/root-directory-path.js';
import { assertNoSelfInvocation } from '../helpers/self-invocation.js';
import { type ResolvedNode, walkLeaves } from '../models/config-tree.js';
import { loadFile } from './config-loader.js';

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
    const configFile = await findConfigFile(config);
    const tree = loadFile(configFile);

    // Relative to the project root: findConfigFile returns an absolute path, and an
    // absolute path in a message is noise the reader has to skip past to find the two
    // segments that identify the file.
    const projectRoot = path.resolve(getConcatenateDirectoryPath(), '..');

    // Over the whole resolved tree, before filtering: an action the user did not select
    // is still a config defect, and an imported file is scanned exactly like an inline
    // one -- which is the only reason `import` is not a way around the guard.
    assertNoSelfInvocation(
      [...walkLeaves(tree.nodes)].map((leaf) => ({
        command: leaf.command,
        labelPath: leaf.labelPath,
        file: path.relative(projectRoot, leaf.file),
      })),
    );

    // Dotted paths address the whole tree: `check tsc.eslint` selects one nested leaf and
    // keeps the group around it as a spine.
    const nodes = actionIds && actionIds.length > 0 ? filterTree(tree.nodes, actionIds) : tree.nodes;

    // Read once, not per action: every action of a run sits at the same depth.
    const currentDepth = Number(process.env.CONCATENATE_DEPTH ?? '0') || 0;

    const globalContext = { reports: [] as ListrContextReport[] };

    const tasks = new Listr<ListrContext>(this.buildTasks(nodes, currentDepth), {
      concurrent: tree.type === 'parallel',
      exitOnError: tree.type === 'series',
      rendererOptions: {
        showErrorMessage: false,
        // Live per-task duration. Checks are the kind of thing you watch, and knowing
        // which action is the slow one is most of why you would watch.
        timer: PRESET_TIMER,
      },
      // Set once, at the root. Deliberately omitted from every `newListr` below:
      // subtasks inherit the parent ctx, which is what makes the shared `reports` array
      // work with no plumbing.
      ctx: globalContext,
    });

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
   * Per-node mapping of the rule that used to apply only at the root: a group's own
   * `type` decides whether its children run concurrently and whether it stops at the
   * first failure. The useful consequence is that a `series` group inside a `parallel`
   * root stops at its first failure while its siblings keep running.
   */
  private buildTasks(nodes: ResolvedNode[], currentDepth: number): ListrTask<ListrContext>[] {
    return nodes.map((node) => {
      if (node.kind === 'group') {
        return {
          title: node.label,
          task: (_context, task): Listr<ListrContext> =>
            task.newListr(this.buildTasks(node.children, currentDepth), {
              concurrent: node.type === 'parallel',
              exitOnError: node.type === 'series',
              // Subtasks stay expanded: collapsed, a failing leaf is reported under its
              // group's title and the run gives no way to tell which child failed.
              rendererOptions: { collapseSubtasks: false, showErrorMessage: false },
            }),
        };
      }

      // Breadcrumbs, so a report line identifies a nested action unambiguously. ASCII
      // `>` rather than the U+203A chevron: these land in CI logs and Windows consoles.
      const title = node.labelPath.join(' > ');

      return {
        title: node.label,
        task: async (context): Promise<void> => {
          try {
            // execa 10 removed `execaCommand`: same shell-less splitting, in two steps.
            const [file, ...commandArguments] = parseCommandString(node.command);
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

            handleOutput(status, title, context);
          } catch (error: unknown) {
            handleOutput(error as ExecaError, title, context);
            throw new Error(title, { cause: error });
          }
        },
      };
    });
  }
}
