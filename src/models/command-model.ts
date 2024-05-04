import z from 'zod';

export const SetupFileExtension = ['yaml', 'json'] as const;

export type SetupFileExtensionType = (typeof SetupFileExtension)[number];

export const CommandSetupModel = z.enum(SetupFileExtension);

export type CommandSetupModelSchema = z.infer<typeof CommandSetupModel>;
