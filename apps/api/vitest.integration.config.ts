import { defineConfig } from 'vitest/config';

// Integration tests against a real PostgreSQL (docker compose locally, service container in CI).
// The test database is rebuilt from the migrations before every run.
export default defineConfig({
  test: {
    include: ['src/**/*.int-spec.ts'],
    globalSetup: ['./scripts/db/test-global-setup.ts'],
    // One shared database: files run one after the other.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
