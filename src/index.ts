import { program } from 'commander';
import { readFileSync } from 'node:fs';
import { ZodError } from 'zod';
import { CommandRunner } from './controllers/command-runner.js';
import { SetupRunner } from './controllers/setup-runner.js';
import { getConfigFile } from './helpers/config-selector.js';
import { Logger } from './helpers/logger.js';
import type { SetupFileExtensionType } from './models/command-model.js';

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
      file = await getConfigFile();

      Logger.skipLine();
    }

    Logger.title(`Running file: ${file}`);
    await new CommandRunner().run(file, actionIds);
  });

program
  .command('setup')
  .description('create default configuration files')
  .argument('<extension>', 'File type to create.')
  .action(async (extension: SetupFileExtensionType) => {
    await new SetupRunner().run(extension);
  });

export async function run(): Promise<number> {
  try {
    await program.parseAsync();
  } catch (error: unknown) {
    Logger.skipLine();

    if (error instanceof ZodError) {
      Logger.error(`The extension provided doesn't match the expected format.`);

      for (const message of error.format()._errors) {
        Logger.error(message);
      }
      return 4;
    }

    if (error instanceof Error) {
      Logger.error(error.message);
      return 1;
    }
  }

  return 0;
}
