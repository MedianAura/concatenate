import { z } from 'zod';
import { ActionNodeModel } from './action-model.js';
import { ExecutionType } from './execution-type.js';

/**
 * A config file and a group node stay separate types on purpose. A file has no `label`,
 * keys its list `actions` rather than `children`, and its `type` is mandatory.
 *
 * The payoff is that an imported file *is* an ordinary config file: every config that
 * exists today is importable as-is, and an imported one is still runnable on its own.
 *
 * `.required()` is gone -- it was a no-op here, and would have become actively wrong the
 * moment an optional top-level key appeared.
 */
export const ConfigModel = z.strictObject({
  type: z.enum(ExecutionType),
  actions: z.array(ActionNodeModel),
});

export type ConfigModelSchema = z.infer<typeof ConfigModel>;
