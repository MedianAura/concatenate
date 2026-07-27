import type { ExecutionTypeSchema } from './execution-type.js';

/**
 * The runtime shape the loader produces. Plain TypeScript, not zod: this is not input
 * anyone writes, it is what validated input resolves to.
 */
interface ResolvedBase {
  /**
   * Ancestor labels ending with this node's own, used for report breadcrumbs.
   */
  labelPath: string[];
  /**
   * `undefined` when this node **or any ancestor** lacks an id, which encodes "not
   * addressable from the CLI" structurally rather than by convention. It mirrors what
   * already happens to an id-less action today.
   */
  idPath?: string[];
  id?: string;
  label: string;
}

export interface ResolvedLeaf extends ResolvedBase {
  kind: 'leaf';
  command: string;
  /** The config file this leaf was written in, which is not the root once imports exist. */
  file: string;
}

export interface ResolvedGroup extends ResolvedBase {
  kind: 'group';
  type: ExecutionTypeSchema;
  children: ResolvedNode[];
}

export type ResolvedNode = ResolvedGroup | ResolvedLeaf;

export interface ResolvedConfig {
  type: ExecutionTypeSchema;
  nodes: ResolvedNode[];
}

/** Depth-first walk yielding every leaf in the tree, in configuration order. */
export function* walkLeaves(nodes: ResolvedNode[]): Generator<ResolvedLeaf> {
  for (const node of nodes) {
    if (node.kind === 'leaf') {
      yield node;
    } else {
      yield* walkLeaves(node.children);
    }
  }
}
