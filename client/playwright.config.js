import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test-browser',
  workers: 1,
  use: {
    baseURL: process.env.KRONOS_TEST_URL || 'http://localhost:3000',
    headless: true,
    launchOptions: process.env.CHROMIUM_PATH ? {
      executablePath: process.env.CHROMIUM_PATH,
      args: ['--no-sandbox', '--no-zygote', '--disable-dev-shm-usage'],
    } : {},
  },
});
