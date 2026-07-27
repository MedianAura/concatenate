import { getConcatenateDirectoryPath, getRootDirectoryPath } from '@/helpers/root-directory-path.js';
import { findUpSync } from 'find-up';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('find-up');

const findUpSyncMock = vi.mocked(findUpSync);

describe('root-directory-path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getRootDirectoryPath', () => {
    // findUpSync returns the package.json itself, so the directory is one level up.
    it('returns the directory holding the package.json', () => {
      findUpSyncMock.mockReturnValue(path.join('/projects', 'app', 'package.json'));

      expect(getRootDirectoryPath()).toBe(path.resolve(path.join('/projects', 'app')));
    });

    it('throws when no package.json is found', () => {
      findUpSyncMock.mockReturnValue(undefined);

      expect(() => getRootDirectoryPath()).toThrow('Could not find the root directory.');
    });
  });

  describe('getConcatenateDirectoryPath', () => {
    it('returns the .concatenate directory itself', () => {
      const directory = path.join('/projects', 'app', '.concatenate');
      findUpSyncMock.mockReturnValue(directory);

      expect(getConcatenateDirectoryPath()).toBe(path.resolve(directory));
    });

    it('looks for a directory, not a file', () => {
      findUpSyncMock.mockReturnValue(path.join('/projects', 'app', '.concatenate'));

      getConcatenateDirectoryPath();

      expect(findUpSyncMock).toHaveBeenCalledWith('.concatenate', expect.objectContaining({ type: 'directory' }));
    });

    it('throws when no .concatenate directory is found', () => {
      findUpSyncMock.mockReturnValue(undefined);

      expect(() => getConcatenateDirectoryPath()).toThrow('Could not find the concatenate directory.');
    });
  });
});
