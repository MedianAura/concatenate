import { CommandRunner } from '@/controllers/command-runner.js';
import { execa } from 'execa';
import { globby } from 'globby';
import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('globby');
vi.mock('execa', async () => {
  const actual = await vi.importActual<typeof import('execa')>('execa');
  return { ...actual, execa: vi.fn() };
});
vi.mock('node:fs', () => ({ default: { readFileSync: vi.fn() } }));
vi.mock('@/helpers/logger.js', () => ({
  Logger: { warn: vi.fn(), skipLine: vi.fn(), clear: vi.fn(), title: vi.fn(), error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));
vi.mock('@/helpers/root-directory-path.js', () => ({
  getConcatenateDirectoryPath: (): string => '/projects/app/.concatenate',
}));

// The config pipeline is private; the tests drive it directly rather than through the
// Listr run, which would need a full subprocess mock for every case.
//
// Deliberately not an intersection with CommandRunner: TypeScript reduces
// `CommandRunner & { getConfigFile... }` to `never`, because the member exists in both
// constituents and is private in one. The cast below goes through `unknown` instead.
interface Privates {
  filterActionsByIds(actions: unknown[], requestedIds: string[]): unknown;
  getConfigFile(config?: string): Promise<string>;
  parseConfigData(configFile: string, data: string): unknown;
  readConfigFile(configFile: string): string;
  validateData(config: string): Promise<unknown>;
}

const globbyMock = vi.mocked(globby);
const execaMock = vi.mocked(execa);
const readFileSyncMock = vi.mocked(fs.readFileSync);

/** An execa result carrying only the fields the runner reads. */
function result(overrides: Partial<{ durationMs: number; exitCode: number; stderr: string; stdout: string }> = {}): unknown {
  return { exitCode: 0, stdout: '', stderr: '', durationMs: 12, ...overrides };
}

describe('CommandRunner internals', () => {
  let runner: Privates;

  beforeEach(() => {
    runner = new CommandRunner() as unknown as Privates;
    vi.clearAllMocks();
  });

  describe('filterActionsByIds edge cases', () => {
    // The `|| '(none ...)'` fallback: every action lacks an id, so the "available ids"
    // list would otherwise be an empty string in the error message.
    it('says so when no action defines an id at all', () => {
      const actions = [
        { label: 'A', command: 'a' },
        { label: 'B', command: 'b' },
      ];

      expect(() => runner.filterActionsByIds(actions, ['x'])).toThrow('none - no actions have IDs defined');
    });
  });

  describe('getConfigFile', () => {
    it('returns the single match', async () => {
      globbyMock.mockResolvedValue(['/projects/app/.concatenate/check.yaml']);

      await expect(runner.getConfigFile('check')).resolves.toBe('/projects/app/.concatenate/check.yaml');
    });

    it('defaults to the "default" config', async () => {
      globbyMock.mockResolvedValue(['/projects/app/.concatenate/default.yaml']);

      await runner.getConfigFile();

      expect(globbyMock).toHaveBeenCalledWith('default.*', expect.anything());
    });

    it('throws when nothing matches', async () => {
      globbyMock.mockResolvedValue([]);

      await expect(runner.getConfigFile('check')).rejects.toThrow('There was an issue trying to find the configuration file for check');
    });

    // Two files named `check.*` are ambiguous: there is no rule for which wins.
    it('throws when more than one matches', async () => {
      globbyMock.mockResolvedValue(['/a/check.yaml', '/a/check.json']);

      await expect(runner.getConfigFile('check')).rejects.toThrow();
    });
  });

  describe('parseConfigData', () => {
    it.each(['.yaml', '.yml'])('parses %s', (extension) => {
      expect(runner.parseConfigData(`c${extension}`, 'type: series\nactions: []\n')).toEqual({ type: 'series', actions: [] });
    });

    it('parses .json', () => {
      expect(runner.parseConfigData('c.json', '{"type":"series","actions":[]}')).toEqual({ type: 'series', actions: [] });
    });

    // json5 is destructured off a CommonJS default export; this is the guard on that.
    it('parses .json5 with comments and trailing commas', () => {
      expect(runner.parseConfigData('c.json5', "{ /* hi */ type: 'series', actions: [], }")).toEqual({ type: 'series', actions: [] });
    });

    it('throws on any other extension', () => {
      expect(() => runner.parseConfigData('c.toml', '')).toThrow('Unsupported file type: .toml');
    });
  });

  describe('readConfigFile', () => {
    it('returns the file contents', () => {
      readFileSyncMock.mockReturnValue('type: series' as never);

      expect(runner.readConfigFile('/a/check.yaml')).toBe('type: series');
    });

    // Nothing in Node throws a non-Error here, but useUnknownInCatchVariables means the
    // code has to handle it, and the fallback should be an empty read, not a crash.
    it('returns an empty string when the thrown value is not an Error', () => {
      readFileSyncMock.mockImplementation(() => {
        throw 'a bare string';
      });

      expect(runner.readConfigFile('/a/check.yaml')).toBe('');
    });

    it('wraps a read failure and keeps the cause', () => {
      const cause = new Error('ENOENT: no such file');
      readFileSyncMock.mockImplementation(() => {
        throw cause;
      });

      expect(() => runner.readConfigFile('/a/missing.yaml')).toThrow('There was an issue trying to parse the configuration file');
      try {
        runner.readConfigFile('/a/missing.yaml');
      } catch (error) {
        expect((error as Error).cause).toBe(cause);
      }
    });
  });

  describe('validateData', () => {
    it('returns the parsed config', async () => {
      globbyMock.mockResolvedValue(['/a/check.yaml']);
      readFileSyncMock.mockReturnValue('type: series\nactions:\n  - label: Lint\n    command: eslint .\n' as never);

      await expect(runner.validateData('check')).resolves.toEqual({
        type: 'series',
        actions: [{ label: 'Lint', command: 'eslint .' }],
      });
    });

    it('rejects a config that fails the schema', async () => {
      globbyMock.mockResolvedValue(['/a/check.yaml']);
      readFileSyncMock.mockReturnValue('type: sideways\nactions: []\n' as never);

      await expect(runner.validateData('check')).rejects.toThrow();
    });
  });

  describe('run', () => {
    let log: ReturnType<typeof vi.spyOn>;
    let write: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      log = vi.spyOn(console, 'log').mockImplementation(() => {});
      // The listr2 renderer writes straight to process.stdout, so its task lines land in
      // the test output otherwise. console.log is spied separately and never reaches it.
      write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    });

    afterEach(() => {
      log.mockRestore();
      write.mockRestore();
    });

    const output = (): string => log.mock.calls.map((call: unknown[]) => String(call[0])).join('\n');

    it('runs each action and reports its output', async () => {
      globbyMock.mockResolvedValue(['/a/check.yaml']);
      readFileSyncMock.mockReturnValue('type: series\nactions:\n  - label: Lint\n    command: eslint .\n' as never);
      execaMock.mockResolvedValue(result({ stdout: 'lint output' }) as never);

      await new CommandRunner().run('check');

      expect(execaMock).toHaveBeenCalledWith('eslint', ['.'], expect.objectContaining({ preferLocal: true }));
      expect(output()).toContain('lint output');
    });

    it('lists every action in the summary with its duration', async () => {
      globbyMock.mockResolvedValue(['/a/check.yaml']);
      readFileSyncMock.mockReturnValue('type: series\nactions:\n  - label: Quiet\n    command: tsc\n' as never);
      execaMock.mockResolvedValue(result({ durationMs: 3200 }) as never);

      await new CommandRunner().run('check');

      // No stdout at all, so the summary is the only place it can appear.
      expect(output()).toMatch(/Quiet\s+\d/);
    });

    it('throws when an action exits non-zero', async () => {
      globbyMock.mockResolvedValue(['/a/check.yaml']);
      readFileSyncMock.mockReturnValue('type: parallel\nactions:\n  - label: Lint\n    command: eslint .\n' as never);
      execaMock.mockResolvedValue(result({ exitCode: 1, stdout: 'it failed' }) as never);

      await expect(new CommandRunner().run('check')).rejects.toThrow('Some tasks failed');
      expect(output()).toContain('it failed');
    });

    it('throws when the subprocess itself rejects', async () => {
      globbyMock.mockResolvedValue(['/a/check.yaml']);
      readFileSyncMock.mockReturnValue('type: series\nactions:\n  - label: Lint\n    command: nope\n' as never);
      execaMock.mockRejectedValue(Object.assign(new Error('spawn failed'), result({ exitCode: 127, stderr: 'not found' })));

      await expect(new CommandRunner().run('check')).rejects.toThrow('Some tasks failed');
      expect(output()).toContain('not found');
    });

    // execa always sets these, but handleOutput takes `Result | ExecaError` and the
    // error path can arrive before the subprocess produced either.
    it('tolerates a result carrying neither exitCode nor durationMs', async () => {
      globbyMock.mockResolvedValue(['/a/check.yaml']);
      readFileSyncMock.mockReturnValue('type: series\nactions:\n  - label: Lint\n    command: eslint .\n' as never);
      execaMock.mockResolvedValue({ stdout: 'output', stderr: '' } as never);

      await expect(new CommandRunner().run('check')).resolves.toBeUndefined();
      expect(output()).toContain('output');
    });

    it('runs only the requested ids', async () => {
      globbyMock.mockResolvedValue(['/a/check.yaml']);
      readFileSyncMock.mockReturnValue('type: series\nactions:\n  - id: a\n    label: A\n    command: cmd-a\n  - id: b\n    label: B\n    command: cmd-b\n' as never);
      execaMock.mockResolvedValue(result() as never);

      await new CommandRunner().run('check', ['a']);

      expect(execaMock).toHaveBeenCalledTimes(1);
      expect(execaMock).toHaveBeenCalledWith('cmd-a', [], expect.anything());
    });
  });
});
