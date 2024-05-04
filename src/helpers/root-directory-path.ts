import { findUpSync } from 'find-up';
import { fileURLToPath } from 'node:url';

export function getRootDirectoryPath(): string {
  const directory = findUpSync('.concatenate', { cwd: fileURLToPath(import.meta.url), type: 'directory' });

  if (directory) {
    return directory;
  }

  throw new Error('Could not find the root directory.');
}
