import { SelfInvocationError } from '@/helpers/errors.js';
import { assertNoSelfInvocation, isSelfInvocation } from '@/helpers/self-invocation.js';
import { describe, expect, it } from 'vitest';

describe('isSelfInvocation', () => {
  it.each([
    ['concatenate check', 'the bare bin name'],
    ['npx concatenate check', 'a runner that takes the binary directly'],
    ['pnpm exec concatenate fix', 'a runner with a subcommand in between'],
    ['./node_modules/.bin/concatenate check', 'an explicit path to the local bin'],
    ['concatenate.cmd check', 'the Windows shim a bare name resolves to'],
  ])('flags %j — %s', (command) => {
    expect(isSelfInvocation(command)).toBe(true);
  });

  it.each([
    ['eslint .', 'an ordinary tool'],
    ['node concatenate-report.mjs', 'a filename that merely starts with the bin name'],
    ['npm run build', 'a script name a string scan cannot see through'],
    ['', 'an empty command'],
  ])('leaves %j alone — %s', (command) => {
    expect(isSelfInvocation(command)).toBe(false);
  });

  // The reason the check is basename equality and not `includes`. A substring test
  // rejects both of these, and both are legitimate.
  it('does not match on a shared prefix or suffix', () => {
    expect(isSelfInvocation('concatenate-cli check')).toBe(false);
    expect(isSelfInvocation('my-concatenate check')).toBe(false);
  });

  // `npm run build` is a false negative by design: the script it names is what calls
  // concatenate, and no scan of this string can know that. The env guard covers it.
  it('cannot see through a package script, which is what the env guard is for', () => {
    expect(isSelfInvocation('npm run check')).toBe(false);
  });
});

describe('assertNoSelfInvocation', () => {
  const clean = [
    { command: 'eslint .', labelPath: ['Lint'], file: '.concatenate/check.yaml' },
    { command: 'tsc --noEmit', labelPath: ['Type check'], file: '.concatenate/check.yaml' },
  ];

  it('passes a config with no self-invocation', () => {
    expect(() => assertNoSelfInvocation(clean)).not.toThrow();
  });

  it('passes an empty action list', () => {
    expect(() => assertNoSelfInvocation([])).not.toThrow();
  });

  it('throws a SelfInvocationError naming the label, the file and the command', () => {
    const actions = [...clean, { command: 'concatenate lint', labelPath: ['Checking with TSC', 'Run Linters'], file: '.concatenate/check.yaml' }];

    try {
      assertNoSelfInvocation(actions);
      expect.unreachable('expected assertNoSelfInvocation to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SelfInvocationError);
      expect((error as Error).message).toContain('use import instead');
      expect((error as Error).message).toContain('Checking with TSC > Run Linters');
      expect((error as Error).message).toContain('.concatenate/check.yaml');
      expect((error as Error).message).toContain('command: concatenate lint');
    }
  });

  // Windows separators would otherwise leak into the message, making it unassertable.
  it('normalises the reported path to forward slashes', () => {
    expect(() => assertNoSelfInvocation([{ command: 'concatenate check', labelPath: ['A'], file: String.raw`.concatenate\check.yaml` }])).toThrow('.concatenate/check.yaml');
  });

  // Per-leaf files are the point once imports exist: the offending action is usually not
  // in the file the user ran.
  it('reports the file the offending leaf came from, not the first one', () => {
    expect(() =>
      assertNoSelfInvocation([
        { command: 'eslint .', labelPath: ['Lint'], file: '.concatenate/check.yaml' },
        { command: 'concatenate check', labelPath: ['Shared', 'Loop'], file: '.concatenate/shared/lint.yaml' },
      ]),
    ).toThrow('.concatenate/shared/lint.yaml');
  });

  // Reported before anything spawns, so the first offender is the whole message: there
  // is no partial run to reconcile it against.
  it('reports the first offender', () => {
    expect(() =>
      assertNoSelfInvocation([
        { command: 'npx concatenate a', labelPath: ['First'], file: 'c.yaml' },
        { command: 'concatenate b', labelPath: ['Second'], file: 'c.yaml' },
      ]),
    ).toThrow('command: npx concatenate a');
  });
});
