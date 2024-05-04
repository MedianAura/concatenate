#!/usr/bin/env node
import { readPackageSync } from 'read-pkg';
import { default as updateNotifier } from 'update-notifier';
import { run } from '../dist/index.js';

const packageJSON = await readPackageSync();

updateNotifier({
  pkg: packageJSON,
  updateCheckInterval: 1000 * 60 * 60 * 24 * 7, // 1 week
}).notify();

await run();
