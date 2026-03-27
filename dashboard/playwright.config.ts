import { defineConfig, devices } from '@playwright/test'

const useExternalServers = process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: useExternalServers
    ? undefined
    : [
        {
          command: 'npx tsx server/watcher.ts',
          cwd: '.',
          url: 'http://127.0.0.1:8081/api/run/status',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          command: 'npx vite --host 127.0.0.1 --port 4173 --strictPort',
          cwd: '.',
          url: 'http://127.0.0.1:4173',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
})
