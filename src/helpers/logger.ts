import chalk from 'chalk';
import { createLogUpdate } from 'log-update';

function print(message: string): void {
  const log = createLogUpdate(process.stdout, {
    showCursor: true,
  });

  log(message);
  log.done();
}

function clear(): void {
  process.stdout.write('\u001B[2J');
  process.stdout.write('\u001B[0f');
}

function println(message: string): void {
  print(`${message}\n`);
}

function skipLine(): void {
  println('');
}

function error(message: string): void {
  println(chalk.bold.red('[ERROR] ') + message);
}

function warn(message: string): void {
  println(chalk.bold.yellow('[WARN] ') + message);
}

function info(message: string): void {
  println(chalk.bold.blueBright('[INFO] ') + message);
}

function success(message: string): void {
  println(chalk.bold.green('[SUCCESS] ') + message);
}

function title(message: string): void {
  println(chalk.bold.magentaBright('[CONCATENATE] ') + message);
}

export const Logger = {
  print: print,
  println: println,
  skipLine: skipLine,
  clear: clear,
  title: title,
  success: success,
  error: error,
  warn: warn,
  info: info,
};
