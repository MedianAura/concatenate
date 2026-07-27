#!/usr/bin/env node
import { run } from '../dist/index.js';

// `update-notifier` costs ~350 ms to import, a third of startup. It has nothing to
// show when stdout is not a terminal, so outside a TTY it leaves the critical path
// entirely -- the import included, hence the `await import()` inside the branch.
if (process.stdout.isTTY) {
  const { readFileSync } = await import('node:fs');
  const { default: updateNotifier } = await import('update-notifier');

  // From the module location, not process.cwd(): otherwise update-notifier queries
  // the registry for the calling project's package.
  const packageJSON = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), { encoding: 'utf8' }));

  updateNotifier({
    pkg: packageJSON,
    updateCheckInterval: 1000 * 60 * 60 * 24, // 1 day
  }).notify();
}

const status = await run();

process.exit(status);
