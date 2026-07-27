import { z } from 'zod';
import { ActionModel } from './action-model.js';

const ConfigType = ['series', 'parallel'] as const;

export const ConfigModel = z
  .object({
    type: z.enum(ConfigType),
    actions: z.array(ActionModel),
  })
  .required()
  .strict();

export type ConfigModelSchema = z.infer<typeof ConfigModel>;
