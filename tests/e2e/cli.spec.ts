import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeAction, runCLI, withProject, withTemporaryDirectory, writeLocalBin } from './helpers/cli.js';

/** A bare project root: enough for `getRootDirectoryPath`, with no `.concatenate/`. */
async function writePackageJSON(directory: string, version = '1.0.0'): Promise<void> {
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'e2e-fixture', version }), { encoding: 'utf8' });
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const packageJSON = JSON.parse(readFileSync(path.join(root, 'package.json'), { encoding: 'utf8' })) as {
  version: string;
};

// Every case pays the CLI boot cost (see #2), so the suite runs concurrently: wall
// time is bounded by the slowest single case rather than by their sum.
describe.concurrent('concatenate', () => {
  it('reports its version', async () => {
    const { exitCode, stdout } = await runCLI(['--version']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain(packageJSON.version);
  });

  // Regression for #1: readPackageSync() resolved from process.cwd(), so --version
  // reported the *consuming* project's version.
  it('reports its own version from a foreign cwd, not the caller’s', async () => {
    const { exitCode, stdout } = await withTemporaryDirectory(async (directory) => {
      await writePackageJSON(directory, '9.9.9');
      return runCLI(['--version'], { cwd: directory });
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain(packageJSON.version);
    expect(stdout).not.toContain('9.9.9');
  });

  it('lists its commands', async () => {
    const { exitCode, stdout } = await runCLI(['--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('setup');
  });

  // Regression for #1: the banner and the screen clear were emitted from run(), so
  // they landed on stdout before commander had even parsed the invocation.
  it('writes no banner and no ANSI escapes on --version', async () => {
    const { stdout } = await runCLI(['--version']);

    expect(stdout.trim()).toBe(packageJSON.version);
    expect(stdout).not.toContain('[CONCATENATE]');
    expect(stdout).not.toContain('[2J');
  });

  it('writes no banner and no ANSI escapes on --help', async () => {
    const { stdout } = await runCLI(['--help']);

    expect(stdout).not.toContain('[CONCATENATE]');
    expect(stdout).not.toContain('[2J');
  });

  describe('running a config', () => {
    it('runs every action and exits 0 when they all pass', async () => {
      await withProject(
        {
          files: { 'ok.mjs': 'console.log("first ran");', 'ok2.mjs': 'console.log("second ran");' },
          configs: {
            'default.yaml': `type: parallel\nactions:\n${nodeAction('one', 'First action', 'ok.mjs')}${nodeAction('two', 'Second action', 'ok2.mjs')}`,
          },
        },
        async (directory) => {
          const { exitCode, stdout } = await runCLI(['default'], { cwd: directory });

          expect(exitCode).toBe(0);
          expect(stdout).toContain('first ran');
          expect(stdout).toContain('second ran');
        },
      );
    });

    // The summary is the only place a silent action's duration is visible: the detailed
    // blocks below it skip any action that printed nothing.
    it('times every action, including the ones that print nothing', async () => {
      await withProject(
        {
          files: { 'quiet.mjs': '', 'loud.mjs': 'console.log("some output");' },
          configs: {
            'default.yaml': `type: series\nactions:\n${nodeAction('quiet', 'Quiet action', 'quiet.mjs')}${nodeAction('loud', 'Loud action', 'loud.mjs')}`,
          },
        },
        async (directory) => {
          const { exitCode, stdout } = await runCLI(['default'], { cwd: directory });

          expect(exitCode).toBe(0);
          // Both appear in the summary with a duration, even the one with no output.
          expect(stdout).toMatch(/Quiet action\s+\d/);
          expect(stdout).toMatch(/Loud action\s+\d/);
        },
      );
    });

    it('exits non-zero and surfaces the output when an action fails', async () => {
      await withProject(
        {
          files: { 'boom.mjs': 'console.log("the failing output"); process.exit(3);' },
          configs: { 'default.yaml': `type: series\nactions:\n${nodeAction('boom', 'Failing action', 'boom.mjs')}` },
        },
        async (directory) => {
          const { exitCode, stdout } = await runCLI(['default'], { cwd: directory });

          expect(exitCode).not.toBe(0);
          expect(stdout).toContain('the failing output');
        },
      );
    });

    it('runs only the requested action ids', async () => {
      await withProject(
        {
          files: { 'a.mjs': 'console.log("action A");', 'b.mjs': 'console.log("action B");' },
          configs: {
            'default.yaml': `type: series\nactions:\n${nodeAction('a', 'Action A', 'a.mjs')}${nodeAction('b', 'Action B', 'b.mjs')}`,
          },
        },
        async (directory) => {
          const { exitCode, stdout } = await runCLI(['default', 'a'], { cwd: directory });

          expect(exitCode).toBe(0);
          expect(stdout).toContain('action A');
          expect(stdout).not.toContain('action B');
        },
      );
    });

    it('fails on an unknown action id', async () => {
      await withProject(
        {
          files: { 'a.mjs': 'console.log("action A");' },
          configs: { 'default.yaml': `type: series\nactions:\n${nodeAction('a', 'Action A', 'a.mjs')}` },
        },
        async (directory) => {
          const { exitCode } = await runCLI(['default', 'nope'], { cwd: directory });

          expect(exitCode).not.toBe(0);
        },
      );
    });

    it('fails on a config that does not match the schema', async () => {
      await withProject({ configs: { 'default.yaml': 'type: sideways\nactions: []\n' } }, async (directory) => {
        const { exitCode } = await runCLI(['default'], { cwd: directory });

        expect(exitCode).not.toBe(0);
      });
    });

    it('fails on a missing config file', async () => {
      await withProject({ configs: {} }, async (directory) => {
        const { exitCode } = await runCLI(['nothing-here'], { cwd: directory });

        expect(exitCode).not.toBe(0);
      });
    });

    it('fails on a config whose extension it cannot parse', async () => {
      await withProject({ configs: { 'default.txt': 'type: series\nactions: []\n' } }, async (directory) => {
        const { exitCode, stdout } = await runCLI(['default'], { cwd: directory });

        expect(exitCode).not.toBe(0);
        expect(stdout).toContain('Unsupported file type');
      });
    });

    it('fails on duplicate action ids', async () => {
      await withProject(
        {
          files: { 'a.mjs': 'console.log("a");' },
          configs: {
            'default.yaml': `type: series\nactions:\n${nodeAction('same', 'First', 'a.mjs')}${nodeAction('same', 'Second', 'a.mjs')}`,
          },
        },
        async (directory) => {
          const { exitCode, stdout } = await runCLI(['default', 'same'], { cwd: directory });

          expect(exitCode).not.toBe(0);
          expect(stdout).toContain('Duplicate action IDs');
        },
      );
    });

    it('fails outside any .concatenate directory', async () => {
      const { exitCode } = await withTemporaryDirectory(async (directory) => {
        await writePackageJSON(directory);
        return runCLI(['default'], { cwd: directory });
      });

      expect(exitCode).not.toBe(0);
    });
  });

  // json5 is a CommonJS default export destructured at module scope, which is the kind
  // of thing that works in source and breaks once compiled. Nothing else exercises it.
  describe('config formats', () => {
    it('reads a .json config', async () => {
      await withProject(
        {
          files: { 'a.mjs': 'console.log("json config ran");' },
          configs: {
            'plain.json': JSON.stringify({ type: 'series', actions: [{ id: 'a', label: 'Action A', command: 'node a.mjs' }] }),
          },
        },
        async (directory) => {
          const { exitCode, stdout } = await runCLI(['plain'], { cwd: directory });

          expect(exitCode).toBe(0);
          expect(stdout).toContain('json config ran');
        },
      );
    });

    it('reads a .json5 config, comments and trailing commas included', async () => {
      await withProject(
        {
          files: { 'a.mjs': 'console.log("json5 config ran");' },
          configs: {
            'loose.json5': `{\n  // a comment json cannot carry\n  type: 'series',\n  actions: [{ id: 'a', label: 'Action A', command: 'node a.mjs' },],\n}\n`,
          },
        },
        async (directory) => {
          const { exitCode, stdout } = await runCLI(['loose'], { cwd: directory });

          expect(exitCode).toBe(0);
          expect(stdout).toContain('json5 config ran');
        },
      );
    });
  });

  describe('execution mode', () => {
    it('stops at the first failure in series', async () => {
      await withProject(
        {
          files: { 'boom.mjs': 'process.exit(3);', 'after.mjs': 'console.log("ran after the failure");' },
          configs: {
            'default.yaml': `type: series\nactions:\n${nodeAction('boom', 'Failing action', 'boom.mjs')}${nodeAction('after', 'Later action', 'after.mjs')}`,
          },
        },
        async (directory) => {
          const { exitCode, stdout } = await runCLI(['default'], { cwd: directory });

          expect(exitCode).not.toBe(0);
          expect(stdout).not.toContain('ran after the failure');
        },
      );
    });

    it('runs every action in parallel even when one fails', async () => {
      await withProject(
        {
          files: { 'boom.mjs': 'process.exit(3);', 'other.mjs': 'console.log("the other one still ran");' },
          configs: {
            'default.yaml': `type: parallel\nactions:\n${nodeAction('boom', 'Failing action', 'boom.mjs')}${nodeAction('other', 'Other action', 'other.mjs')}`,
          },
        },
        async (directory) => {
          const { exitCode, stdout } = await runCLI(['default'], { cwd: directory });

          expect(exitCode).not.toBe(0);
          expect(stdout).toContain('the other one still ran');
        },
      );
    });
  });

  // Regression: execa does not put node_modules/.bin on PATH by default, so without
  // preferLocal a globally installed CLI cannot run the checked project's own tools.
  it("resolves a command from the checked project's node_modules/.bin", async () => {
    await withProject(
      {
        configs: { 'default.yaml': `type: series\nactions:\n  - id: local\n    label: Local binary\n    command: e2etool\n` },
      },
      async (directory) => {
        await writeLocalBin(directory, 'e2etool', 'the local binary ran');

        const { exitCode, stdout } = await runCLI(['default'], { cwd: directory });

        expect(exitCode).toBe(0);
        expect(stdout).toContain('the local binary ran');
      },
    );
  });

  // Without the guard, enquirer waits on a stdin that never produces anything and the
  // process hangs until the job times out.
  it('fails instead of hanging when no file is given and stdin is not a TTY', async () => {
    await withProject({ configs: {} }, async (directory) => {
      const { exitCode, stdout } = await runCLI([], { cwd: directory });

      expect(exitCode).not.toBe(0);
      expect(stdout).toContain('not a TTY');
    });
  });

  describe('setup', () => {
    it('writes both default config files', async () => {
      await withTemporaryDirectory(async (directory) => {
        await writePackageJSON(directory);

        const { exitCode } = await runCLI(['setup', 'yaml'], { cwd: directory });
        expect(exitCode).toBe(0);

        const read = async (file: string): Promise<string> => readFile(path.join(directory, '.concatenate', file), { encoding: 'utf8' });

        expect(await read('check.yaml')).toContain('eslint');
        expect(await read('fix.yaml')).toContain('prettier');
      });
    });

    it('writes json config files when asked for json', async () => {
      await withTemporaryDirectory(async (directory) => {
        await writePackageJSON(directory);

        const { exitCode } = await runCLI(['setup', 'json'], { cwd: directory });
        expect(exitCode).toBe(0);

        const raw = await readFile(path.join(directory, '.concatenate', 'check.json'), { encoding: 'utf8' });
        expect(() => JSON.parse(raw)).not.toThrow();
      });
    });

    it('rejects an unsupported extension', async () => {
      await withTemporaryDirectory(async (directory) => {
        await writePackageJSON(directory);

        const { exitCode } = await runCLI(['setup', 'toml'], { cwd: directory });

        expect(exitCode).not.toBe(0);
      });
    });
  });
});
