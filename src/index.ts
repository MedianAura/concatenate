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
    if (!file) {
      Logger.warn('No file provded. Selecting a file...');
      file = await getConfigFile();

      Logger.skipLine();
    }

    Logger.title(`Running file: ${file}`);
    await new CommandRunner().run(file);
  });

program
  .command('setup')
  .description('create default configuration files')
  .argument('<extension>', 'File type to create.')
  .action(async (extension: SetupFileExtensionType) => {
    await new SetupRunner().run(extension);
  });

export async function run(): Promise<number> {
  Logger.clear();
  Logger.title('Welcome to Concatenate CLI');

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
    } else if (error instanceof Error) {
      Logger.error(error.message);
      return 1;
    }
  }

  return 0;
}
