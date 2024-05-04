import { program } from 'commander';
import { readPackageSync } from 'read-pkg';
import { CommandRunner } from './controllers/command-runner.js';

const packageJSON = await readPackageSync();

program
  .name(packageJSON.name)
  .description(packageJSON.description ?? '')
  .version(packageJSON.version)
  .argument('[file]', 'command file to execute')
  .option('-a, --automate', 'automate the process')
  .action(async (file: string, _options: { automate: boolean }) => {
    await new CommandRunner().run(file, _options);
  });

program
  .command('branch')
  .description('create a  git branch')
  .argument('<branch>', 'name of the branch to create.')
  .action((branch: string) => {
    console.log(branch);
  });

export async function run(): Promise<void> {
  program.parse();
}
