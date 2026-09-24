import { defineConfig } from 'vitest/config';

// Root tests cover repository tooling only; each package runs its own tests.
export default defineConfig({
  test: {
    include: ['scripts/**/*.test.mjs'],
  },
});
