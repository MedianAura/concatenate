#!/usr/bin/env node
import { readPackageSync } from 'read-pkg';
import { default as updateNotifier } from 'update-notifier';
import { run } from '../dist/src/index.js';

const packageJSON = await readPackageSync();

updateNotifier({
  pkg: packageJSON,
  updateCheckInterval: 1000 * 60 * 60 * 24, // 1 day
}).notify();

const status = await run();
// eslint-disable-next-line n/no-process-exit
process.exit(status);
