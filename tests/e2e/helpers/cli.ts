import { execa } from 'execa';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Exported so a fixture can put the real CLI behind a `command:` -- the self-invocation
 * cases need concatenate to spawn itself without relying on a global install.
 */
export const binPath = path.join(root, 'bin/run.js');

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
  const result = await execa(process.execPath, [binPath, ...arguments_], {
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

/** Writes one fixture file, creating the directories its key implies. */
async function writeFixture(base: string, name: string, content: string): Promise<void> {
  // Keys are relative paths, not bare filenames: `shared/lint.yaml` has to land in a
  // subdirectory that does not exist yet. Always posix-separated on the way in, so
  // path.join normalises them for the platform.
  const target = path.join(base, name);

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, { encoding: 'utf8' });
}

/**
 * Builds a throwaway project: a package.json so `getRootDirectoryPath` resolves, and a
 * `.concatenate/` holding the config files. Both maps accept nested keys.
 */
export async function withProject(project: Project, callback: (directory: string) => Promise<void>): Promise<void> {
  await withTemporaryDirectory(async (directory) => {
    await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'e2e-fixture', version: '1.0.0' }), { encoding: 'utf8' });
    // Explicit, so a fixture with no configs at all still gets the directory: the
    // "missing config file" case depends on `.concatenate/` existing but being empty.
    await mkdir(path.join(directory, '.concatenate'), { recursive: true });

    // Hoisted: `unicorn/no-unreadable-for-of-expression` rejects the `?? {}` inline.
    const rootFiles = Object.entries(project.files ?? {});
    for (const [name, content] of rootFiles) {
      await writeFixture(directory, name, content);
    }

    for (const [name, content] of Object.entries(project.configs)) {
      await writeFixture(path.join(directory, '.concatenate'), name, content);
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
 * A leaf action invoking `node <script>`. Deliberately not `process.execPath`: on
 * Windows that is `C:\Program Files\nodejs\node.exe`, and `parseCommandString` splits on
 * whitespace, so the space would break the command in two. Bare `node` resolves
 * through the inherited PATH instead.
 *
 * `indent` is the column of the `-`, defaulting to the top-level `actions:` depth so the
 * flat cases read unchanged. A leaf nested one level down takes the parent's indent + 4.
 */
export function nodeAction(id: string, label: string, script: string, indent = 2): string {
  const pad = ' '.repeat(indent);

  return `${pad}- id: ${id}\n${pad}  label: ${label}\n${pad}  command: node ${script}\n`;
}

/**
 * A group action: the same head as a leaf, with `children:` instead of `command:`.
 *
 * `body` is emitted verbatim, so the caller owns its indentation -- build it from
 * `nodeAction`/`groupAction` at `indent + 4`, which is where a sequence under a
 * `children:` key sitting at `indent + 2` has to start.
 */
export function groupAction(id: string, label: string, body: string, options: { indent?: number; type?: 'parallel' | 'series' } = {}): string {
  const { indent = 2, type } = options;
  const pad = ' '.repeat(indent);
  // Omitted rather than defaulted to `series`: a fixture has to be able to exercise the
  // group-level default, which it cannot do if the helper always writes the key.
  const typeLine = type === undefined ? '' : `${pad}  type: ${type}\n`;

  return `${pad}- id: ${id}\n${pad}  label: ${label}\n${typeLine}${pad}  children:\n${body}`;
}
