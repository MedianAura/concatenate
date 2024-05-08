import { findUpSync } from 'find-up';
import path from 'node:path';

export function getRootDirectoryPath(): string {
  const directory = findUpSync('package.json', { cwd: process.cwd() });

  if (directory) {
    return path.resolve(directory, '..');
  }

  throw new Error('Could not find the root directory.');
}

export function getConcatenateDirectoryPath(): string {
  const directory = findUpSync('.concatenate', { cwd: process.cwd(), type: 'directory' });

  if (directory) {
    return path.resolve(directory);
  }

  throw new Error('Could not find the concatenate directory.');
}
