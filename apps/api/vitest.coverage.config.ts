import { defineConfig } from 'vitest/config';

// Coverage of the Registry module (SPEC §25: at least 90 %), measured on its unit and database
// tests together. Servicing joins in phase 14.
export default defineConfig({
  test: {
    include: ['src/modules/registry/**/*.spec.ts', 'src/modules/registry/**/*.int-spec.ts'],
    globalSetup: ['./scripts/db/test-global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/modules/registry/**/*.ts'],
      // Table declarations: no logic, their callbacks only run when migrations are generated.
      exclude: [
        'src/modules/registry/**/*.spec.ts',
        'src/modules/registry/**/*.int-spec.ts',
        'src/modules/registry/infrastructure/schema.ts',
      ],
      reporter: ['text-summary', 'text'],
      // SPEC §25's 90 % applies to lines, statements and functions; branches have a floor (D-073).
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 75 },
    },
  },
});
