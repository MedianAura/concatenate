import { filterTree } from '@/helpers/action-filter.js';
import { Logger } from '@/helpers/logger.js';
import type { ResolvedGroup, ResolvedLeaf, ResolvedNode } from '@/models/config-tree.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// No vi.mock and no class: the function is pure apart from the two Logger calls, and
// those are reachable with a spy. The mocks this file used to carry -- globby, node:fs,
// execa -- existed only to make CommandRunner constructible, never to shape a result.

interface Context {
  labelPath: string[];
  idPath?: string[];
}

const ROOT: Context = { labelPath: [], idPath: [] };

/**
 * `leaf` and `tree` stand in for the loader, computing `labelPath`/`idPath` by the same
 * rule `resolveNode` uses -- including the one that matters most here: an id-less node
 * makes its whole subtree unaddressable.
 */
function paths(action: { id?: string; label: string }, parent: Context): Context {
  return {
    labelPath: [...parent.labelPath, action.label],
    idPath: parent.idPath !== undefined && action.id !== undefined ? [...parent.idPath, action.id] : undefined,
  };
}

function leaf(action: { command?: string; id?: string; label: string }, parent: Context = ROOT): ResolvedLeaf {
  return { kind: 'leaf', id: action.id, label: action.label, command: action.command ?? 'noop', file: '/project/.concatenate/check.yaml', ...paths(action, parent) };
}

/** Children are built against the group's own context, so nested paths come out right. */
function tree(action: { id?: string; label: string; type?: 'parallel' | 'series' }, children: (self: Context) => ResolvedNode[], parent: Context = ROOT): ResolvedGroup {
  const self = paths(action, parent);

  return { kind: 'group', id: action.id, label: action.label, type: action.type ?? 'series', ...self, children: children(self) };
}

describe('filterTree', () => {
  beforeEach(() => {
    vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger, 'skipLine').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Migrated from the CommandRunner suite: the `|| '(none ...)'` fallback, where every
  // action lacks an id so the "available ids" list would otherwise be an empty string.
  it('says so when no action defines an id at all', () => {
    const actions: ResolvedNode[] = [leaf({ label: 'A', command: 'a' }), leaf({ label: 'B', command: 'b' })];

    expect(() => filterTree(actions, ['x'])).toThrow('none - no actions have IDs defined');
  });

  describe('Basic filtering', () => {
    it('should filter actions by a single ID', () => {
      const actions: ResolvedNode[] = [
        leaf({ id: 'eslint', label: 'ESLint Check', command: 'eslint .' }),
        leaf({ id: 'prettier', label: 'Prettier Check', command: 'prettier .' }),
        leaf({ id: 'tsc', label: 'TypeScript Check', command: 'tsc' }),
      ];

      const filtered = filterTree(actions, ['eslint']);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('eslint');
    });

    it('should filter actions by multiple IDs', () => {
      const actions: ResolvedNode[] = [
        leaf({ id: 'eslint', label: 'ESLint Check', command: 'eslint .' }),
        leaf({ id: 'prettier', label: 'Prettier Check', command: 'prettier .' }),
        leaf({ id: 'tsc', label: 'TypeScript Check', command: 'tsc' }),
      ];

      const filtered = filterTree(actions, ['eslint', 'tsc']);

      expect(filtered).toHaveLength(2);
      expect(filtered[0].id).toBe('eslint');
      expect(filtered[1].id).toBe('tsc');
    });

    it('should preserve configuration order when filtering', () => {
      const actions: ResolvedNode[] = [
        leaf({ id: 'prettier', label: 'Prettier Check', command: 'prettier .' }),
        leaf({ id: 'eslint', label: 'ESLint Check', command: 'eslint .' }),
        leaf({ id: 'tsc', label: 'TypeScript Check', command: 'tsc' }),
      ];

      // Request in different order
      const filtered = filterTree(actions, ['tsc', 'prettier']);

      // Should preserve config file order (prettier, tsc), not request order (tsc, prettier)
      expect(filtered).toHaveLength(2);
      expect(filtered[0].id).toBe('prettier');
      expect(filtered[1].id).toBe('tsc');
    });

    it('should return empty array when no matching IDs', () => {
      const actions: ResolvedNode[] = [
        leaf({ id: 'eslint', label: 'ESLint Check', command: 'eslint .' }),
        leaf({ id: 'prettier', label: 'Prettier Check', command: 'prettier .' }),
      ];

      // This will throw error for missing IDs, but test the filter logic with a valid case
      expect(() => {
        filterTree(actions, ['nonexistent']);
      }).toThrow('The following action IDs were not found');
    });
  });

  describe('Duplicate ID detection', () => {
    it('should throw error when duplicate IDs exist in configuration', () => {
      const actions: ResolvedNode[] = [
        leaf({ id: 'eslint', label: 'ESLint Check', command: 'eslint .' }),
        leaf({ id: 'eslint', label: 'Another ESLint', command: 'eslint --fix' }),
      ];

      expect(() => {
        filterTree(actions, ['eslint']);
      }).toThrow('Duplicate action IDs found in configuration: eslint');
    });

    it('should throw error with multiple duplicate IDs', () => {
      const actions: ResolvedNode[] = [
        leaf({ id: 'eslint', label: 'ESLint Check', command: 'eslint .' }),
        leaf({ id: 'eslint', label: 'Another ESLint', command: 'eslint --fix' }),
        leaf({ id: 'prettier', label: 'Prettier', command: 'prettier .' }),
        leaf({ id: 'prettier', label: 'Another Prettier', command: 'prettier --fix' }),
      ];

      expect(() => {
        filterTree(actions, ['eslint', 'prettier']);
      }).toThrow('Duplicate action IDs found in configuration');
      expect((Logger.warn as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    });

    it('should detect duplicates before checking missing IDs', () => {
      const actions: ResolvedNode[] = [
        leaf({ id: 'eslint', label: 'ESLint Check', command: 'eslint .' }),
        leaf({ id: 'eslint', label: 'Another ESLint', command: 'eslint --fix' }),
      ];

      expect(() => {
        filterTree(actions, ['nonexistent']);
      }).toThrow('Duplicate action IDs found in configuration');
    });
  });

  describe('Missing ID detection', () => {
    it('should throw error when requested ID does not exist', () => {
      const actions: ResolvedNode[] = [
        leaf({ id: 'eslint', label: 'ESLint Check', command: 'eslint .' }),
        leaf({ id: 'prettier', label: 'Prettier Check', command: 'prettier .' }),
      ];

      expect(() => {
        filterTree(actions, ['nonexistent']);
      }).toThrow('The following action IDs were not found: nonexistent');
    });

    it('should show available IDs in error message when ID not found', () => {
      const actions: ResolvedNode[] = [
        leaf({ id: 'eslint', label: 'ESLint Check', command: 'eslint .' }),
        leaf({ id: 'prettier', label: 'Prettier Check', command: 'prettier .' }),
      ];

      expect(() => {
        filterTree(actions, ['invalid']);
      }).toThrow(/Available IDs: eslint, prettier/);
    });

    it('should handle multiple missing IDs', () => {
      const actions: ResolvedNode[] = [leaf({ id: 'eslint', label: 'ESLint Check', command: 'eslint .' })];

      expect(() => {
        filterTree(actions, ['missing1', 'missing2']);
      }).toThrow('The following action IDs were not found: missing1, missing2');
    });

    it('should show helpful message when no actions have IDs', () => {
      const actions: ResolvedNode[] = [leaf({ label: 'ESLint Check', command: 'eslint .' }), leaf({ label: 'Prettier Check', command: 'prettier .' })];

      expect(() => {
        filterTree(actions, ['eslint']);
      }).toThrow(/Available IDs: \(none - no actions have IDs defined\)/);
    });
  });

  describe('Actions without IDs', () => {
    it('should warn when actions without IDs will be excluded', () => {
      const actions: ResolvedNode[] = [
        leaf({ id: 'eslint', label: 'ESLint Check', command: 'eslint .' }),
        leaf({ label: 'Prettier Check', command: 'prettier .' }),
        leaf({ id: 'tsc', label: 'TypeScript Check', command: 'tsc' }),
      ];

      filterTree(actions, ['eslint', 'tsc']);

      expect(Logger.warn).toHaveBeenCalled();
      const warnCall = (Logger.warn as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(warnCall).toContain('Some actions do not have IDs defined');
      expect(warnCall).toContain('Prettier Check');
    });

    it('should not warn when all filtered actions have IDs', () => {
      const actions: ResolvedNode[] = [
        leaf({ id: 'eslint', label: 'ESLint Check', command: 'eslint .' }),
        leaf({ id: 'prettier', label: 'Prettier Check', command: 'prettier .' }),
      ];

      filterTree(actions, ['eslint']);

      expect(Logger.warn).not.toHaveBeenCalled();
    });

    it('should exclude actions without IDs from results', () => {
      const actions: ResolvedNode[] = [
        leaf({ id: 'eslint', label: 'ESLint Check', command: 'eslint .' }),
        leaf({ label: 'Prettier Check', command: 'prettier .' }),
        leaf({ id: 'tsc', label: 'TypeScript Check', command: 'tsc' }),
      ];

      const filtered = filterTree(actions, ['eslint', 'tsc']);

      expect(filtered).toHaveLength(2);
      expect(filtered.every((action: ResolvedNode) => action.id)).toBe(true);
      expect(filtered.some((action: ResolvedNode) => action.label === 'Prettier Check')).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty requested IDs array', () => {
      const actions: ResolvedNode[] = [leaf({ id: 'eslint', label: 'ESLint Check', command: 'eslint .' })];

      // Empty array means no IDs requested, should return empty results
      const filtered = filterTree(actions, []);

      expect(filtered).toHaveLength(0);
      expect(Logger.warn).not.toHaveBeenCalled();
    });

    it('should handle empty actions array', () => {
      const actions: ResolvedNode[] = [];

      expect(() => {
        filterTree(actions, ['any-id']);
      }).toThrow('The following action IDs were not found: any-id');
    });

    it('should handle all actions without IDs', () => {
      const actions: ResolvedNode[] = [leaf({ label: 'Action 1', command: 'cmd1' }), leaf({ label: 'Action 2', command: 'cmd2' })];

      expect(() => {
        filterTree(actions, ['any-id']);
      }).toThrow(/Available IDs: \(none - no actions have IDs defined\)/);
    });

    it('should handle single action', () => {
      const actions: ResolvedNode[] = [leaf({ id: 'only-one', label: 'Single Action', command: 'cmd' })];

      const filtered = filterTree(actions, ['only-one']);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('only-one');
    });

    it('should handle case-sensitive ID matching', () => {
      const actions: ResolvedNode[] = [leaf({ id: 'ESLint', label: 'ESLint Check', command: 'eslint .' })];

      expect(() => {
        filterTree(actions, ['eslint']);
      }).toThrow('The following action IDs were not found: eslint');
    });

    it('should filter with spaces in command', () => {
      const actions: ResolvedNode[] = [leaf({ id: 'complex', label: 'Complex Command', command: 'eslint . --format pretty --fix' })];

      const filtered = filterTree(actions, ['complex']);

      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toMatchObject({ command: 'eslint . --format pretty --fix' });
    });

    it('should handle IDs with special characters', () => {
      const actions: ResolvedNode[] = [
        leaf({ id: 'eslint-check', label: 'ESLint', command: 'eslint .' }),
        leaf({ id: 'prettier_format', label: 'Prettier', command: 'prettier .' }),
        leaf({ id: 'test:unit', label: 'Unit Tests', command: 'npm test' }),
      ];

      const filtered = filterTree(actions, ['eslint-check', 'prettier_format', 'test:unit']);

      expect(filtered).toHaveLength(3);
    });

    it('should handle whitespace-only IDs (if they exist)', () => {
      const actions: ResolvedNode[] = [leaf({ id: '  ', label: 'Whitespace ID', command: 'cmd' }), leaf({ id: 'normal', label: 'Normal', command: 'cmd2' })];

      const filtered = filterTree(actions, ['  ']);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('  ');
    });

    it('should handle very long IDs', () => {
      const longId = 'very-long-id-with-many-characters-that-describes-something-in-extreme-detail';
      const actions: ResolvedNode[] = [leaf({ id: longId, label: 'Long ID Action', command: 'cmd' })];

      const filtered = filterTree(actions, [longId]);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(longId);
    });

    it('should handle numeric-looking string IDs', () => {
      const actions: ResolvedNode[] = [leaf({ id: '123', label: 'Numeric ID', command: 'cmd1' }), leaf({ id: '456', label: 'Another Numeric ID', command: 'cmd2' })];

      const filtered = filterTree(actions, ['123', '456']);

      expect(filtered).toHaveLength(2);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle typical CI/CD setup with series mode', () => {
      const actions: ResolvedNode[] = [
        leaf({ id: 'prettier', label: 'Fix Formatting', command: 'prettier --write .' }),
        leaf({ id: 'eslint', label: 'Fix Linting', command: 'eslint --fix .' }),
        leaf({ id: 'tsc', label: 'Check Types', command: 'tsc --noEmit' }),
      ];

      // User wants to run just prettier and tsc (skip eslint)
      const filtered = filterTree(actions, ['prettier', 'tsc']);

      expect(filtered).toHaveLength(2);
      expect(filtered[0].id).toBe('prettier');
      expect(filtered[1].id).toBe('tsc');
    });

    it('should handle parallel mode with filtering', () => {
      const actions: ResolvedNode[] = [
        leaf({ id: 'eslint', label: 'Lint', command: 'eslint .' }),
        leaf({ id: 'prettier', label: 'Format Check', command: 'prettier --check .' }),
        leaf({ id: 'knip', label: 'Unused', command: 'knip' }),
        leaf({ id: 'tsc', label: 'Types', command: 'tsc --noEmit' }),
      ];

      // User wants to run eslint and prettier only
      const filtered = filterTree(actions, ['eslint', 'prettier']);

      expect(filtered).toHaveLength(2);
      expect(filtered.map((a: ResolvedNode) => a.id)).toEqual(['eslint', 'prettier']);
    });

    it('should warn about mixed ID and non-ID actions', () => {
      const actions: ResolvedNode[] = [
        leaf({ id: 'linter', label: 'Lint Code', command: 'eslint .' }),
        leaf({ label: 'Build App', command: 'npm run build' }),
        leaf({ id: 'test', label: 'Run Tests', command: 'npm test' }),
      ];

      filterTree(actions, ['linter', 'test']);

      expect(Logger.warn).toHaveBeenCalled();
      expect(Logger.skipLine).toHaveBeenCalled();
    });

    it('should handle large action lists efficiently', () => {
      // Create 100 actions
      const actions: ResolvedNode[] = Array.from({ length: 100 }, (_, index) =>
        leaf({
          id: `action-${index}`,
          label: `Action ${index}`,
          command: `cmd${index}`,
        }),
      );

      // Filter to 10 specific actions
      const requestedIds = ['action-5', 'action-15', 'action-25', 'action-35', 'action-45', 'action-55', 'action-65', 'action-75', 'action-85', 'action-95'];

      const filtered = filterTree(actions, requestedIds);

      expect(filtered).toHaveLength(10);
      expect(filtered.map((a: ResolvedNode) => a.id)).toEqual(requestedIds);
    });

    it('should maintain all action properties after filtering', () => {
      const actions: ResolvedNode[] = [
        leaf({ id: 'test-action', label: 'Test Action Label', command: 'npm run test -- --coverage' }),
        leaf({ id: 'build-action', label: 'Build Action', command: 'npm run build' }),
      ];

      const filtered = filterTree(actions, ['test-action']);

      // toMatchObject, not toEqual: a resolved node also carries kind, file and the two
      // paths, none of which this case is about.
      expect(filtered[0]).toMatchObject({
        id: 'test-action',
        label: 'Test Action Label',
        command: 'npm run test -- --coverage',
      });
    });
  });

  describe('Error message format validation', () => {
    it('should format duplicate IDs error message correctly', () => {
      const actions: ResolvedNode[] = [
        leaf({ id: 'duplicate', label: 'First', command: 'cmd1' }),
        leaf({ id: 'duplicate', label: 'Second', command: 'cmd2' }),
        leaf({ id: 'another-dup', label: 'Third', command: 'cmd3' }),
        leaf({ id: 'another-dup', label: 'Fourth', command: 'cmd4' }),
      ];

      expect(() => {
        filterTree(actions, ['duplicate']);
      }).toThrow(/^Duplicate action IDs found in configuration: (duplicate, another-dup|another-dup, duplicate)\. Each action must have a unique ID\.$/);
    });

    it('should format missing IDs error message with proper structure', () => {
      const actions: ResolvedNode[] = [leaf({ id: 'valid-id', label: 'Valid', command: 'cmd' }), leaf({ id: 'another-valid', label: 'Another', command: 'cmd2' })];

      try {
        filterTree(actions, ['missing-id']);
      } catch (error) {
        expect((error as Error).message).toContain('The following action IDs were not found: missing-id');
        expect((error as Error).message).toContain('Available IDs: ');
        expect((error as Error).message).toMatch(/valid-id/);
        expect((error as Error).message).toMatch(/another-valid/);
      }
    });

    it('should format warning message for actions without IDs', () => {
      const actions: ResolvedNode[] = [
        leaf({ id: 'with-id', label: 'Has ID', command: 'cmd1' }),
        leaf({ label: 'No ID 1', command: 'cmd2' }),
        leaf({ label: 'No ID 2', command: 'cmd3' }),
      ];

      filterTree(actions, ['with-id']);

      expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('Some actions do not have IDs defined'));
      expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('Actions without IDs: No ID 1, No ID 2'));
    });
  });

  describe('Return value verification', () => {
    it('should return array with correct action objects', () => {
      const actions: ResolvedNode[] = [leaf({ id: 'action-1', label: 'Action 1', command: 'cmd1' }), leaf({ id: 'action-2', label: 'Action 2', command: 'cmd2' })];

      const filtered = filterTree(actions, ['action-1']);

      expect(Array.isArray(filtered)).toBe(true);
      expect(filtered[0]).toHaveProperty('id');
      expect(filtered[0]).toHaveProperty('label');
      expect(filtered[0]).toHaveProperty('command');
    });

    it('should return new array instance (not mutate input)', () => {
      const actions: ResolvedNode[] = [leaf({ id: 'action-1', label: 'Action 1', command: 'cmd1' }), leaf({ id: 'action-2', label: 'Action 2', command: 'cmd2' })];

      const originalLength = actions.length;
      const filtered = filterTree(actions, ['action-1']);

      expect(filtered).not.toBe(actions);
      expect(actions).toHaveLength(originalLength);
    });

    it('should return actions in configuration file order', () => {
      const actions: ResolvedNode[] = [
        leaf({ id: 'zebra', label: 'Z Action', command: 'cmd-z' }),
        leaf({ id: 'alpha', label: 'A Action', command: 'cmd-a' }),
        leaf({ id: 'beta', label: 'B Action', command: 'cmd-b' }),
      ];

      // Request in alphabetical order
      const filtered = filterTree(actions, ['alpha', 'beta', 'zebra']);

      // Should return in config file order (zebra, alpha, beta)
      expect(filtered.map((a: ResolvedNode) => a.id)).toEqual(['zebra', 'alpha', 'beta']);
    });
  });
});

// The address space nesting introduces. Ids repeat legitimately across levels, so the
// dotted path is the identifier and a bare id only ever names a root-level action.
/** The issue's motivating config: `eslint` at the root and again under `tsc`. */
function motivating(): ResolvedNode[] {
  return [
    leaf({ id: 'eslint', label: 'Checking with ESLint' }),
    tree({ id: 'tsc', label: 'Checking with TSC' }, (self) => [
      leaf({ id: 'eslint', label: 'Checking with ESLint' }, self),
      leaf({ id: 'prettier', label: 'Checking with Prettier' }, self),
    ]),
  ];
}

/** `unicorn/better-dom-traversing` reads a literal `.children[0]` as DOM traversal. */
function childrenOf(node: ResolvedNode): ResolvedNode[] {
  return (node as ResolvedGroup).children;
}

describe('filterTree — dotted paths', () => {
  beforeEach(() => {
    vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger, 'skipLine').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects a nested leaf by its dotted path', () => {
    const filtered = filterTree(motivating(), ['tsc.eslint']);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('tsc');
    expect(childrenOf(filtered[0])).toHaveLength(1);
    expect(childrenOf(filtered[0]).map((child) => child.labelPath)).toEqual([['Checking with TSC', 'Checking with ESLint']]);
  });

  // The spine: an ancestor survives so the selected descendant still renders inside it.
  it('keeps the ancestor group of a selected descendant', () => {
    const filtered = filterTree(motivating(), ['tsc.prettier']);

    expect(filtered.map((node) => node.id)).toEqual(['tsc']);
    expect(childrenOf(filtered[0]).map((child) => child.id)).toEqual(['prettier']);
  });

  it('selecting a group brings its whole subtree', () => {
    const filtered = filterTree(motivating(), ['tsc']);

    expect(filtered).toHaveLength(1);
    expect(childrenOf(filtered[0]).map((child) => child.id)).toEqual(['eslint', 'prettier']);
  });

  // Exact dotted path only. A bare `eslint` is the root one, never `tsc.eslint`.
  it('a bare id selects the root-level action, not a nested one with the same id', () => {
    const filtered = filterTree(motivating(), ['eslint']);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].kind).toBe('leaf');
    expect(filtered[0].labelPath).toEqual(['Checking with ESLint']);
  });

  it('accepts the same id at two levels', () => {
    expect(() => filterTree(motivating(), ['eslint', 'tsc.eslint'])).not.toThrow();

    const filtered = filterTree(motivating(), ['eslint', 'tsc.eslint']);
    expect(filtered.map((node) => node.id)).toEqual(['eslint', 'tsc']);
  });

  it('preserves configuration order regardless of request order', () => {
    const filtered = filterTree(motivating(), ['tsc.prettier', 'eslint']);

    expect(filtered.map((node) => node.id)).toEqual(['eslint', 'tsc']);
  });

  describe('duplicates', () => {
    it('rejects a duplicate within one sibling set, naming the group', () => {
      const nodes = [tree({ id: 'tsc', label: 'Checking with TSC' }, (self) => [leaf({ id: 'eslint', label: 'First' }, self), leaf({ id: 'eslint', label: 'Second' }, self)])];

      expect(() => filterTree(nodes, ['tsc'])).toThrow('Duplicate action IDs found in configuration under "tsc": eslint.');
    });

    // Unchanged wording at the root, so the existing assertion survives verbatim.
    it('keeps the root message unchanged', () => {
      const nodes = [leaf({ id: 'eslint', label: 'First' }), leaf({ id: 'eslint', label: 'Second' })];

      expect(() => filterTree(nodes, ['eslint'])).toThrow('Duplicate action IDs found in configuration: eslint. Each action must have a unique ID.');
    });

    // An id-less group still has to be identifiable in an error about its children.
    it('names an id-less group by its label breadcrumb', () => {
      const nodes = [tree({ label: 'Anonymous group' }, (self) => [leaf({ id: 'dup', label: 'First' }, self), leaf({ id: 'dup', label: 'Second' }, self)])];

      expect(() => filterTree(nodes, ['x'])).toThrow('under "Anonymous group"');
    });

    // A defect in the file regardless of what was selected.
    it('reports a duplicate in a branch that was not selected', () => {
      const nodes = [
        leaf({ id: 'eslint', label: 'Root lint' }),
        tree({ id: 'tsc', label: 'TSC' }, (self) => [leaf({ id: 'dup', label: 'A' }, self), leaf({ id: 'dup', label: 'B' }, self)]),
      ];

      expect(() => filterTree(nodes, ['eslint'])).toThrow('under "tsc"');
    });
  });

  describe('unknown ids', () => {
    it('lists every addressable dotted path in configuration order', () => {
      expect(() => filterTree(motivating(), ['nope'])).toThrow('Available IDs: eslint, tsc, tsc.eslint, tsc.prettier');
    });

    it('rejects a nested id addressed without its prefix', () => {
      expect(() => filterTree(motivating(), ['prettier'])).toThrow('The following action IDs were not found: prettier.');
    });
  });

  describe('addressability', () => {
    // Structural: an id-less ancestor removes the whole subtree from the address space,
    // even where the descendants have ids of their own.
    it('makes descendants of an id-less group unaddressable', () => {
      const nodes = [tree({ label: 'Anonymous' }, (self) => [leaf({ id: 'inner', label: 'Inner' }, self)])];

      expect(() => filterTree(nodes, ['inner'])).toThrow('(none - no actions have IDs defined)');
    });

    it('warns about id-less nodes in the sets it walked, using breadcrumbs', () => {
      const nodes = [
        leaf({ id: 'eslint', label: 'Root lint' }),
        tree({ id: 'tsc', label: 'Checking with TSC' }, (self) => [leaf({ id: 'inner', label: 'Inner' }, self), leaf({ label: 'Anonymous inner' }, self)]),
      ];

      filterTree(nodes, ['tsc.inner']);

      expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('Checking with TSC > Anonymous inner'));
    });

    // A selected group is kept whole without walking into it, so its id-less children
    // were never excluded and there is nothing to warn about.
    it('does not warn about id-less children of a selected group', () => {
      const nodes = [tree({ id: 'tsc', label: 'TSC' }, (self) => [leaf({ label: 'Anonymous inner' }, self)])];

      filterTree(nodes, ['tsc']);

      expect(Logger.warn).not.toHaveBeenCalled();
    });
  });
});
