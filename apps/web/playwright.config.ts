import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests against running apps (API on :4000 with seeded data, web on :3000).
 * In CI the workflow starts both. Locally: pnpm dev, then pnpm --filter @shopsense/web test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    // Use a locally installed Chrome if PLAYWRIGHT_CHROME_PATH is set (no browser download needed).
    launchOptions: process.env.PLAYWRIGHT_CHROME_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH, args: ['--no-sandbox'] }
      : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
});
