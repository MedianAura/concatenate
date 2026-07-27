import { execa } from 'execa';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const bin = path.join(root, 'bin/run.js');

export interface CLIResult {
  exitCode: number | undefined;
  stderr: string;
  stdout: string;
}

/**
 * Runs the built CLI in a subprocess. `reject: false` because the expected-failure
 * cases assert on `exitCode` rather than catching a throw.
 */
export async function runCLI(arguments_: string[], options: { cwd?: string } = {}): Promise<CLIResult> {
  const result = await execa(process.execPath, [bin, ...arguments_], {
    cwd: options.cwd ?? root,
    reject: false,
    // Always piped, so `isTTY` is false in the subprocess -- which is exactly what the
    // non-interactive and no-banner cases are checking.
    input: '',
    env: {
      // update-notifier hits the npm registry and writes to a global cache.
      NO_UPDATE_NOTIFIER: '1',
      NODE_ENV: 'test',
    },
  });

  // execa types stdout/stderr as a union; pin them to strings so cases can assert
  // directly.
  return {
    exitCode: result.exitCode,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
  };
}

/** Throwaway directory outside any git repository. */
export async function withTemporaryDirectory<T>(callback: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(path.join(tmpdir(), 'concatenate-e2e-'));

  try {
    return await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export interface Project {
  /** Files written at the project root, e.g. the scripts the actions invoke. */
  files?: Record<string, string>;
  /** Files written into `.concatenate/`, keyed by filename. */
  configs: Record<string, string>;
}

/**
 * Builds a throwaway project: a package.json so `getRootDirectoryPath` resolves, and a
 * `.concatenate/` holding the config files.
 */
export async function withProject(project: Project, callback: (directory: string) => Promise<void>): Promise<void> {
  await withTemporaryDirectory(async (directory) => {
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'e2e-fixture', version: '1.0.0' }), { encoding: 'utf8' });
    await mkdir(path.join(directory, '.concatenate'), { recursive: true });

    const rootFiles = Object.entries(project.files ?? {});
    for (const [name, content] of rootFiles) {
      await writeFile(path.join(directory, name), content, { encoding: 'utf8' });
    }

    for (const [name, content] of Object.entries(project.configs)) {
      await writeFile(path.join(directory, '.concatenate', name), content, { encoding: 'utf8' });
    }

    await callback(directory);
  });
}

/**
 * Writes an executable into the fixture's `node_modules/.bin`, so a bare command name
 * resolves only if execa was given `preferLocal`. Platform-specific because that is
 * what makes a file executable: a `.cmd` shim found through PATHEXT on Windows, a
 * mode-0755 shell script elsewhere.
 */
export async function writeLocalBin(directory: string, name: string, message: string): Promise<void> {
  const binDirectory = path.join(directory, 'node_modules', '.bin');
  await mkdir(binDirectory, { recursive: true });

  await (process.platform === 'win32'
    ? writeFile(path.join(binDirectory, `${name}.cmd`), `@echo off\r\necho ${message}\r\n`, { encoding: 'utf8' })
    : writeFile(path.join(binDirectory, name), `#!/bin/sh\necho "${message}"\n`, { encoding: 'utf8', mode: 0o755 }));
}

/**
 * An action invoking `node <script>`. Deliberately not `process.execPath`: on Windows
 * that is `C:\Program Files\nodejs\node.exe`, and `parseCommandString` splits on
 * whitespace, so the space would break the command in two. Bare `node` resolves
 * through the inherited PATH instead.
 */
export function nodeAction(id: string, label: string, script: string): string {
  return `  - id: ${id}\n    label: ${label}\n    command: node ${script}\n`;
}
