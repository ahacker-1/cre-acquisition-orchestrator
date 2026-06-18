import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'

const useExternalServers = process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1'
const recordVideo = process.env.PLAYWRIGHT_RECORD_VIDEO === '1'
const chromiumExecutableCandidates =
  process.platform === 'darwin'
    ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      ]
    : process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        ]
      : [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/microsoft-edge',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
        ]
const localChromiumExecutable = chromiumExecutableCandidates.find((candidate) => existsSync(candidate))
const chromeLaunchOptions = localChromiumExecutable
  ? { launchOptions: { executablePath: localChromiumExecutable } }
  : {}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  // Hardened for slow / contended machines (CI, or local file-sync/AV load): retry transient
  // timeout flakes and allow generous budgets. Test assertions/coverage are unchanged.
  retries: 2,
  timeout: 240_000,
  expect: {
    timeout: 30_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: recordVideo ? 'retain-on-failure' : 'off',
  },
  projects: [
    {
      name: 'chromium',
      grepInvert: /@mobile/,
      use: { ...devices['Desktop Chrome'], ...chromeLaunchOptions },
    },
    {
      name: 'mobile-chrome',
      grep: /@mobile/,
      use: { ...devices['Pixel 5'], ...chromeLaunchOptions },
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
