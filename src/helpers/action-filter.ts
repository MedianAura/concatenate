import { Logger } from './logger.js';

/**
 * Narrows a config's actions to the ids the user asked for, in configuration order.
 *
 * Generic over the node shape rather than tied to `ActionModelSchema`: the same rule now
 * runs against resolved tree nodes, which carry more than a leaf does.
 *
 * Still flat: ids form one namespace and duplicates anywhere are rejected. Tree-aware
 * selection replaces this, which is why it is a free function -- there is no state here,
 * and the class it lived on only made it harder to test.
 */
export function filterActionsByIds<T extends { id?: string; label: string }>(actions: T[], requestedIds: string[]): T[] {
  // Check for duplicate IDs in configuration
  const idCounts = new Map<string, number>();
  for (const action of actions) {
    if (action.id) {
      idCounts.set(action.id, (idCounts.get(action.id) || 0) + 1);
    }
  }

  const duplicateIds = [...idCounts].filter(([, count]) => count > 1).map(([id]) => id);

  if (duplicateIds.length > 0) {
    throw new Error(`Duplicate action IDs found in configuration: ${duplicateIds.join(', ')}. Each action must have a unique ID.`);
  }

  // Get actions with IDs and available IDs
  const actionsWithIds = actions.filter((action) => action.id !== undefined);
  const availableIds = new Set(actionsWithIds.map((action) => action.id!));

  // Check if requested IDs exist
  const missingIds = requestedIds.filter((id) => !availableIds.has(id));
  if (missingIds.length > 0) {
    const availableIdsList = [...availableIds].join(', ');
    throw new Error(`The following action IDs were not found: ${missingIds.join(', ')}.\nAvailable IDs: ${availableIdsList || '(none - no actions have IDs defined)'}`);
  }

  // Warn about actions without IDs that will be excluded
  const actionsWithoutIds = actions.filter((action) => action.id === undefined);
  if (actionsWithoutIds.length > 0) {
    Logger.warn(`Warning: Some actions do not have IDs defined and will be excluded.\nActions without IDs: ${actionsWithoutIds.map((a) => a.label).join(', ')}`);
    Logger.skipLine();
  }

  // Filter to only requested IDs (preserving order from configuration)
  return actions.filter((action) => action.id && requestedIds.includes(action.id));
}
