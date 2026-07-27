import { z } from 'zod';
import { ExecutionType } from './execution-type.js';

/**
 * A node is exactly one of three forms, and every form is a `strictObject`.
 *
 * Strictness is what discriminates the union: `{ label, command, children }` fails all
 * three members, because each rejects the other members' keys. "Exactly one of command /
 * children / import" therefore needs no custom refinement.
 *
 * The rejected alternative was one flat object with every key optional plus a `.check()`
 * enforcing exactly-one. It gives a better single error message, but it destroys the TS
 * narrowing that the loader's `'command' in action` dispatch depends on.
 */
export const ActionModel = z.strictObject({
  id: z.string().optional(),
  label: z.string(),
  command: z.string(),
});

export const ActionImportModel = z.strictObject({
  id: z.string().optional(),
  label: z.string(),
  import: z.string(),
});

export type ActionModelSchema = z.infer<typeof ActionModel>;
export type ActionImportSchema = z.infer<typeof ActionImportModel>;

export interface ActionGroupSchema {
  children: ActionNodeSchema[];
  id?: string;
  label: string;
  type?: (typeof ExecutionType)[number];
}

export type ActionNodeSchema = ActionGroupSchema | ActionImportSchema | ActionModelSchema;

/**
 * The explicit `z.ZodType<...>` annotation breaks the value cycle: without it the getter
 * referencing `ActionNodeModel`, declared below it, is TS7022 "implicitly has type any".
 * The annotation widens only the static type -- `strictObject`'s runtime behaviour, which
 * is the whole discrimination mechanism, is retained.
 */
export const ActionGroupModel: z.ZodType<ActionGroupSchema> = z.strictObject({
  id: z.string().optional(),
  label: z.string(),
  // Optional, defaulting to `series` at resolution rather than here: a group that did not
  // declare a type and one that declared `series` are the same thing to the runner, but
  // the loader is where that decision is written down.
  type: z.enum(ExecutionType).optional(),
  // Recursion goes through a lazy getter on the shape -- zod 4's form for it.
  get children() {
    return z.array(ActionNodeModel);
  },
});

/**
 * The custom message is load-bearing, not decoration. A bare union reports
 * `✖ Invalid input → at actions[0]` and nothing else: zod cannot say which member was
 * meant, so it names none of them. That is a worse error than the non-union schema gave,
 * which is the one thing this change must not do.
 */
export const ActionNodeModel = z.union([ActionModel, ActionGroupModel, ActionImportModel], {
  error: 'An action needs a label plus exactly one of: command (a leaf), children (a group), or import (another config file). Unknown keys are rejected.',
});
