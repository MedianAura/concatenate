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

// Nothing private left to reach: locating, reading and parsing live in
// helpers/config-file.ts, resolution in controllers/config-loader.ts and filtering in
// helpers/action-filter.ts, each tested directly. What remains here is `run` itself,
// driven through its public surface with execa mocked.
const globbyMock = vi.mocked(globby);
const execaMock = vi.mocked(execa);
const readFileSyncMock = vi.mocked(fs.readFileSync);

/** An execa result carrying only the fields the runner reads. */
function result(overrides: Partial<{ durationMs: number; exitCode: number; stderr: string; stdout: string }> = {}): unknown {
  return { exitCode: 0, stdout: '', stderr: '', durationMs: 12, ...overrides };
}

describe('CommandRunner internals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('run', () => {
    let log: ReturnType<typeof vi.spyOn>;
    let write: ReturnType<typeof vi.spyOn>;
    let writeError: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      log = vi.spyOn(console, 'log').mockImplementation(() => {});
      // listr2 writes its task lines straight to a stream, bypassing console. Under
      // vitest stdout is not a TTY, so it falls back to the `simple` renderer, whose
      // logger splits by level: LISTR_LOGGER_STDERR_LEVELS -- RETRY, ROLLBACK, FAILED
      // -- go to stderr, everything else to stdout. The failing-action cases hit the
      // stderr half, so both streams need silencing. console.log is spied separately
      // and never reaches either.
      write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      writeError = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    });

    afterEach(() => {
      log.mockRestore();
      write.mockRestore();
      writeError.mockRestore();
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
