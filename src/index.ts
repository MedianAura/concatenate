import { program } from 'commander';
import { readPackageSync } from 'read-pkg';
import { ZodError } from 'zod';
import { CommandRunner } from './controllers/command-runner.js';
import { SetupRunner } from './controllers/setup-runner.js';
import { getConfigFile } from './helpers/config-selector.js';
import { Logger } from './helpers/logger.js';
import type { SetupFileExtensionType } from './models/command-model.js';

const packageJSON = await readPackageSync();

program
  .name(packageJSON.name)
  .description(packageJSON.description ?? '')
  .version(packageJSON.version)
  .argument('[file]', 'command file to execute')
  .action(async (file: string) => {
    try {
      if (!file) {
        Logger.warn('No file provded. Selecting a file...');
        file = await getConfigFile();

        Logger.skipLine();
      }

      Logger.title(`Running file: ${file}`);
      await new CommandRunner().run(file);
    } catch (error: unknown) {
      if (error instanceof Error) {
        Logger.error(error.message);
      }
    }
  });

program
  .command('setup')
  .description('create default configuration files')
  .argument('<extension>', 'File type to create.')
  .action(async (extension: SetupFileExtensionType) => {
    try {
      await new SetupRunner().run(extension);
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        Logger.error("The extension provided doesn't match the expected format.");

        for (const message of error.format()._errors) {
          Logger.error(message);
        }
      } else if (error instanceof Error) {
        Logger.error(error.message);
      }
    }
  });

program
  .command('branch')
  .description('create a git branch')
  .argument('<branch>', 'name of the branch to create.')
  .action((branch: string) => {
    console.log(branch);
  });

export async function run(): Promise<void> {
  Logger.clear();
  Logger.title('Welcome to Concatenate CLI');

  try {
    program.parse();
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(error.message);
    }
  }
}
