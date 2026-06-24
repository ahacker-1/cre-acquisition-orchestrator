import { expect, test } from '@playwright/test'
import {
  cleanupDealArtifacts,
  saveLaunchReadyDeal,
  stopActiveRun,
  waitForDashboardReady,
} from './helpers'

const CARD_DEAL_ID = 'DEAL-2099-910'
const CARD_DEAL_NAME = 'Playwright Workflow Card Deal'
const API_HEADERS = {
  'access-control-allow-origin': 'http://127.0.0.1:4173',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ request }) => {
  cleanupDealArtifacts(CARD_DEAL_ID)
  await stopActiveRun(request)
})

test.afterEach(async ({ request }) => {
  await stopActiveRun(request)
  cleanupDealArtifacts(CARD_DEAL_ID)
})

test('workflow card launch uses the clicked workflow inputs, not stale selected workflow presets', async ({ page, request }) => {
  let capturedLaunchBody: Record<string, unknown> | null = null

  await page.route('**/api/codex/status', async (route) => {
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
  await page.route('**/api/workflows/underwriting-refresh/launch', async (route) => {
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
        runId: 'codex-playwright-card-001',
        status: 'RUNNING',
        mode: 'live',
        speed: 'normal',
        runtimeProvider: 'codex',
        inputSnapshot: {
          path: 'data/runs/playwright-workflow-card/input-snapshot.json',
          sourceCoverage: { sourceDocumentCount: 0 },
        },
      }),
    })
  })

  await saveLaunchReadyDeal(request, CARD_DEAL_ID, CARD_DEAL_NAME)
  await page.addInitScript((dealId) => {
    window.localStorage.setItem('cre.workflowLauncher.v2', JSON.stringify({
      dealId,
      workflowId: 'quick-deal-screen',
      presetId: 'stale-quick-screen-preset',
      scenario: 'core-plus',
      speed: 'normal',
      mode: 'live',
      runtimeProvider: 'codex',
      reset: false,
      codexMaxAgents: null,
      codexConcurrency: 2,
      codexSearch: true,
      requireSourceBackedInputs: false,
    }))
  }, CARD_DEAL_ID)

  await waitForDashboardReady(page)
  await page.getByTestId('header-workflows-button').click()
  const modal = page.getByTestId('workflow-launcher-modal')
  await expect(modal).toBeVisible()
  await modal.getByTestId('workflow-step-workflow').click()
  await expect(modal.getByTestId('workflow-launch-underwriting-refresh')).toBeEnabled()

  await modal.getByTestId('workflow-launch-underwriting-refresh').click()

  await expect.poll(() => capturedLaunchBody).not.toBeNull()
  expect(capturedLaunchBody).toMatchObject({
    dealId: CARD_DEAL_ID,
    mode: 'live',
    speed: 'normal',
    scenario: 'value-add',
    runtimeProvider: 'codex',
    codexMaxAgents: null,
    codexConcurrency: 2,
    codexSearch: true,
    requireSourceBackedInputs: false,
    reset: false,
  })
  expect(capturedLaunchBody?.presetId).toBeUndefined()
})
