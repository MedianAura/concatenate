/**
 * Its own module because both the config schema and the action schema need it, and
 * action-model importing config-model would close a cycle -- config-model imports the
 * action union.
 */
export const ExecutionType = ['series', 'parallel'] as const;

export type ExecutionTypeSchema = (typeof ExecutionType)[number];
