import { expect, test } from '@playwright/test'
import {
  cleanupDealArtifacts,
  openWorkspaceFromRecentDeals,
  saveLaunchReadyDeal,
  stopActiveRun,
} from './helpers'

const PHASE_DEAL_ID = 'DEAL-2099-911'
const PHASE_DEAL_NAME = 'Playwright Phase Codex Deal'
const API_HEADERS = {
  'access-control-allow-origin': 'http://127.0.0.1:4173',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ request }) => {
  cleanupDealArtifacts(PHASE_DEAL_ID)
  await stopActiveRun(request)
})

test.afterEach(async ({ request }) => {
  await stopActiveRun(request)
  cleanupDealArtifacts(PHASE_DEAL_ID)
})

test('phase Codex launches keep live web search enabled', async ({ page, request }) => {
  let capturedLaunchBody: Record<string, unknown> | null = null

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
        runId: 'codex-playwright-phase-001',
        status: 'RUNNING',
        mode: 'live',
        speed: 'fast',
        runtimeProvider: 'codex',
        inputSnapshot: {
          path: 'data/runs/playwright-phase-codex/input-snapshot.json',
          sourceCoverage: { sourceDocumentCount: 0 },
        },
      }),
    })
  })

  await saveLaunchReadyDeal(request, PHASE_DEAL_ID, PHASE_DEAL_NAME)
  await openWorkspaceFromRecentDeals(page, PHASE_DEAL_ID, PHASE_DEAL_NAME)

  await page.getByTestId('spine-step-underwriting').click()
  await expect(page.getByRole('heading', { name: 'Agent Playbook' })).toBeVisible()
  await expect(page.getByTestId('phase-runtime-provider-select-underwriting')).toHaveValue('codex')

  await page.getByTestId('phase-launch-underwriting').click()

  await expect.poll(() => capturedLaunchBody).not.toBeNull()
  expect(capturedLaunchBody).toMatchObject({
    dealId: PHASE_DEAL_ID,
    mode: 'live',
    speed: 'fast',
    scenario: 'core-plus',
    runtimeProvider: 'codex',
    codexMaxAgents: null,
    codexConcurrency: 2,
    codexSearch: true,
    requireSourceBackedInputs: true,
    reset: false,
  })
})
