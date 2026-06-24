import { expect, test } from '@playwright/test'
import {
  cleanupDealArtifacts,
  saveLaunchReadyDeal,
  stopActiveRun,
  waitForDashboardReady,
} from './helpers'

const CODEX_READY_DEAL_ID = 'DEAL-2099-909'
const CODEX_READY_DEAL_NAME = 'Playwright Codex Ready Deal'
const API_HEADERS = {
  'access-control-allow-origin': 'http://127.0.0.1:4173',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ request }) => {
  cleanupDealArtifacts(CODEX_READY_DEAL_ID)
  await stopActiveRun(request)
})

test.afterEach(async ({ request }) => {
  await stopActiveRun(request)
  cleanupDealArtifacts(CODEX_READY_DEAL_ID)
})

test('enables a live Codex launch when ChatGPT auth is ready', async ({ page, request }) => {
  let codexStatusReads = 0
  let capturedLaunchBody: Record<string, unknown> | null = null

  await page.route('**/api/codex/status', async (route) => {
    codexStatusReads += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: API_HEADERS,
      body: JSON.stringify({
        installed: true,
        loggedIn: true,
        usingChatGpt: true,
        version: 'codex-cli playwright',
        loginStatus: 'Logged in using ChatGPT',
        error: null,
        authStorage: 'user-profile',
        storesCredentialsInRepo: false,
      }),
    })
  })

  await page.route('**/api/workflows/quick-deal-screen/launch', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: API_HEADERS })
      return
    }
    capturedLaunchBody = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      headers: API_HEADERS,
      body: JSON.stringify({
        runId: 'codex-playwright-ready-001',
        status: 'RUNNING',
        mode: 'live',
        speed: 'normal',
        runtimeProvider: 'codex',
        inputSnapshot: {
          path: 'data/runs/playwright-codex-ready/input-snapshot.json',
          sourceCoverage: { sourceDocumentCount: 0 },
        },
      }),
    })
  })

  await saveLaunchReadyDeal(request, CODEX_READY_DEAL_ID, CODEX_READY_DEAL_NAME)
  await page.addInitScript(() => {
    window.localStorage.removeItem('cre.workflowLauncher.v2')
  })

  await waitForDashboardReady(page)
  await page.getByTestId('header-workflows-button').click()
  const modal = page.getByTestId('workflow-launcher-modal')
  await expect(modal).toBeVisible()

  await modal.getByTestId('workflow-step-review').click()
  await expect(modal.getByTestId('workflow-runtime-provider-select')).toHaveValue('codex')
  await expect(modal.getByTestId('workflow-codex-auth-card')).toContainText('Logged in with ChatGPT')

  await modal.getByTestId('workflow-deal-select').selectOption(CODEX_READY_DEAL_ID)
  await modal.getByTestId('workflow-select').selectOption('quick-deal-screen')
  await modal.getByTestId('workflow-codex-agent-limit-select').selectOption('1')
  await modal.getByTestId('workflow-codex-concurrency-input').fill('3')
  await expect(modal.getByTestId('workflow-codex-search-toggle')).toBeChecked()

  const launchButton = modal.getByTestId('workflow-launch-selected')
  await expect(launchButton).toBeEnabled()
  await launchButton.click()

  await expect.poll(() => capturedLaunchBody).not.toBeNull()
  expect(codexStatusReads).toBeGreaterThan(0)
  expect(capturedLaunchBody).toMatchObject({
    dealId: CODEX_READY_DEAL_ID,
    scenario: 'core-plus',
    speed: 'normal',
    mode: 'live',
    reset: false,
    runtimeProvider: 'codex',
    codexMaxAgents: 1,
    codexConcurrency: 3,
    codexSearch: true,
    requireSourceBackedInputs: false,
  })
})
