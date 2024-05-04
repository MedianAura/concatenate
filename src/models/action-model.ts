import zod from 'zod';

export const ActionModel = zod
  .object({
    label: zod.string(),
    command: zod.string(),
  })
  .required();

export type ActionModelSchema = zod.infer<typeof ActionModel>;
