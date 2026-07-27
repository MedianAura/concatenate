import { ConfigModel } from '@/models/config-model.js';
import { describe, expect, it } from 'vitest';

/** A config wrapper, so every case is exercised through the schema users actually hit. */
function parse(actions: unknown[], type = 'series'): ReturnType<typeof ConfigModel.safeParse> {
  return ConfigModel.safeParse({ type, actions });
}

describe('ActionNodeModel', () => {
  describe('accepts each of the three forms', () => {
    it('a leaf', () => {
      expect(parse([{ id: 'a', label: 'A', command: 'eslint .' }]).success).toBe(true);
    });

    it('a leaf without an id', () => {
      expect(parse([{ label: 'A', command: 'eslint .' }]).success).toBe(true);
    });

    it('a group', () => {
      expect(parse([{ id: 'g', label: 'G', type: 'parallel', children: [{ label: 'L', command: 'x' }] }]).success).toBe(true);
    });

    it('a group without a type', () => {
      expect(parse([{ label: 'G', children: [{ label: 'L', command: 'x' }] }]).success).toBe(true);
    });

    it('an import', () => {
      expect(parse([{ id: 'i', label: 'I', import: './other.yaml' }]).success).toBe(true);
    });

    // Nothing bounds `children` depth: it is bounded by the file, and cannot loop.
    it('a group nested inside a group', () => {
      expect(parse([{ label: 'G', children: [{ label: 'G2', children: [{ label: 'L', command: 'x' }] }] }]).success).toBe(true);
    });

    // Sibling-scoped uniqueness: the same id at two levels is legal, and is the whole
    // reason a flat unique-id namespace was not an option.
    it('the same id at two levels', () => {
      expect(parse([{ id: 'eslint', label: 'Outer', children: [{ id: 'eslint', label: 'Inner', command: 'x' }] }]).success).toBe(true);
    });

    it('an empty children list', () => {
      expect(parse([{ label: 'G', children: [] }]).success).toBe(true);
    });
  });

  // Strictness is the discrimination mechanism: each member rejects the others' keys, so
  // a node carrying two of them matches no member.
  describe('rejects a node carrying more than one form', () => {
    it('command and children', () => {
      expect(parse([{ label: 'X', command: 'x', children: [] }]).success).toBe(false);
    });

    it('command and import', () => {
      expect(parse([{ label: 'X', command: 'x', import: './other.yaml' }]).success).toBe(false);
    });

    it('children and import', () => {
      expect(parse([{ label: 'X', children: [], import: './other.yaml' }]).success).toBe(false);
    });

    it('all three', () => {
      expect(parse([{ label: 'X', command: 'x', children: [], import: './other.yaml' }]).success).toBe(false);
    });
  });

  describe('rejects malformed nodes', () => {
    it('a node with none of the three', () => {
      expect(parse([{ label: 'X' }]).success).toBe(false);
    });

    // Breaking change: ActionModel was non-strict, so a typo was silently ignored.
    it('an unknown key', () => {
      expect(parse([{ label: 'X', command: 'x', commmand: 'typo' }]).success).toBe(false);
    });

    it('an unknown key on a group', () => {
      expect(parse([{ label: 'G', children: [], concurrent: true }]).success).toBe(false);
    });

    it('a non-string label', () => {
      expect(parse([{ label: 12, command: 'x' }]).success).toBe(false);
    });

    it('an invalid group type', () => {
      expect(parse([{ label: 'G', type: 'sideways', children: [] }]).success).toBe(false);
    });

    // The recursion is real validation, not a shape that accepts anything.
    it('a malformed child of a valid group', () => {
      expect(parse([{ label: 'G', children: [{ label: 'L' }] }]).success).toBe(false);
    });
  });

  describe('the config file itself', () => {
    it('rejects type: sideways', () => {
      expect(parse([], 'sideways').success).toBe(false);
    });

    it('rejects an unknown top-level key', () => {
      expect(ConfigModel.safeParse({ type: 'series', actions: [], concurrency: 4 }).success).toBe(false);
    });

    it('rejects a file carrying a label, which is a group key not a file key', () => {
      expect(ConfigModel.safeParse({ type: 'series', label: 'X', actions: [] }).success).toBe(false);
    });

    it('accepts an empty action list', () => {
      expect(parse([]).success).toBe(true);
    });
  });
});
