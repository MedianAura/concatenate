import { parseCommandString } from 'execa';
import path from 'node:path';
import { SelfInvocationError } from './errors.js';

/** The bin name in package.json. A command resolving to this is concatenate itself. */
const BINARY_NAME = 'concatenate';

/**
 * Runners that execute their own argument rather than being the program: for these the
 * interesting token is somewhere after the first. `npm`/`pnpm`/`yarn`/`bun` are here for
 * `pnpm exec concatenate`, not for `npm run build` -- the latter names a script, and no
 * string scan can see what that script runs. The env guard is what covers it.
 */
const PACKAGE_RUNNERS = new Set(['bun', 'bunx', 'npm', 'npx', 'pnpm', 'pnpx', 'yarn']);

export interface ScannedAction {
  command: string;
  /**
   * Ancestor labels ending with the action's own. A single entry today; nesting fills
   * the rest in, which is why the message joins with ` > ` for a case that cannot yet
   * happen.
   */
  labelPath: string[];
}

/**
 * Basename equality, never substring: `node concatenate-report.mjs` is a legitimate
 * command that a `includes('concatenate')` test would reject. `path.parse().name` also
 * drops the extension, so `concatenate.cmd` -- what a bare `concatenate` resolves to on
 * Windows -- matches the same way `./node_modules/.bin/concatenate` does.
 */
function isConcatenateToken(token: string): boolean {
  return path.parse(token).name === BINARY_NAME;
}

/** Whether a single `command:` string invokes concatenate. */
export function isSelfInvocation(command: string): boolean {
  const [first, ...rest] = parseCommandString(command);

  if (first === undefined) return false;
  if (isConcatenateToken(first)) return true;

  return PACKAGE_RUNNERS.has(path.parse(first).name) && rest.some((token) => isConcatenateToken(token));
}

/**
 * Rejects a config that invokes concatenate, before anything is spawned.
 *
 * Deliberately not per-action at spawn time: a `type: parallel` config would already
 * have launched the other branches by the time the offending one ran, and the point is
 * that nothing starts.
 */
export function assertNoSelfInvocation(actions: ScannedAction[], configFile: string): void {
  const offender = actions.find((action) => isSelfInvocation(action.command));

  if (offender === undefined) return;

  // Forward slashes on every platform: the path is read, not passed to a shell, and a
  // message that changes shape per-OS is one no test can assert on.
  const location = configFile.replaceAll(path.sep, '/');

  throw new SelfInvocationError(
    [
      'Avoid using concatenate within itself, use import instead for better CLI flow.',
      '',
      `  ${offender.labelPath.join(' > ')}`,
      `  ${location}`,
      `  command: ${offender.command}`,
    ].join('\n'),
  );
}
