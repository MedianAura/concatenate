/**
 * Raised when concatenate is asked to run itself, by either layer of the guard.
 *
 * A distinct class rather than a message match: `run()` maps it to its own exit code,
 * and exit codes are the only part of a CLI's contract a script can act on.
 */
export class SelfInvocationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'SelfInvocationError';
  }
}
