import { getConfigFile } from '@/helpers/config-selector.js';
import enquirer from 'enquirer';
import { globby } from 'globby';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('globby');
vi.mock('enquirer', () => ({ default: { prompt: vi.fn() } }));
vi.mock('@/helpers/root-directory-path.js', () => ({
  getConcatenateDirectoryPath: (): string => '/projects/app/.concatenate',
}));

const globbyMock = vi.mocked(globby);
const promptMock = vi.mocked(enquirer.prompt);

describe('getConfigFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the selected config name', async () => {
    globbyMock.mockResolvedValue(['check.yaml', 'fix.yaml']);
    promptMock.mockResolvedValue({ config: 'check' } as never);

    await expect(getConfigFile()).resolves.toBe('check');
  });

  // The prompt offers bare names: the runner re-globs for `<name>.*` afterwards, so an
  // extension here would send it looking for `check.yaml.*`.
  it('offers the file names without their extension', async () => {
    globbyMock.mockResolvedValue(['check.yaml', 'fix.json5']);
    promptMock.mockResolvedValue({ config: 'check' } as never);

    await getConfigFile();

    expect(promptMock).toHaveBeenCalledWith(expect.objectContaining({ choices: ['check', 'fix'] }));
  });

  it('searches the .concatenate directory, dotfiles included', async () => {
    globbyMock.mockResolvedValue(['check.yaml']);
    promptMock.mockResolvedValue({ config: 'check' } as never);

    await getConfigFile();

    expect(globbyMock).toHaveBeenCalledWith('*.*', expect.objectContaining({ cwd: '/projects/app/.concatenate', dot: true }));
  });
});
