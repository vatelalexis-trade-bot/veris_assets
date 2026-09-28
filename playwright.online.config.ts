import { defineConfig, devices } from '@playwright/test';

// Read-only checks of the online demonstration (phase 16b, docs/DEPLOYMENT.md):
//   ONLINE_URL=https://… pnpm test:online
export default defineConfig({
  testDir: './tests/online',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.ONLINE_URL ?? 'https://veris-assets.com',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
