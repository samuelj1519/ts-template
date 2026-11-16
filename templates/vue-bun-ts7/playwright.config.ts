import { defineConfig, devices } from '@playwright/test';

const port = process.env['FRONTEND_TEST_PORT'] ?? '0';
const identity = process.env['FRONTEND_TEST_IDENTITY'] ?? 'unallocated';
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'artifacts/playwright-report', open: 'never' }]],
  outputDir: 'artifacts/playwright',
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node tools/checks/serve.ts ${port} ${identity}`,
    url: `${baseURL}/__template_test_identity/${identity}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
