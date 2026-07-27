import type { ResolvedGroup, ResolvedNode } from '../models/config-tree.js';
import { Logger } from './logger.js';

/**
 * How a sibling set is named in a duplicate-id message. The dotted id path when the group
 * is addressable, the label breadcrumb when it is not -- an id-less group still has to be
 * identifiable in an error about its children.
 */
function describeParent(parent: ResolvedGroup): string {
  return parent.idPath === undefined ? parent.labelPath.join(' > ') : parent.idPath.join('.');
}

/**
 * Per sibling set, not globally. A flat unique-id namespace would reject the motivating
 * config outright -- `eslint` at the root and `eslint` under `tsc` are different actions
 * with the same short name -- and would make any imported file collide with its importer.
 *
 * Walks the whole tree rather than only the sets the prune visits: a duplicate is a defect
 * in the file regardless of what the user selected.
 */
function assertUniqueSiblings(nodes: ResolvedNode[], parent?: ResolvedGroup): void {
  const idCounts = new Map<string, number>();
  for (const node of nodes) {
    if (node.id) {
      idCounts.set(node.id, (idCounts.get(node.id) ?? 0) + 1);
    }
  }

  const duplicateIds = [...idCounts].filter(([, count]) => count > 1).map(([id]) => id);

  if (duplicateIds.length > 0) {
    // The root wording is unchanged from the flat implementation; nesting only inserts
    // the `under "..."` clause.
    const location = parent === undefined ? '' : ` under "${describeParent(parent)}"`;

    throw new Error(`Duplicate action IDs found in configuration${location}: ${duplicateIds.join(', ')}. Each action must have a unique ID.`);
  }

  for (const node of nodes) {
    if (node.kind === 'group') assertUniqueSiblings(node.children, node);
  }
}

/** Every addressable dotted path, depth-first in configuration order. */
function collectAddressable(nodes: ResolvedNode[], into: string[] = []): string[] {
  for (const node of nodes) {
    if (node.idPath !== undefined) into.push(node.idPath.join('.'));
    if (node.kind === 'group') collectAddressable(node.children, into);
  }

  return into;
}

function prune(nodes: ResolvedNode[], selectors: Set<string>, unaddressable: string[]): ResolvedNode[] {
  const kept: ResolvedNode[] = [];

  for (const node of nodes) {
    const key = node.idPath?.join('.');

    // A selected node brings its whole subtree, group or leaf. Nothing below it is
    // walked, which is also why its id-less descendants raise no warning: they were not
    // excluded.
    if (key !== undefined && selectors.has(key)) {
      kept.push(node);
      continue;
    }

    if (node.id === undefined) unaddressable.push(node.labelPath.join(' > '));

    // Otherwise a group survives only as the spine of a selected descendant, rebuilt with
    // just that branch -- so `check tsc.eslint` still renders the `tsc` group around it.
    if (node.kind === 'group') {
      const children = prune(node.children, selectors, unaddressable);

      if (children.length > 0) kept.push({ ...node, children });
    }
  }

  return kept;
}

/**
 * Narrows a resolved tree to the dotted id paths the user asked for, in configuration
 * order. Request order is ignored, which is the flat implementation's documented
 * behaviour carried forward.
 *
 * Matching is the exact dotted path and nothing else: a bare `eslint` selects the
 * root-level one, never `tsc.eslint`. Suffix shorthand -- unique suffix wins, ambiguous
 * errors -- would make the motivating config a trap, because the same bare id would mean
 * different things depending on what else happens to exist in the tree.
 */
export function filterTree(nodes: ResolvedNode[], requestedIds: string[]): ResolvedNode[] {
  assertUniqueSiblings(nodes);

  const availableIds = collectAddressable(nodes);
  const missingIds = requestedIds.filter((id) => !availableIds.includes(id));

  if (missingIds.length > 0) {
    throw new Error(`The following action IDs were not found: ${missingIds.join(', ')}.\nAvailable IDs: ${availableIds.join(', ') || '(none - no actions have IDs defined)'}`);
  }

  const unaddressable: string[] = [];
  const kept = prune(nodes, new Set(requestedIds), unaddressable);

  // Only the sibling sets the prune actually walked: warning about every id-less node in
  // a large tree is noise about branches the user never asked to reach.
  if (unaddressable.length > 0) {
    Logger.warn(`Warning: Some actions do not have IDs defined and will be excluded.\nActions without IDs: ${unaddressable.join(', ')}`);
    Logger.skipLine();
  }

  return kept;
}
