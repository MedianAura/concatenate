import z from 'zod';
import { ActionModel } from './action-model.js';

const ConfigurationType = ['series', 'parallel'] as const;

export const ConfigurationModel = z
  .object({
    type: z.enum(ConfigurationType),
    actions: z.array(ActionModel),
  })
  .required();

export type ConfigurationModelSchema = z.infer<typeof ConfigurationModel>;
