import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYAML } from 'yaml';
import { binPath, groupAction, nodeAction, runCLI, withProject, withTemporaryDirectory, writeLocalBin } from './helpers/cli.js';

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
        const { exitCode, stdout } = await runCLI(['default'], { cwd: directory });

        expect(exitCode).toBe(4);
        expect(stdout).toContain('type');
      });
    });

    // Regression for #5: format()._errors only carries issues attached to the schema
    // root, so every nested issue -- which is every issue a real config produces --
    // printed a lead line and nothing else. The path is the whole point of the message.
    it('names the offending field for a nested schema error', async () => {
      await withProject({ configs: { 'default.yaml': 'type: series\nactions:\n  - id: a\n    label: Action A\n' } }, async (directory) => {
        const { exitCode, stdout } = await runCLI(['default'], { cwd: directory });

        expect(exitCode).toBe(4);
        expect(stdout).toContain('actions[0]');
        // The union cannot say which member was meant, so the schema supplies the
        // message instead of leaving zod's bare "Invalid input".
        expect(stdout).toContain('exactly one of: command');
        // The old lead line blamed the file extension no matter what actually failed.
        expect(stdout).not.toContain('extension provided');
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

  describe('nested configurations', () => {
    it('runs a children group as native subtasks', async () => {
      await withProject(
        {
          files: { 'a.mjs': 'console.log("inner ran");', 'b.mjs': 'console.log("sibling ran");' },
          configs: {
            'default.yaml': `type: series\nactions:\n${nodeAction('sibling', 'Sibling', 'b.mjs')}${groupAction('tsc', 'Checking with TSC', nodeAction('eslint', 'Checking with ESLint', 'a.mjs', 6))}`,
          },
        },
        async (directory) => {
          const { exitCode, stdout } = await runCLI(['default'], { cwd: directory });

          expect(exitCode).toBe(0);
          expect(stdout).toContain('inner ran');
          expect(stdout).toContain('sibling ran');
          // Breadcrumbs identify a nested action unambiguously in the report.
          expect(stdout).toContain('Checking with TSC > Checking with ESLint');
        },
      );
    });

    it('runs a sibling import', async () => {
      await withProject(
        {
          files: { 'a.mjs': 'console.log("imported ran");', 'b.mjs': 'console.log("local ran");' },
          configs: {
            'default.yaml': `type: series\nactions:\n${nodeAction('local', 'Local', 'b.mjs')}  - id: shared\n    label: Shared\n    import: ./other.yaml\n`,
            'other.yaml': `type: series\nactions:\n${nodeAction('eslint', 'Imported action', 'a.mjs')}`,
          },
        },
        async (directory) => {
          const { exitCode, stdout } = await runCLI(['default'], { cwd: directory });

          expect(exitCode).toBe(0);
          expect(stdout).toContain('local ran');
          expect(stdout).toContain('imported ran');
          expect(stdout).toContain('Shared > Imported action');
        },
      );
    });

    it('resolves an import from a subdirectory relative to the importing file', async () => {
      await withProject(
        {
          files: { 'a.mjs': 'console.log("subdir import ran");' },
          configs: {
            'default.yaml': `type: series\nactions:\n  - id: shared\n    label: Shared\n    import: ./shared/lint.yaml\n`,
            'shared/lint.yaml': `type: series\nactions:\n${nodeAction('eslint', 'Nested lint', 'a.mjs')}`,
          },
        },
        async (directory) => {
          const { exitCode, stdout } = await runCLI(['default'], { cwd: directory });

          expect(exitCode).toBe(0);
          expect(stdout).toContain('subdir import ran');
        },
      );
    });

    it('fails on an import cycle instead of recursing', async () => {
      await withProject(
        {
          configs: {
            'default.yaml': `type: series\nactions:\n  - label: To other\n    import: ./other.yaml\n`,
            'other.yaml': `type: series\nactions:\n  - label: Back\n    import: ./default.yaml\n`,
          },
        },
        async (directory) => {
          const { exitCode, stdout } = await runCLI(['default'], { cwd: directory });

          expect(exitCode).not.toBe(0);
          expect(stdout).toContain('Import cycle detected');
        },
      );
    });

    it('fails on an import without an extension', async () => {
      await withProject(
        {
          configs: { 'default.yaml': `type: series\nactions:\n  - label: Bad\n    import: ./other\n` },
        },
        async (directory) => {
          const { exitCode, stdout } = await runCLI(['default'], { cwd: directory });

          expect(exitCode).not.toBe(0);
          expect(stdout).toContain('must include a file extension');
        },
      );
    });

    // Per-node mapping of the root rule: the series group stops at its own first failure
    // while its parallel sibling keeps going.
    it('isolates failure inside a series group nested in a parallel root', async () => {
      await withProject(
        {
          files: {
            'boom.mjs': 'process.exit(3);',
            'after.mjs': 'console.log("ran after the failure");',
            'sibling.mjs': 'console.log("sibling kept running");',
          },
          configs: {
            'default.yaml': `type: parallel\nactions:\n${nodeAction('sibling', 'Sibling', 'sibling.mjs')}${groupAction(
              'seq',
              'Sequential group',
              `${nodeAction('boom', 'Failing action', 'boom.mjs', 6)}${nodeAction('after', 'Later action', 'after.mjs', 6)}`,
              { type: 'series' },
            )}`,
          },
        },
        async (directory) => {
          const { exitCode, stdout } = await runCLI(['default'], { cwd: directory });

          expect(exitCode).not.toBe(0);
          expect(stdout).not.toContain('ran after the failure');
          expect(stdout).toContain('sibling kept running');
        },
      );
    });

    // The scan walks the resolved tree, so `import` is not a way around the #7 guard.
    it('refuses a self-invocation that lives in an imported file', async () => {
      await withProject(
        {
          configs: {
            'default.yaml': `type: series\nactions:\n  - label: Shared\n    import: ./shared/lint.yaml\n`,
            'shared/lint.yaml': `type: series\nactions:\n  - label: Loop\n    command: concatenate default\n`,
          },
        },
        async (directory) => {
          const { exitCode, stdout } = await runCLI(['default'], { cwd: directory });

          expect(exitCode).toBe(5);
          expect(stdout).toContain('Shared > Loop');
          // The file named is the one the offending action is actually written in.
          expect(stdout).toContain('.concatenate/shared/lint.yaml');
        },
      );
    });

    // The address space nesting introduces: a dotted path selects one nested action, and
    // the group around it survives as a spine so the run still renders it.
    it('selects a nested action by its dotted path', async () => {
      await withProject(
        {
          files: { 'inner.mjs': 'console.log("inner ran");', 'other.mjs': 'console.log("other inner ran");', 'root.mjs': 'console.log("root ran");' },
          configs: {
            'default.yaml': `type: series\nactions:\n${nodeAction('eslint', 'Root ESLint', 'root.mjs')}${groupAction(
              'tsc',
              'Checking with TSC',
              `${nodeAction('eslint', 'Checking with ESLint', 'inner.mjs', 6)}${nodeAction('prettier', 'Checking with Prettier', 'other.mjs', 6)}`,
            )}`,
          },
        },
        async (directory) => {
          const { exitCode, stdout } = await runCLI(['default', 'tsc.eslint'], { cwd: directory });

          expect(exitCode).toBe(0);
          expect(stdout).toContain('inner ran');
          expect(stdout).not.toContain('other inner ran');
          expect(stdout).not.toContain('root ran');
          // The spine is still rendered around the selected leaf.
          expect(stdout).toContain('Checking with TSC > Checking with ESLint');
        },
      );
    });

    it('selecting a group runs its whole subtree', async () => {
      await withProject(
        {
          files: { 'inner.mjs': 'console.log("inner ran");', 'other.mjs': 'console.log("other inner ran");', 'root.mjs': 'console.log("root ran");' },
          configs: {
            'default.yaml': `type: series\nactions:\n${nodeAction('eslint', 'Root ESLint', 'root.mjs')}${groupAction(
              'tsc',
              'Checking with TSC',
              `${nodeAction('eslint', 'Checking with ESLint', 'inner.mjs', 6)}${nodeAction('prettier', 'Checking with Prettier', 'other.mjs', 6)}`,
            )}`,
          },
        },
        async (directory) => {
          const { exitCode, stdout } = await runCLI(['default', 'tsc'], { cwd: directory });

          expect(exitCode).toBe(0);
          expect(stdout).toContain('inner ran');
          expect(stdout).toContain('other inner ran');
          expect(stdout).not.toContain('root ran');
        },
      );
    });

    // A bare id is the root-level action, never a nested one sharing the name.
    it('selects the root-level action for a bare id that also exists nested', async () => {
      await withProject(
        {
          files: { 'inner.mjs': 'console.log("inner ran");', 'root.mjs': 'console.log("root ran");' },
          configs: {
            'default.yaml': `type: series\nactions:\n${nodeAction('eslint', 'Root ESLint', 'root.mjs')}${groupAction(
              'tsc',
              'Checking with TSC',
              nodeAction('eslint', 'Checking with ESLint', 'inner.mjs', 6),
            )}`,
          },
        },
        async (directory) => {
          const { exitCode, stdout } = await runCLI(['default', 'eslint'], { cwd: directory });

          expect(exitCode).toBe(0);
          expect(stdout).toContain('root ran');
          expect(stdout).not.toContain('inner ran');
        },
      );
    });

    it('lists dotted paths when an id is not found', async () => {
      await withProject(
        {
          files: { 'inner.mjs': 'console.log("x");', 'root.mjs': 'console.log("y");' },
          configs: {
            'default.yaml': `type: series\nactions:\n${nodeAction('eslint', 'Root ESLint', 'root.mjs')}${groupAction(
              'tsc',
              'Checking with TSC',
              nodeAction('eslint', 'Checking with ESLint', 'inner.mjs', 6),
            )}`,
          },
        },
        async (directory) => {
          const { exitCode, stdout } = await runCLI(['default', 'nope'], { cwd: directory });

          expect(exitCode).not.toBe(0);
          expect(stdout).toContain('eslint, tsc, tsc.eslint');
        },
      );
    });

    it('rejects an unknown key in an action', async () => {
      await withProject(
        {
          configs: { 'default.yaml': `type: series\nactions:\n  - label: Typo\n    commmand: eslint .\n` },
        },
        async (directory) => {
          const { exitCode, stdout } = await runCLI(['default'], { cwd: directory });

          expect(exitCode).toBe(4);
          expect(stdout).toContain('actions[0]');
        },
      );
    });
  });

  // Regression for #7: a config invoking concatenate re-read the same file from the same
  // cwd forever, buffering every level's output behind `stdio: 'pipe'`, so the user saw a
  // spinner that never resolved and nothing else. Two independent layers now stop it.
  describe('self-invocation', () => {
    it('refuses a config that runs concatenate, naming the offending action', async () => {
      await withProject(
        {
          files: { 'a.mjs': 'console.log("never runs");' },
          configs: {
            'default.yaml': `type: series\nactions:\n${nodeAction('a', 'Action A', 'a.mjs')}  - id: loop\n    label: Recursive action\n    command: concatenate default\n`,
          },
        },
        async (directory) => {
          const { exitCode, stdout } = await runCLI(['default'], { cwd: directory });

          expect(exitCode).toBe(5);
          expect(stdout).toContain('use import instead');
          expect(stdout).toContain('Recursive action');
          expect(stdout).toContain('.concatenate/default.yaml');
          expect(stdout).toContain('command: concatenate default');
          // The pre-scan runs before anything spawns, so the clean action never ran.
          expect(stdout).not.toContain('never runs');
        },
      );
    });

    // The layer the pre-scan cannot be: the fixture spawns the real bin from a script,
    // so no scan of the `command:` string can see concatenate in it.
    it('exits 5 and names the escape hatch when reached through indirection', async () => {
      await withProject(
        {
          files: {
            'indirect.mjs': `import { spawnSync } from 'node:child_process';\nconst r = spawnSync(process.execPath, [${JSON.stringify(binPath)}, 'default'], { encoding: 'utf8' });\nconsole.log(r.stdout ?? '');\nconsole.log('child exited ' + String(r.status));\n`,
          },
          configs: { 'default.yaml': `type: series\nactions:\n${nodeAction('indirect', 'Indirect action', 'indirect.mjs')}` },
        },
        async (directory) => {
          const { stdout } = await runCLI(['default'], { cwd: directory });

          expect(stdout).toContain('child exited 5');
          expect(stdout).toContain('CONCATENATE_ALLOW_NESTED');
        },
      );
    });

    it('lets a nested run through when CONCATENATE_ALLOW_NESTED is set', async () => {
      await withProject(
        {
          files: { 'env.mjs': 'console.log("active=" + String(process.env.CONCATENATE_ACTIVE) + " depth=" + String(process.env.CONCATENATE_DEPTH));' },
          configs: { 'default.yaml': `type: series\nactions:\n${nodeAction('env', 'Env action', 'env.mjs')}` },
        },
        async (directory) => {
          // Both markers, as a real parent concatenate would set them: ACTIVE is what
          // the guard reads, DEPTH is what the next level increments.
          const { exitCode, stdout } = await runCLI(['default'], {
            cwd: directory,
            env: { CONCATENATE_ACTIVE: '1', CONCATENATE_ALLOW_NESTED: '1', CONCATENATE_DEPTH: '1' },
          });

          expect(exitCode).toBe(0);
          // Depth keeps counting even when the guard is waived, so a legitimately nested
          // run still reports how deep it is.
          expect(stdout).toContain('active=1 depth=2');
        },
      );
    });

    it('marks every action it spawns', async () => {
      await withProject(
        {
          files: { 'env.mjs': 'console.log("active=" + String(process.env.CONCATENATE_ACTIVE) + " depth=" + String(process.env.CONCATENATE_DEPTH));' },
          configs: { 'default.yaml': `type: series\nactions:\n${nodeAction('env', 'Env action', 'env.mjs')}` },
        },
        async (directory) => {
          const { exitCode, stdout } = await runCLI(['default'], { cwd: directory });

          expect(exitCode).toBe(0);
          expect(stdout).toContain('active=1 depth=1');
        },
      );
    });
  });

  // The harness itself, not the CLI. The nesting tasks (#7, #8, #9) all build fixtures
  // on these two seams -- subdirectory config keys and indented group YAML -- and
  // neither is reachable from a case that only runs `concatenate`, because the schema
  // still rejects `children`. Asserting the emitted YAML keeps them honest until #8
  // lands and the same fixture can be executed for real.
  describe('fixture harness', () => {
    it('writes a config into a subdirectory of .concatenate', async () => {
      await withProject(
        {
          files: { 'scripts/a.mjs': 'console.log("nested script");' },
          configs: {
            'shared/lint.yaml': `type: series\nactions:\n${groupAction('tsc', 'Type check', nodeAction('eslint', 'Lint', 'scripts/a.mjs', 6), { type: 'parallel' })}`,
          },
        },
        async (directory) => {
          const raw = await readFile(path.join(directory, '.concatenate', 'shared', 'lint.yaml'), { encoding: 'utf8' });

          expect(parseYAML(raw)).toEqual({
            type: 'series',
            actions: [
              {
                id: 'tsc',
                label: 'Type check',
                type: 'parallel',
                children: [{ id: 'eslint', label: 'Lint', command: 'node scripts/a.mjs' }],
              },
            ],
          });

          // The `files` map creates directories too: the nested leaf points at it.
          await expect(readFile(path.join(directory, 'scripts', 'a.mjs'), { encoding: 'utf8' })).resolves.toContain('nested script');
        },
      );
    });

    it('omits type when the group does not declare one', () => {
      const emitted = groupAction('tsc', 'Type check', nodeAction('eslint', 'Lint', 'a.mjs', 6));

      expect(emitted).not.toContain('type:');
      expect(parseYAML(`actions:\n${emitted}`)).toEqual({
        actions: [{ id: 'tsc', label: 'Type check', children: [{ id: 'eslint', label: 'Lint', command: 'node a.mjs' }] }],
      });
    });

    // Two levels deep, to pin the +4 rule the doc comment states: a group nested inside
    // a group is where an off-by-two silently reparents a child.
    it('nests a group inside a group', () => {
      const leaf = nodeAction('eslint', 'Lint', 'a.mjs', 10);
      const inner = groupAction('quality', 'Quality', leaf, { indent: 6, type: 'series' });
      const outer = groupAction('tsc', 'Type check', inner, { type: 'parallel' });

      expect(parseYAML(`actions:\n${outer}`)).toEqual({
        actions: [
          {
            id: 'tsc',
            label: 'Type check',
            type: 'parallel',
            children: [
              {
                id: 'quality',
                label: 'Quality',
                type: 'series',
                children: [{ id: 'eslint', label: 'Lint', command: 'node a.mjs' }],
              },
            ],
          },
        ],
      });
    });

    // The self-invoke fixtures in #7 need the real bin behind a `command:`.
    it('exposes a bin path that exists', async () => {
      await expect(readFile(binPath, { encoding: 'utf8' })).resolves.toContain('index.js');
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

    // Also the guard on the lazily-imported zod: this is the only command whose failure
    // path resolves `await import('zod')`, and a broken dynamic import fails silently.
    it('rejects an unsupported extension', async () => {
      await withTemporaryDirectory(async (directory) => {
        await writePackageJSON(directory);

        const { exitCode, stdout } = await runCLI(['setup', 'toml'], { cwd: directory });

        expect(exitCode).toBe(4);
        expect(stdout).toContain('does not match the expected format');
        expect(stdout).toContain('"yaml"');
      });
    });
  });
});
