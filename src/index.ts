import { program } from 'commander';
import { readFileSync } from 'node:fs';
import { ZodError } from 'zod';
import { CommandRunner } from './controllers/command-runner.js';
import { SetupRunner } from './controllers/setup-runner.js';
import { getConfigFile } from './helpers/config-selector.js';
import { Logger } from './helpers/logger.js';
import type { SetupFileExtensionType } from './models/command-model.js';

// Résolu depuis l'emplacement du module, pas depuis process.cwd() : sinon `--version`
// et `--help` rapportent le package du projet qui invoque concatenate. src/ et dist/
// sont tous deux à un niveau sous la racine, donc le chemin vaut en dev comme en build.
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
    if (!file) {
      Logger.warn('No file provded. Selecting a file...');
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
    }

    if (error instanceof Error) {
      Logger.error(error.message);
      return 1;
    }
  }

  return 0;
}
