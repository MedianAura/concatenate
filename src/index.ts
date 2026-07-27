import { program } from 'commander';
import { readFileSync } from 'node:fs';
import { SelfInvocationError } from './helpers/errors.js';
import { Logger } from './helpers/logger.js';
import type { SetupFileExtensionType } from './models/command-model.js';

// Everything below this line is imported where it is used, not here. Commander decides
// what the invocation is before any handler runs, so `--version` and `--help` have no
// reason to pay for the runners: `controllers/command-runner.js` alone is ~720 ms of
// graph, against a ~137 ms process floor.
//
// The specifiers stay string literals so TypeScript still resolves them -- a typo is
// TS2307 at build time, not a command that silently stops working at runtime. `Logger`
// and `errors.js` stay static: chalk is ~25 ms and errors.js has no dependencies.

// Resolved from the module location, not process.cwd(): otherwise `--version` and
// `--help` report the package of the project invoking concatenate. src/ and dist/ are
// both one level under the root, so the relative path holds in dev and in the build.
const packageJSON = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), { encoding: 'utf8' })) as {
  description?: string;
  name: string;
  version: string;
};

program
  .name(packageJSON.name)
  .description(packageJSON.description ?? '')
  .version(packageJSON.version)
  .argument('[file]', 'command file to execute')
  .argument('[actionIds...]', 'action IDs to execute (space-separated)')
  .action(async (file: string, actionIds: string[] | undefined) => {
    // Before the banner, and before anything else: a nested invocation must not clear
    // the parent's screen on its way out. The parent sets CONCATENATE_ACTIVE on every
    // action it spawns, so reaching here with it set means concatenate is running
    // inside concatenate -- through however many layers of npm scripts.
    if (process.env.CONCATENATE_ACTIVE === '1' && process.env.CONCATENATE_ALLOW_NESTED !== '1') {
      throw new SelfInvocationError(
        'Avoid using concatenate within itself, use import instead for better CLI flow.\n' +
          '  Set CONCATENATE_ALLOW_NESTED=1 if a nested project legitimately runs its own concatenate.',
      );
    }

    // The banner belongs to the command that actually runs something. Emitting it from
    // `run()` meant `--version` and `--help` cleared the screen and printed a welcome
    // line before commander had decided what the invocation even was.
    Logger.clear();
    Logger.title('Welcome to Concatenate CLI');

    if (!file) {
      // Without a TTY the enquirer prompt has nothing to read and hangs until the job
      // times out. Failing with a usable message beats blocking a CI run.
      if (!process.stdin.isTTY) {
        throw new Error('No file provided. Pass one as an argument: stdin is not a TTY, so the file cannot be selected interactively.');
      }

      Logger.warn('No file provided. Selecting a file...');
      // enquirer, and only on the interactive branch that actually prompts.
      const { getConfigFile } = await import('./helpers/config-selector.js');
      file = await getConfigFile();

      Logger.skipLine();
    }

    Logger.title(`Running file: ${file}`);

    const { CommandRunner } = await import('./controllers/command-runner.js');
    await new CommandRunner().run(file, actionIds);
  });

program
  .command('setup')
  .description('create default configuration files')
  .argument('<extension>', 'File type to create.')
  .action(async (extension: SetupFileExtensionType) => {
    const { SetupRunner } = await import('./controllers/setup-runner.js');
    await new SetupRunner().run(extension);
  });

export async function run(): Promise<number> {
  try {
    await program.parseAsync();
  } catch (error: unknown) {
    Logger.skipLine();

    // Checked before the ZodError branch, not after, so the common failure paths never
    // load zod. The order is safe either way -- neither class is an instance of the
    // other -- and it keeps `instanceof` rather than sniffing `error.name`.
    //
    // Ahead of the generic Error branch, which would otherwise swallow it into exit 1.
    // The codes are the contract: 1 a task failed, 4 the config is malformed, 5 the
    // config asks concatenate to run itself.
    if (error instanceof SelfInvocationError) {
      Logger.error(error.message);
      return 5;
    }

    // ~104 ms, and only reachable once something has already failed.
    const { prettifyError, ZodError } = await import('zod');

    if (error instanceof ZodError) {
      // Deliberately says neither "config file" nor "extension": the same branch catches
      // `setup toml`, whose ZodError is about the extension argument, and a malformed
      // config, whose ZodError is about a field. Naming either one makes the message a
      // lie half the time. prettifyError below carries what actually failed.
      Logger.error('The provided input does not match the expected format.');

      // Not `format()._errors`: that array only ever holds issues attached to the root
      // of the schema, so every issue with a path -- which is all of them for a config
      // -- reported as nothing at all. prettifyError walks the issue list and prints
      // the dotted path with each message.
      //
      // println rather than error: the output is multi-line and its second line is an
      // indented `→ at <path>`, which the `[ERROR] ` prefix would knock out of
      // alignment on every line but the first.
      Logger.skipLine();
      Logger.println(prettifyError(error));
      return 4;
    }

    if (error instanceof Error) {
      Logger.error(error.message);
      return 1;
    }
  }

  return 0;
}
