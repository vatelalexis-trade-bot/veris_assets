import { defineConfig } from 'vitest/config';

// Unit tests: no external service needed. Database tests (*.int-spec.ts) run with
// vitest.integration.config.ts.
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'scripts/**/*.spec.ts'],
  },
});
