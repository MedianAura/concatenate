import { Logger } from '@/helpers/logger.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Logger writes straight to process.stdout, so the assertions target the write calls
// rather than captured text. No module mock: log-update is gone, and a spy on the stream
// is both closer to what happens and immune to the hard wrap that made it worth removing.
const writes: string[] = [];

describe('Logger', () => {
  let isTTY: boolean | undefined;

  beforeEach(() => {
    writes.length = 0;
    isTTY = process.stdout.isTTY;
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown): boolean => {
      writes.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    process.stdout.isTTY = isTTY as boolean;
    vi.restoreAllMocks();
  });

  it('prints a message as given', () => {
    Logger.print('hello');

    expect(writes).toEqual(['hello']);
  });

  it('appends a newline in println', () => {
    Logger.println('hello');

    expect(writes).toEqual(['hello\n']);
  });

  it('emits an empty line for skipLine', () => {
    Logger.skipLine();

    expect(writes).toEqual(['\n']);
  });

  it.each([
    ['error', '[ERROR]'],
    ['warn', '[WARN]'],
    ['info', '[INFO]'],
    ['success', '[SUCCESS]'],
    ['title', '[CONCATENATE]'],
  ])('prefixes %s with %s', (method, prefix) => {
    (Logger as unknown as Record<string, (message: string) => void>)[method]!('the message');

    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain(prefix);
    expect(writes[0]).toContain('the message');
  });

  describe('clear', () => {
    it('writes the ANSI clear sequence on a TTY', () => {
      process.stdout.isTTY = true;
      const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

      Logger.clear();

      expect(write).toHaveBeenCalledTimes(2);
      expect(write.mock.calls.map(([value]) => value).join('')).toContain('[2J');
    });

    // The guard that keeps ANSI escapes out of pipes and CI logs.
    it('writes nothing when stdout is not a TTY', () => {
      process.stdout.isTTY = false;
      const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

      Logger.clear();

      expect(write).not.toHaveBeenCalled();
    });
  });
});
