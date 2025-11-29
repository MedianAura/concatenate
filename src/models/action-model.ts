import zod from 'zod';

export const ActionModel = zod.object({
  id: zod.string().optional(),
  label: zod.string(),
  command: zod.string(),
});

export type ActionModelSchema = zod.infer<typeof ActionModel>;
