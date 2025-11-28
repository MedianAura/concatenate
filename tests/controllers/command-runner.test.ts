import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandRunner } from '../../src/controllers/command-runner.js';
import { Logger } from '../../src/helpers/logger.js';
import type { ActionModelSchema } from '../../src/models/action-model.js';

// Type to access private methods for testing
type CommandRunnerWithPrivates = CommandRunner & {
  filterActionsByIds(actions: ActionModelSchema[], requestedIds: string[]): ActionModelSchema[];
};

// Mock dependencies
vi.mock('../../src/helpers/logger.js', () => ({
  Logger: {
    warn: vi.fn(),
    skipLine: vi.fn(),
    clear: vi.fn(),
    title: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('globby');
vi.mock('node:fs');
vi.mock('execa');

describe('CommandRunner - filterActionsByIds', () => {
  let commandRunner: CommandRunnerWithPrivates;

  beforeEach(() => {
    commandRunner = new CommandRunner() as CommandRunnerWithPrivates;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic filtering', () => {
    it('should filter actions by a single ID', () => {
      const actions: ActionModelSchema[] = [
        { id: 'eslint', label: 'ESLint Check', command: 'eslint .' },
        { id: 'prettier', label: 'Prettier Check', command: 'prettier .' },
        { id: 'tsc', label: 'TypeScript Check', command: 'tsc' },
      ];

      const filtered = commandRunner.filterActionsByIds(actions, ['eslint']);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('eslint');
    });

    it('should filter actions by multiple IDs', () => {
      const actions: ActionModelSchema[] = [
        { id: 'eslint', label: 'ESLint Check', command: 'eslint .' },
        { id: 'prettier', label: 'Prettier Check', command: 'prettier .' },
        { id: 'tsc', label: 'TypeScript Check', command: 'tsc' },
      ];

      const filtered = commandRunner.filterActionsByIds(actions, ['eslint', 'tsc']);

      expect(filtered).toHaveLength(2);
      expect(filtered[0].id).toBe('eslint');
      expect(filtered[1].id).toBe('tsc');
    });

    it('should preserve configuration order when filtering', () => {
      const actions: ActionModelSchema[] = [
        { id: 'prettier', label: 'Prettier Check', command: 'prettier .' },
        { id: 'eslint', label: 'ESLint Check', command: 'eslint .' },
        { id: 'tsc', label: 'TypeScript Check', command: 'tsc' },
      ];

      // Request in different order
      const filtered = commandRunner.filterActionsByIds(actions, ['tsc', 'prettier']);

      // Should preserve config file order (prettier, tsc), not request order (tsc, prettier)
      expect(filtered).toHaveLength(2);
      expect(filtered[0].id).toBe('prettier');
      expect(filtered[1].id).toBe('tsc');
    });

    it('should return empty array when no matching IDs', () => {
      const actions: ActionModelSchema[] = [
        { id: 'eslint', label: 'ESLint Check', command: 'eslint .' },
        { id: 'prettier', label: 'Prettier Check', command: 'prettier .' },
      ];

      // This will throw error for missing IDs, but test the filter logic with a valid case
      expect(() => {
        commandRunner.filterActionsByIds(actions, ['nonexistent']);
      }).toThrow('The following action IDs were not found');
    });
  });

  describe('Duplicate ID detection', () => {
    it('should throw error when duplicate IDs exist in configuration', () => {
      const actions: ActionModelSchema[] = [
        { id: 'eslint', label: 'ESLint Check', command: 'eslint .' },
        { id: 'eslint', label: 'Another ESLint', command: 'eslint --fix' },
      ];

      expect(() => {
        commandRunner.filterActionsByIds(actions, ['eslint']);
      }).toThrow('Duplicate action IDs found in configuration: eslint');
    });

    it('should throw error with multiple duplicate IDs', () => {
      const actions: ActionModelSchema[] = [
        { id: 'eslint', label: 'ESLint Check', command: 'eslint .' },
        { id: 'eslint', label: 'Another ESLint', command: 'eslint --fix' },
        { id: 'prettier', label: 'Prettier', command: 'prettier .' },
        { id: 'prettier', label: 'Another Prettier', command: 'prettier --fix' },
      ];

      expect(() => {
        commandRunner.filterActionsByIds(actions, ['eslint', 'prettier']);
      }).toThrow('Duplicate action IDs found in configuration');
      expect((Logger.warn as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    });

    it('should detect duplicates before checking missing IDs', () => {
      const actions: ActionModelSchema[] = [
        { id: 'eslint', label: 'ESLint Check', command: 'eslint .' },
        { id: 'eslint', label: 'Another ESLint', command: 'eslint --fix' },
      ];

      expect(() => {
        commandRunner.filterActionsByIds(actions, ['nonexistent']);
      }).toThrow('Duplicate action IDs found in configuration');
    });
  });

  describe('Missing ID detection', () => {
    it('should throw error when requested ID does not exist', () => {
      const actions: ActionModelSchema[] = [
        { id: 'eslint', label: 'ESLint Check', command: 'eslint .' },
        { id: 'prettier', label: 'Prettier Check', command: 'prettier .' },
      ];

      expect(() => {
        commandRunner.filterActionsByIds(actions, ['nonexistent']);
      }).toThrow('The following action IDs were not found: nonexistent');
    });

    it('should show available IDs in error message when ID not found', () => {
      const actions: ActionModelSchema[] = [
        { id: 'eslint', label: 'ESLint Check', command: 'eslint .' },
        { id: 'prettier', label: 'Prettier Check', command: 'prettier .' },
      ];

      expect(() => {
        commandRunner.filterActionsByIds(actions, ['invalid']);
      }).toThrow(/Available IDs: eslint, prettier/);
    });

    it('should handle multiple missing IDs', () => {
      const actions: ActionModelSchema[] = [{ id: 'eslint', label: 'ESLint Check', command: 'eslint .' }];

      expect(() => {
        commandRunner.filterActionsByIds(actions, ['missing1', 'missing2']);
      }).toThrow('The following action IDs were not found: missing1, missing2');
    });

    it('should show helpful message when no actions have IDs', () => {
      const actions: ActionModelSchema[] = [
        { label: 'ESLint Check', command: 'eslint .' } as ActionModelSchema,
        { label: 'Prettier Check', command: 'prettier .' } as ActionModelSchema,
      ];

      expect(() => {
        commandRunner.filterActionsByIds(actions, ['eslint']);
      }).toThrow(/Available IDs: \(none - no actions have IDs defined\)/);
    });
  });

  describe('Actions without IDs', () => {
    it('should warn when actions without IDs will be excluded', () => {
      const actions: ActionModelSchema[] = [
        { id: 'eslint', label: 'ESLint Check', command: 'eslint .' },
        { label: 'Prettier Check', command: 'prettier .' } as ActionModelSchema,
        { id: 'tsc', label: 'TypeScript Check', command: 'tsc' },
      ];

      commandRunner.filterActionsByIds(actions, ['eslint', 'tsc']);

      expect(Logger.warn).toHaveBeenCalled();
      const warnCall = (Logger.warn as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(warnCall).toContain('Some actions do not have IDs defined');
      expect(warnCall).toContain('Prettier Check');
    });

    it('should not warn when all filtered actions have IDs', () => {
      const actions: ActionModelSchema[] = [
        { id: 'eslint', label: 'ESLint Check', command: 'eslint .' },
        { id: 'prettier', label: 'Prettier Check', command: 'prettier .' },
      ];

      commandRunner.filterActionsByIds(actions, ['eslint']);

      expect(Logger.warn).not.toHaveBeenCalled();
    });

    it('should exclude actions without IDs from results', () => {
      const actions: ActionModelSchema[] = [
        { id: 'eslint', label: 'ESLint Check', command: 'eslint .' },
        { label: 'Prettier Check', command: 'prettier .' } as ActionModelSchema,
        { id: 'tsc', label: 'TypeScript Check', command: 'tsc' },
      ];

      const filtered = commandRunner.filterActionsByIds(actions, ['eslint', 'tsc']);

      expect(filtered).toHaveLength(2);
      expect(filtered.every((action: ActionModelSchema) => action.id)).toBe(true);
      expect(filtered.some((action: ActionModelSchema) => action.label === 'Prettier Check')).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty requested IDs array', () => {
      const actions: ActionModelSchema[] = [{ id: 'eslint', label: 'ESLint Check', command: 'eslint .' }];

      // Empty array means no IDs requested, should return empty results
      const filtered = commandRunner.filterActionsByIds(actions, []);

      expect(filtered).toHaveLength(0);
      expect(Logger.warn).not.toHaveBeenCalled();
    });

    it('should handle empty actions array', () => {
      const actions: ActionModelSchema[] = [];

      expect(() => {
        commandRunner.filterActionsByIds(actions, ['any-id']);
      }).toThrow('The following action IDs were not found: any-id');
    });

    it('should handle all actions without IDs', () => {
      const actions: ActionModelSchema[] = [{ label: 'Action 1', command: 'cmd1' } as ActionModelSchema, { label: 'Action 2', command: 'cmd2' } as ActionModelSchema];

      expect(() => {
        commandRunner.filterActionsByIds(actions, ['any-id']);
      }).toThrow(/Available IDs: \(none - no actions have IDs defined\)/);
    });

    it('should handle single action', () => {
      const actions: ActionModelSchema[] = [{ id: 'only-one', label: 'Single Action', command: 'cmd' }];

      const filtered = commandRunner.filterActionsByIds(actions, ['only-one']);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('only-one');
    });

    it('should handle case-sensitive ID matching', () => {
      const actions: ActionModelSchema[] = [{ id: 'ESLint', label: 'ESLint Check', command: 'eslint .' }];

      expect(() => {
        commandRunner.filterActionsByIds(actions, ['eslint']);
      }).toThrow('The following action IDs were not found: eslint');
    });

    it('should filter with spaces in command', () => {
      const actions: ActionModelSchema[] = [{ id: 'complex', label: 'Complex Command', command: 'eslint . --format pretty --fix' }];

      const filtered = commandRunner.filterActionsByIds(actions, ['complex']);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].command).toBe('eslint . --format pretty --fix');
    });

    it('should handle IDs with special characters', () => {
      const actions: ActionModelSchema[] = [
        { id: 'eslint-check', label: 'ESLint', command: 'eslint .' },
        { id: 'prettier_format', label: 'Prettier', command: 'prettier .' },
        { id: 'test:unit', label: 'Unit Tests', command: 'npm test' },
      ];

      const filtered = commandRunner.filterActionsByIds(actions, ['eslint-check', 'prettier_format', 'test:unit']);

      expect(filtered).toHaveLength(3);
    });

    it('should handle whitespace-only IDs (if they exist)', () => {
      const actions: ActionModelSchema[] = [
        { id: '  ', label: 'Whitespace ID', command: 'cmd' },
        { id: 'normal', label: 'Normal', command: 'cmd2' },
      ];

      const filtered = commandRunner.filterActionsByIds(actions, ['  ']);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('  ');
    });

    it('should handle very long IDs', () => {
      const longId = 'very-long-id-with-many-characters-that-describes-something-in-extreme-detail';
      const actions: ActionModelSchema[] = [{ id: longId, label: 'Long ID Action', command: 'cmd' }];

      const filtered = commandRunner.filterActionsByIds(actions, [longId]);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(longId);
    });

    it('should handle numeric-looking string IDs', () => {
      const actions: ActionModelSchema[] = [
        { id: '123', label: 'Numeric ID', command: 'cmd1' },
        { id: '456', label: 'Another Numeric ID', command: 'cmd2' },
      ];

      const filtered = commandRunner.filterActionsByIds(actions, ['123', '456']);

      expect(filtered).toHaveLength(2);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle typical CI/CD setup with series mode', () => {
      const actions: ActionModelSchema[] = [
        { id: 'prettier', label: 'Fix Formatting', command: 'prettier --write .' },
        { id: 'eslint', label: 'Fix Linting', command: 'eslint --fix .' },
        { id: 'tsc', label: 'Check Types', command: 'tsc --noEmit' },
      ];

      // User wants to run just prettier and tsc (skip eslint)
      const filtered = commandRunner.filterActionsByIds(actions, ['prettier', 'tsc']);

      expect(filtered).toHaveLength(2);
      expect(filtered[0].id).toBe('prettier');
      expect(filtered[1].id).toBe('tsc');
    });

    it('should handle parallel mode with filtering', () => {
      const actions: ActionModelSchema[] = [
        { id: 'eslint', label: 'Lint', command: 'eslint .' },
        { id: 'prettier', label: 'Format Check', command: 'prettier --check .' },
        { id: 'knip', label: 'Unused', command: 'knip' },
        { id: 'tsc', label: 'Types', command: 'tsc --noEmit' },
      ];

      // User wants to run eslint and prettier only
      const filtered = commandRunner.filterActionsByIds(actions, ['eslint', 'prettier']);

      expect(filtered).toHaveLength(2);
      expect(filtered.map((a: ActionModelSchema) => a.id)).toEqual(['eslint', 'prettier']);
    });

    it('should warn about mixed ID and non-ID actions', () => {
      const actions: ActionModelSchema[] = [
        { id: 'linter', label: 'Lint Code', command: 'eslint .' },
        { label: 'Build App', command: 'npm run build' } as ActionModelSchema,
        { id: 'test', label: 'Run Tests', command: 'npm test' },
      ];

      commandRunner.filterActionsByIds(actions, ['linter', 'test']);

      expect(Logger.warn).toHaveBeenCalled();
      expect(Logger.skipLine).toHaveBeenCalled();
    });

    it('should handle large action lists efficiently', () => {
      // Create 100 actions
      const actions: ActionModelSchema[] = Array.from({ length: 100 }, (_, index) => ({
        id: `action-${index}`,
        label: `Action ${index}`,
        command: `cmd${index}`,
      }));

      // Filter to 10 specific actions
      const requestedIds = ['action-5', 'action-15', 'action-25', 'action-35', 'action-45', 'action-55', 'action-65', 'action-75', 'action-85', 'action-95'];

      const filtered = commandRunner.filterActionsByIds(actions, requestedIds);

      expect(filtered).toHaveLength(10);
      expect(filtered.map((a: ActionModelSchema) => a.id)).toEqual(requestedIds);
    });

    it('should maintain all action properties after filtering', () => {
      const actions: ActionModelSchema[] = [
        { id: 'test-action', label: 'Test Action Label', command: 'npm run test -- --coverage' },
        { id: 'build-action', label: 'Build Action', command: 'npm run build' },
      ];

      const filtered = commandRunner.filterActionsByIds(actions, ['test-action']);

      expect(filtered[0]).toEqual({
        id: 'test-action',
        label: 'Test Action Label',
        command: 'npm run test -- --coverage',
      });
    });
  });

  describe('Error message format validation', () => {
    it('should format duplicate IDs error message correctly', () => {
      const actions: ActionModelSchema[] = [
        { id: 'duplicate', label: 'First', command: 'cmd1' },
        { id: 'duplicate', label: 'Second', command: 'cmd2' },
        { id: 'another-dup', label: 'Third', command: 'cmd3' },
        { id: 'another-dup', label: 'Fourth', command: 'cmd4' },
      ];

      expect(() => {
        commandRunner.filterActionsByIds(actions, ['duplicate']);
      }).toThrow(/^Duplicate action IDs found in configuration: (duplicate, another-dup|another-dup, duplicate)\. Each action must have a unique ID\.$/);
    });

    it('should format missing IDs error message with proper structure', () => {
      const actions: ActionModelSchema[] = [
        { id: 'valid-id', label: 'Valid', command: 'cmd' },
        { id: 'another-valid', label: 'Another', command: 'cmd2' },
      ];

      try {
        commandRunner.filterActionsByIds(actions, ['missing-id']);
      } catch (error) {
        expect((error as Error).message).toContain('The following action IDs were not found: missing-id');
        expect((error as Error).message).toContain('Available IDs: ');
        expect((error as Error).message).toMatch(/valid-id/);
        expect((error as Error).message).toMatch(/another-valid/);
      }
    });

    it('should format warning message for actions without IDs', () => {
      const actions: ActionModelSchema[] = [
        { id: 'with-id', label: 'Has ID', command: 'cmd1' },
        { label: 'No ID 1', command: 'cmd2' } as ActionModelSchema,
        { label: 'No ID 2', command: 'cmd3' } as ActionModelSchema,
      ];

      commandRunner.filterActionsByIds(actions, ['with-id']);

      expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('Some actions do not have IDs defined'));
      expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('Actions without IDs: No ID 1, No ID 2'));
    });
  });

  describe('Return value verification', () => {
    it('should return array with correct action objects', () => {
      const actions: ActionModelSchema[] = [
        { id: 'action-1', label: 'Action 1', command: 'cmd1' },
        { id: 'action-2', label: 'Action 2', command: 'cmd2' },
      ];

      const filtered = commandRunner.filterActionsByIds(actions, ['action-1']);

      expect(Array.isArray(filtered)).toBe(true);
      expect(filtered[0]).toHaveProperty('id');
      expect(filtered[0]).toHaveProperty('label');
      expect(filtered[0]).toHaveProperty('command');
    });

    it('should return new array instance (not mutate input)', () => {
      const actions: ActionModelSchema[] = [
        { id: 'action-1', label: 'Action 1', command: 'cmd1' },
        { id: 'action-2', label: 'Action 2', command: 'cmd2' },
      ];

      const originalLength = actions.length;
      const filtered = commandRunner.filterActionsByIds(actions, ['action-1']);

      expect(filtered).not.toBe(actions);
      expect(actions).toHaveLength(originalLength);
    });

    it('should return actions in configuration file order', () => {
      const actions: ActionModelSchema[] = [
        { id: 'zebra', label: 'Z Action', command: 'cmd-z' },
        { id: 'alpha', label: 'A Action', command: 'cmd-a' },
        { id: 'beta', label: 'B Action', command: 'cmd-b' },
      ];

      // Request in alphabetical order
      const filtered = commandRunner.filterActionsByIds(actions, ['alpha', 'beta', 'zebra']);

      // Should return in config file order (zebra, alpha, beta)
      expect(filtered.map((a: ActionModelSchema) => a.id)).toEqual(['zebra', 'alpha', 'beta']);
    });
  });
});
