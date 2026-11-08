import { defineConfig, devices } from '@playwright/test';

// Opt-in only: the launcher provisions disposable role sessions. Do not enable
// traces, screenshots on failure, or video around credential entry.
export default defineConfig({
  testDir: './e2e/database', fullyParallel: false, workers: 1, timeout: 90_000,
  outputDir: './test-results/database', reporter: 'line',
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'off', screenshot: 'off', video: 'off' },
  projects: [{ name: 'chromium-database', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npm run dev:live', url: 'http://127.0.0.1:5174', reuseExistingServer: !process.env.CI },
});
