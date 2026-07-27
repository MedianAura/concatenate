import { findConfigFile, parseConfigData, readConfigFile } from '@/helpers/config-file.js';
import { globby } from 'globby';
import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('globby');
vi.mock('node:fs', () => ({ default: { readFileSync: vi.fn() } }));
vi.mock('@/helpers/root-directory-path.js', () => ({
  getConcatenateDirectoryPath: (): string => '/projects/app/.concatenate',
}));

const globbyMock = vi.mocked(globby);
const readFileSyncMock = vi.mocked(fs.readFileSync);

// Moved out of command-runner-run.test.ts with the functions themselves. Nothing here
// constructs a CommandRunner any more, so execa and the Logger no longer need mocking to
// reach the config pipeline, and the private-access cast is gone.
describe('config-file', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findConfigFile', () => {
    it('returns the single match', async () => {
      globbyMock.mockResolvedValue(['/projects/app/.concatenate/check.yaml']);

      await expect(findConfigFile('check')).resolves.toBe('/projects/app/.concatenate/check.yaml');
    });

    it('defaults to the "default" config', async () => {
      globbyMock.mockResolvedValue(['/projects/app/.concatenate/default.yaml']);

      await findConfigFile();

      expect(globbyMock).toHaveBeenCalledWith('default.*', expect.anything());
    });

    it('throws when nothing matches', async () => {
      globbyMock.mockResolvedValue([]);

      await expect(findConfigFile('check')).rejects.toThrow('There was an issue trying to find the configuration file for check');
    });

    // Two files named `check.*` are ambiguous: there is no rule for which wins.
    it('throws when more than one matches', async () => {
      globbyMock.mockResolvedValue(['/a/check.yaml', '/a/check.json']);

      await expect(findConfigFile('check')).rejects.toThrow();
    });
  });

  describe('parseConfigData', () => {
    it.each(['.yaml', '.yml'])('parses %s', (extension) => {
      expect(parseConfigData(`c${extension}`, 'type: series\nactions: []\n')).toEqual({ type: 'series', actions: [] });
    });

    it('parses .json', () => {
      expect(parseConfigData('c.json', '{"type":"series","actions":[]}')).toEqual({ type: 'series', actions: [] });
    });

    // json5 is destructured off a CommonJS default export; this is the guard on that.
    it('parses .json5 with comments and trailing commas', () => {
      expect(parseConfigData('c.json5', "{ /* hi */ type: 'series', actions: [], }")).toEqual({ type: 'series', actions: [] });
    });

    it('throws on any other extension', () => {
      expect(() => parseConfigData('c.toml', '')).toThrow('Unsupported file type: .toml');
    });
  });

  describe('readConfigFile', () => {
    it('returns the file contents', () => {
      readFileSyncMock.mockReturnValue('type: series' as never);

      expect(readConfigFile('/a/check.yaml')).toBe('type: series');
    });

    // Nothing in Node throws a non-Error here, but useUnknownInCatchVariables means the
    // code has to handle it, and the fallback should be an empty read, not a crash.
    it('returns an empty string when the thrown value is not an Error', () => {
      readFileSyncMock.mockImplementation(() => {
        throw 'a bare string';
      });

      expect(readConfigFile('/a/check.yaml')).toBe('');
    });

    it('wraps a read failure and keeps the cause', () => {
      const cause = new Error('ENOENT: no such file');
      readFileSyncMock.mockImplementation(() => {
        throw cause;
      });

      expect(() => readConfigFile('/a/missing.yaml')).toThrow('There was an issue trying to parse the configuration file');
      try {
        readConfigFile('/a/missing.yaml');
      } catch (error) {
        expect((error as Error).cause).toBe(cause);
      }
    });
  });
});
