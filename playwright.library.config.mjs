import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/library-e2e', fullyParallel: false, workers: 1, retries: 0, reporter: 'list', timeout: 120000,
  use: { ...devices['Desktop Chrome'], actionTimeout: 15000, navigationTimeout: 30000, baseURL: 'http://localhost:3211', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node scripts/library-test-server.mjs', url: 'http://localhost:3211/admin/library', reuseExistingServer: false, timeout: 120000 },
});
