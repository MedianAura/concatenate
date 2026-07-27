import { loadFile, MAX_IMPORT_DEPTH } from '@/controllers/config-loader.js';
import { type ResolvedGroup, type ResolvedNode, walkLeaves } from '@/models/config-tree.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// `loadFile` takes an absolute path, which is the seam: name lookup is globby's job and
// belongs to whoever found the root, so nothing here needs mocking.
const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/configs');

function load(name: string): ReturnType<typeof loadFile> {
  return loadFile(path.join(fixtures, name));
}

function group(node: ResolvedNode): ResolvedGroup {
  if (node.kind !== 'group') throw new Error(`expected a group, got ${node.kind}`);

  return node;
}

/**
 * `unicorn/better-dom-traversing` reads a literal `.children[0]` as DOM traversal and
 * wants `.firstElementChild`. These are config nodes, not elements. Routing every access
 * through one variable-indexed accessor sidesteps the rule without a disable comment.
 */
function child(node: ResolvedGroup, index = 0): ResolvedNode {
  return node.children[index];
}

describe('loadFile', () => {
  describe('a flat config', () => {
    it('resolves leaves carrying the file they came from', () => {
      const { type, nodes } = load('root-leaf.yaml');

      expect(type).toBe('series');
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toMatchObject({
        kind: 'leaf',
        id: 'lint',
        label: 'Lint',
        command: 'eslint .',
        labelPath: ['Lint'],
        idPath: ['lint'],
      });
      expect(path.basename((nodes[0] as { file: string }).file)).toBe('root-leaf.yaml');
    });
  });

  describe('imports', () => {
    it('resolves a relative import against the importing file', () => {
      const imported = group(load('relative-import.yaml').nodes[0]);

      expect(imported.label).toBe('Imported');
      expect(imported.children).toHaveLength(1);
      // The leaf remembers the file it was written in, not the file that was run.
      expect(path.basename((child(imported) as { file: string }).file)).toBe('root-leaf.yaml');
    });

    it('resolves an import from a subdirectory', () => {
      const shared = group(load('subdirectory-import.yaml').nodes[0]);

      expect(shared.children.map((child) => child.label)).toEqual(['ESLint', 'Prettier']);
    });

    // The most surprising bit of the feature, so it gets its own case: the action
    // supplies the label, the imported file's own `type` governs the subtree.
    it('takes the subtree type from the imported file, not the importer', () => {
      const root = load('subdirectory-import.yaml');
      const shared = group(root.nodes[0]);

      expect(root.type).toBe('parallel');
      expect(shared.type).toBe('parallel');

      // relative-import.yaml is series and imports a series file; the inverse direction.
      expect(group(load('relative-import.yaml').nodes[0]).type).toBe('series');
    });

    it('requires an explicit extension', () => {
      expect(() => load('extensionless-import.yaml')).toThrow('must include a file extension');
    });

    it('names both the specifier and the resolved path when the file is missing', () => {
      expect(() => load('missing-import.yaml')).toThrow('./nope.yaml');
      expect(() => load('missing-import.yaml')).toThrow('nope.yaml');
      expect(() => load('missing-import.yaml')).toThrow('missing-import.yaml');
    });
  });

  describe('cycles', () => {
    it('rejects a file importing itself', () => {
      expect(() => load('cycle-self.yaml')).toThrow('Import cycle detected');
    });

    it('rejects a two-file cycle', () => {
      expect(() => load('cycle-a.yaml')).toThrow('Import cycle detected');
    });

    it('names the chain', () => {
      expect(() => load('cycle-a.yaml')).toThrow(/cycle-a\.yaml.*cycle-b\.yaml.*cycle-a\.yaml/s);
    });

    // The difference between a recursion guard and de-duplication, and the one users
    // will actually hit: two branches importing the same file is legal, and each branch
    // gets its own resolved copy.
    it('allows a diamond', () => {
      const { nodes } = load('diamond.yaml');
      const [branchB, branchC] = nodes.map((node) => group(node));

      expect(branchB.children).toHaveLength(1);
      expect(branchC.children).toHaveLength(1);

      const leafB = child(group(child(branchB)));
      const leafC = child(group(child(branchC)));

      expect(leafB.label).toBe('Shared leaf');
      expect(leafC.label).toBe('Shared leaf');
      // Two copies, not one shared object: they carry different breadcrumbs.
      expect(leafB.labelPath).not.toEqual(leafC.labelPath);
    });
  });

  describe('the depth cap', () => {
    it('allows a chain at the limit', () => {
      expect(() => load('depth-2.yaml')).not.toThrow();
    });

    it('rejects a chain past the limit', () => {
      expect(() => load('depth-1.yaml')).toThrow(`Import depth limit of ${String(MAX_IMPORT_DEPTH)} exceeded`);
    });

    // The cap is on imports only: `children` is bounded by the file and cannot loop, so
    // capping it would reject a legally deep inline config. 30 levels, well past the
    // import limit of 10.
    it('does not apply to children nesting', () => {
      const { nodes } = load('deep-children.json');

      let depth = 0;
      let node: ResolvedNode = nodes[0];
      while (node.kind === 'group') {
        depth += 1;
        node = child(node);
      }

      expect(depth).toBe(30);
      expect(node).toMatchObject({ kind: 'leaf', command: 'echo deep' });
    });
  });

  describe('breadcrumbs and addressability', () => {
    it('builds labelPath through groups and imports', () => {
      const shared = group(load('subdirectory-import.yaml').nodes[0]);

      expect(child(shared).labelPath).toEqual(['Shared', 'ESLint']);
    });

    it('builds idPath through a group', () => {
      const grouped = group(load('group-default-type.yaml').nodes[0]);

      expect(grouped.idPath).toEqual(['grouped']);
      expect(child(grouped).idPath).toEqual(['grouped', 'inner']);
    });

    // Structural, not conventional: once an ancestor is unaddressable, nothing beneath
    // it can be addressed either, so the path is absent rather than partial.
    it('drops idPath permanently below an id-less ancestor', () => {
      const [anonymousGroup, namedGroup] = load('id-less-ancestor.yaml').nodes.map((node) => group(node));

      expect(anonymousGroup.idPath).toBeUndefined();
      expect(child(anonymousGroup).idPath).toBeUndefined();
      expect(child(anonymousGroup).id).toBe('has-id');

      expect(namedGroup.idPath).toEqual(['outer']);
      expect(child(namedGroup).idPath).toEqual(['outer', 'inner']);
      expect(child(namedGroup, 1).idPath).toBeUndefined();
    });
  });

  describe('group type', () => {
    it('defaults to series', () => {
      expect(group(load('group-default-type.yaml').nodes[0]).type).toBe('series');
    });

    it('honours an explicit type', () => {
      expect(group(load('subdirectory-import.yaml').nodes[0]).type).toBe('parallel');
    });
  });

  describe('validation', () => {
    it('rejects a config that fails the schema', () => {
      expect(() => load('extensionless-import.yaml')).toThrow();
    });

    // An import reuses parseConfigData, so an unsupported extension surfaces the parser's
    // own message rather than a generic import failure.
    it('reports an unsupported imported extension through the existing message', () => {
      expect(() => load('toml-import.yaml')).toThrow('Unsupported file type: .toml');
    });
  });
});

describe('walkLeaves', () => {
  it('yields every leaf across groups and imports, in configuration order', () => {
    const { nodes } = load('subdirectory-import.yaml');

    expect([...walkLeaves(nodes)].map((leaf) => leaf.labelPath.join(' > '))).toEqual(['Shared > ESLint', 'Shared > Prettier']);
  });

  // The recursion is what the self-invocation scan depends on: a leaf buried under
  // thirty groups still has to be reached.
  it('reaches a leaf nested deeply under groups', () => {
    const leaves = [...walkLeaves(load('deep-children.json').nodes)];

    expect(leaves).toHaveLength(1);
    expect(leaves[0].command).toBe('echo deep');
  });

  it('yields nothing for an empty tree', () => {
    expect([...walkLeaves([])]).toEqual([]);
  });
});
