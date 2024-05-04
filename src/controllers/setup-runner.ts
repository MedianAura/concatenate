import json5 from 'json5';
import fs from 'node:fs';
import path from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { ConfigurationDefault } from '../constants/configuration-default.js';
import { Logger } from '../helpers/logger.js';
import { getRootDirectoryPath } from '../helpers/root-directory-path.js';
import { CommandSetupModel, type SetupFileExtensionType } from '../models/command-model.js';

const stringifyJSON = json5.stringify;

export class SetupRunner {
  public async run(extension: SetupFileExtensionType): Promise<void> {
    const currentExtension: SetupFileExtensionType = CommandSetupModel.parse(extension);

    Logger.title(`Creating configuration with format: ${extension}`);
    for (const configuration in ConfigurationDefault) {
      const writable = this.getString(ConfigurationDefault[configuration], currentExtension);
      const configFile = path.resolve(getRootDirectoryPath(), `${configuration}.${currentExtension}`);

      Logger.info(`Writing file <${configFile}>`);
      fs.writeFileSync(configFile, writable, { encoding: 'utf8' });
    }

    Logger.success('Configuration files created.');
  }

  public getString(data: unknown, extension: SetupFileExtensionType): string {
    if (extension === 'yaml') {
      return stringifyYaml(data, { indent: 2 });
    }

    if (extension === 'json') {
      return stringifyJSON(data, undefined, 2);
    }

    throw new Error('Unsupported file extension.');
  }
}
