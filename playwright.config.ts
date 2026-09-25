import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end scenarios of SPEC §29 in a real browser (docs/ARCHITECTURE.md: tests/e2e). The
 * application is started by scripts/e2e-server.sh; locally, a running `pnpm dev` is reused.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'en-GB',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bash scripts/e2e-server.sh',
    url: 'http://localhost:3000/en/login',
    reuseExistingServer: !process.env.CI,
    timeout: 600_000,
    stdout: 'pipe',
  },
});
