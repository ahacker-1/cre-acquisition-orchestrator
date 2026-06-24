import { expect, test } from '@playwright/test'
import {
  cleanupDealArtifacts,
  openAdvancedDrawer,
  openWorkspaceFromRecentDeals,
  saveLaunchReadyDeal,
  stopActiveRun,
} from './helpers'

const SWARM_DEAL_ID = 'DEAL-2099-912'
const SWARM_DEAL_NAME = 'Playwright Swarm Source Gate Deal'
const API_HEADERS = {
  'access-control-allow-origin': 'http://127.0.0.1:4173',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}

function swarmPlan(dataGaps: string[]) {
  return {
    workflowId: 'quick-deal-screen',
    workflowName: 'Quick Deal Screen',
    runtimeProvider: 'codex',
    requiresConfirmation: true,
    readiness: dataGaps.length > 0 ? 'blocked' : 'ready',
    dataGaps,
    explanation: 'Quick Deal Screen is the best-fit swarm for a fast go/no-go decision.',
    agentPlan: [
      {
        agentName: 'rent-roll-analyst',
        displayName: 'Rent Roll Analyst',
        phaseLabel: 'Underwriting',
        critical: true,
        reason: 'Checks source-backed rent roll signals.',
      },
    ],
    handoffs: [{ from: 'Rent Roll Analyst', to: 'IC Memo Writer' }],
    nextAction:
      dataGaps.length > 0
        ? { label: 'Unblock source-backed inputs', detail: dataGaps[0], target: 'documents' }
        : { label: 'Launch Quick Deal Screen', detail: 'Ready for Codex review.', target: 'advanced' },
    launchRequest: {
      dealId: SWARM_DEAL_ID,
      workflowId: 'quick-deal-screen',
      scenario: 'core-plus',
      speed: 'fast',
      mode: 'fast',
      runtimeProvider: 'codex',
      requireSourceBackedInputs: true,
      reset: true,
    },
  }
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ request }) => {
  cleanupDealArtifacts(SWARM_DEAL_ID)
  await stopActiveRun(request)
})

test.afterEach(async ({ request }) => {
  await stopActiveRun(request)
  cleanupDealArtifacts(SWARM_DEAL_ID)
})

async function openSwarmConsole(page: Parameters<typeof openAdvancedDrawer>[0], request: Parameters<typeof saveLaunchReadyDeal>[0]) {
  await saveLaunchReadyDeal(request, SWARM_DEAL_ID, SWARM_DEAL_NAME)
  await openWorkspaceFromRecentDeals(page, SWARM_DEAL_ID, SWARM_DEAL_NAME)
  const drawer = await openAdvancedDrawer(page)
  const mission = drawer.getByTestId('mission-control')
  await expect(mission).toContainText('Acquisition Command')
  return mission.getByTestId('swarm-goal-console')
}

test('blocked swarm plans cannot launch around source-backed readiness', async ({ page, request }) => {
  let launchRequested = false

  await page.route('**/api/swarm/plan', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: API_HEADERS,
      body: JSON.stringify(swarmPlan(['Approve 4 more source-backed inputs before relying on this swarm.'])),
    })
  })
  await page.route('**/api/workflows/quick-deal-screen/launch', async (route) => {
    launchRequested = true
    await route.fulfill({ status: 500, contentType: 'application/json', headers: API_HEADERS, body: '{}' })
  })

  const swarmConsole = await openSwarmConsole(page, request)
  await swarmConsole.getByTestId('swarm-goal-input').fill('Help me decide whether this acquisition is worth pursuing')
  await swarmConsole.getByTestId('swarm-plan-button').click()

  await expect(swarmConsole.getByTestId('swarm-readiness')).toContainText('1 blocker')
  await expect(swarmConsole.getByTestId('swarm-blockers')).toContainText('Approve 4 more source-backed inputs')
  await expect(swarmConsole.getByTestId('swarm-launch-button')).toBeDisabled()
  expect(launchRequested).toBe(false)
})

test('ready swarm launches preserve source-backed input enforcement', async ({ page, request }) => {
  let capturedLaunchBody: Record<string, unknown> | null = null

  await page.route('**/api/swarm/plan', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: API_HEADERS,
      body: JSON.stringify(swarmPlan([])),
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
        runId: 'codex-playwright-swarm-source-gate-001',
        status: 'RUNNING',
        mode: 'live',
        speed: 'fast',
        runtimeProvider: 'codex',
      }),
    })
  })

  const swarmConsole = await openSwarmConsole(page, request)
  await swarmConsole.getByTestId('swarm-goal-input').fill('Help me decide whether this acquisition is worth pursuing')
  await swarmConsole.getByTestId('swarm-plan-button').click()
  await expect(swarmConsole.getByTestId('swarm-launch-button')).toBeEnabled()

  await swarmConsole.getByTestId('swarm-launch-button').click()

  await expect.poll(() => capturedLaunchBody).not.toBeNull()
  expect(capturedLaunchBody).toMatchObject({
    dealId: SWARM_DEAL_ID,
    workflowId: 'quick-deal-screen',
    runtimeProvider: 'codex',
    codexMaxAgents: null,
    codexConcurrency: 2,
    codexSearch: true,
    requireSourceBackedInputs: true,
    reset: false,
  })
})
