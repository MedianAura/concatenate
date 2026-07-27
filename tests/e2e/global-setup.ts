import { execa } from 'execa';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// The e2e cases run `bin/run.js`, which imports `dist/index.js`. This reproduces
// `pnpm build` without going through the package manager: calling tsc through node
// avoids resolving `pnpm.cmd` on Windows.
export default async function setup(): Promise<void> {
  await rm(path.join(root, 'dist'), { recursive: true, force: true });
  await execa(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.build.json'], {
    cwd: root,
    stdio: 'inherit',
  });
}
