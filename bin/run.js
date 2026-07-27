#!/usr/bin/env node
import { run } from '../dist/index.js';

// `update-notifier` coûte ~350 ms d'import, soit le tiers du démarrage. Il n'a rien
// à afficher quand la sortie n'est pas un terminal : hors TTY, il sort du chemin
// critique entièrement — import compris, d'où le `await import()` dans la branche.
if (process.stdout.isTTY) {
  const { readFileSync } = await import('node:fs');
  const { default: updateNotifier } = await import('update-notifier');

  // Depuis l'emplacement du module, pas process.cwd() : autrement update-notifier
  // interroge le registre pour le package du projet appelant.
  const packageJSON = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), { encoding: 'utf8' }));

  updateNotifier({
    pkg: packageJSON,
    updateCheckInterval: 1000 * 60 * 60 * 24, // 1 day
  }).notify();
}

const status = await run();

process.exit(status);
