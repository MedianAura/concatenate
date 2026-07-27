import { ActionModel } from '@/models/action-model.js';
import { CommandSetupModel } from '@/models/command-model.js';
import { ConfigModel } from '@/models/config-model.js';
import { describe, expect, it } from 'vitest';

describe('ActionModel', () => {
  it('accepts an action without an id', () => {
    expect(ActionModel.safeParse({ label: 'Lint', command: 'eslint .' }).success).toBe(true);
  });

  it('rejects an action without a command', () => {
    expect(ActionModel.safeParse({ label: 'Lint' }).success).toBe(false);
  });

  it('rejects a non-string label', () => {
    expect(ActionModel.safeParse({ label: 12, command: 'eslint .' }).success).toBe(false);
  });
});

describe('ConfigModel', () => {
  it('accepts series and parallel', () => {
    for (const type of ['series', 'parallel']) {
      expect(ConfigModel.safeParse({ type, actions: [] }).success).toBe(true);
    }
  });

  it('rejects an unknown type', () => {
    expect(ConfigModel.safeParse({ type: 'sideways', actions: [] }).success).toBe(false);
  });

  // .strict(): a typo in a key should fail loudly rather than be silently dropped.
  it('rejects unknown keys', () => {
    expect(ConfigModel.safeParse({ type: 'series', actions: [], actionz: [] }).success).toBe(false);
  });

  it('rejects a missing actions array', () => {
    expect(ConfigModel.safeParse({ type: 'series' }).success).toBe(false);
  });

  it('validates nested actions', () => {
    expect(ConfigModel.safeParse({ type: 'series', actions: [{ label: 'no command' }] }).success).toBe(false);
  });
});

describe('CommandSetupModel', () => {
  it.each(['yaml', 'json'])('accepts %s', (extension) => {
    expect(CommandSetupModel.parse(extension)).toBe(extension);
  });

  it('rejects an unsupported extension', () => {
    expect(() => CommandSetupModel.parse('toml')).toThrow();
  });
});
