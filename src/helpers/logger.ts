import chalk from 'chalk';

function print(message: string): void {
  // Was `createLogUpdate(...)` followed immediately by `log.done()`, which never redrew
  // anything -- so log-update contributed only its hard wrap at the terminal width.
  // Outside a TTY that width is 80, and it broke messages mid-word:
  //
  //   [ERROR] Import "./other" in .concatenate/default.yaml must include a file exte
  //   nsion
  //
  // A plain write leaves wrapping to the terminal, which knows its own width.
  process.stdout.write(message);
}

function clear(): void {
  // Clearing the screen is a terminal operation. On a pipe or a file the ANSI escapes
  // are corruption, not formatting -- they land in CI logs and in anything parsing
  // stdout. The guard lives here so no caller has to remember it.
  if (!process.stdout.isTTY) return;

  process.stdout.write('\u{1B}[2J');
  process.stdout.write('\u{1B}[0f');
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
