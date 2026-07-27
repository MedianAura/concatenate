import { Logger } from '@/helpers/logger.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// log-update writes through its own stream handling, so the assertions target the
// write calls rather than captured text.
const writes: string[] = [];

const logUpdate = Object.assign(
  (message: string): void => {
    writes.push(message);
  },
  { done: (): void => {} },
);

vi.mock('log-update', () => ({ createLogUpdate: () => logUpdate }));

describe('Logger', () => {
  let isTTY: boolean | undefined;

  beforeEach(() => {
    writes.length = 0;
    isTTY = process.stdout.isTTY;
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
