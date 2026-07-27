import { fileURLToPath } from 'node:url';
import { defaultExclude, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Must mirror `paths` in tsconfig.json: the tests import through `@/`.
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Without `include` v8 only reports files a test happened to load, so an entirely
      // untested module reads as 100%. `all` makes the untested ones count.
      include: ['src/**/*.ts'],
      all: true,
      // The CLI wiring: commander registration and the top-level parse. Exercised by
      // the e2e suite, which runs in subprocesses where v8 cannot instrument it.
      exclude: ['src/index.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['./tests/**/*.test.ts'],
          // Not redundant with the `.test.ts` glob: it is the only thing stopping an
          // e2e file named `*.test.ts` from being picked up as a unit test, run without
          // the globalSetup that builds `dist/`, and counted against the coverage
          // thresholds it was never meant to satisfy.
          // Spread rather than replaced: assigning `exclude` drops vitest's defaults.
          exclude: [...defaultExclude, './tests/e2e/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['./tests/e2e/**/*.spec.ts'],
          // The cases run `bin/run.js`, which imports `dist/`: it has to exist before
          // the first one. In globalSetup rather than a `pretest` script so a bare
          // `vitest` stays correct.
          globalSetup: './tests/e2e/global-setup.ts',
          // Each case pays CLI boot, so they run concurrently and need the slots.
          maxConcurrency: 12,
          // A node subprocess per case, plus the tsc build up front.
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
