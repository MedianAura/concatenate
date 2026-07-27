import { ConfigDefault } from '@/constants/config-default.js';
import { SetupRunner } from '@/controllers/setup-runner.js';
import { ensureDirSync } from 'fs-extra';
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parse as parseYaml } from 'yaml';

vi.mock('node:fs', () => ({ default: { writeFileSync: vi.fn() } }));
vi.mock('fs-extra', () => ({ ensureDirSync: vi.fn() }));
vi.mock('@/helpers/logger.js', () => ({
  Logger: { title: vi.fn(), info: vi.fn(), success: vi.fn(), warn: vi.fn(), skipLine: vi.fn() },
}));
vi.mock('@/helpers/root-directory-path.js', () => ({
  getRootDirectoryPath: (): string => '/projects/app',
}));

const writeFileSyncMock = vi.mocked(fs.writeFileSync);

describe('SetupRunner', () => {
  let runner: SetupRunner;

  beforeEach(() => {
    runner = new SetupRunner();
    vi.clearAllMocks();
  });

  describe('getString', () => {
    it('serialises to yaml', () => {
      const output = runner.getString({ type: 'series', actions: [] }, 'yaml');

      expect(parseYaml(output)).toEqual({ type: 'series', actions: [] });
    });

    it('serialises to indented json', () => {
      const output = runner.getString({ type: 'series', actions: [] }, 'json');

      expect(JSON.parse(output)).toEqual({ type: 'series', actions: [] });
      expect(output).toContain('\n  ');
    });

    it('throws on an extension it does not handle', () => {
      expect(() => runner.getString({}, 'toml' as never)).toThrow('Unsupported file extension.');
    });
  });

  describe('run', () => {
    it('writes one file per default config', async () => {
      await runner.run('yaml');

      expect(writeFileSyncMock).toHaveBeenCalledTimes(Object.keys(ConfigDefault).length);
    });

    it('names the files after the config keys and the extension', async () => {
      await runner.run('yaml');

      const written = writeFileSyncMock.mock.calls.map(([file]) => path.basename(String(file)));
      expect(written).toEqual(Object.keys(ConfigDefault).map((key) => `${key}.yaml`));
    });

    it('writes into .concatenate under the project root', async () => {
      await runner.run('json');

      const [first] = writeFileSyncMock.mock.calls;
      expect(String(first?.[0])).toContain(`${path.sep}.concatenate${path.sep}`);
    });

    it('creates the directory before writing', async () => {
      await runner.run('yaml');

      expect(ensureDirSync).toHaveBeenCalled();
    });

    it('rejects an extension outside the accepted set', async () => {
      await expect(runner.run('toml' as never)).rejects.toThrow();
      expect(writeFileSyncMock).not.toHaveBeenCalled();
    });

    it('writes content that parses back as the default config', async () => {
      await runner.run('json');

      const [first] = writeFileSyncMock.mock.calls;
      expect(JSON.parse(String(first?.[1]))).toEqual(ConfigDefault.check);
    });
  });
});
