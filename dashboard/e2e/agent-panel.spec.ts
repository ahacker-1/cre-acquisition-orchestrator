import { expect, test, type Page } from '@playwright/test'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import {
  cleanupDealArtifacts,
  dataRoot,
  focusStage,
  openWorkspaceFromRecentDeals,
  saveLaunchReadyDeal,
  stopActiveRun,
} from './helpers'

// Phase 3 (A7) — summon → watch → read, OFFLINE/replay path (no Codex).
//
// Seeds a deal with RECORDED agent activity (a COMPLETE agent checkpoint with summary + verdict
// and a `document_created` story event for its workpaper), then summons that agent two ways:
//   1. the Your Team rail, and
//   2. a command-bar suggestion chip / free-text intent.
// Opening the agent must REPLAY its recorded work in the AgentPanel with no new run started, and
// offline the follow-up box stays disabled (single-agent dispatch is codex-only).
//
// The data is seeded directly to disk (the durable pattern used by the partial-failure /
// red-flag tests) so it survives the simulation-run `reset` that wipes data/status during the
// suite. Agent checkpoints arrive in the initial WS payload (written before connect); the
// recorded story events + the workpaper's `document_created` event are broadcast as the ndjson
// file is added (written after connect).

const PANEL_DEAL_ID = 'DEAL-2099-908'
const PANEL_DEAL_NAME = 'Playwright Agent Panel Deal'
const PANEL_RUN_ID = 'sim-playwright-agent-panel-001'
// financial-model-builder is an underwriting-phase registry agent, so it appears in the
// Underwriting Your Team rail and the "Refresh the model" command-bar chip maps to it.
const PANEL_AGENT_ID = 'financial-model-builder'
const PANEL_AGENT_NAME = 'Financial Model Builder'

test.describe.configure({ mode: 'serial' })

// Write a completed deal checkpoint + a COMPLETE agent checkpoint before connecting, so they
// arrive in the initial WebSocket payload and drive this deal's recorded view.
function writeRecordedAgentCheckpoint(runtimeProvider: 'simulation' | 'codex' = 'simulation'): void {
  const updatedAt = '2099-03-01T00:00:00.000Z'
  const checkpoint = {
    dealId: PANEL_DEAL_ID,
    dealName: PANEL_DEAL_NAME,
    property: { address: '500 Operator Way', city: 'Austin', state: 'TX', zip: '78701', totalUnits: 12, askingPrice: 3_600_000 },
    status: 'COMPLETE',
    workflowId: 'underwriting-refresh',
    workflowName: 'Underwriting Refresh',
    runtimeProvider,
    overallProgress: 100,
    startedAt: updatedAt,
    lastUpdatedAt: updatedAt,
    completedAt: updatedAt,
    phases: {
      underwriting: {
        status: 'COMPLETE',
        progress: 1,
        outputs: { phaseSummary: 'Underwriting model refreshed.', keyFindings: [], redFlags: [], dataGaps: [], phaseVerdict: 'PASS' },
        agentStatuses: { [PANEL_AGENT_ID]: 'complete' },
      },
    },
    resumeInstructions: 'Underwriting complete.',
  }

  const dealStatusFile = join(dataRoot, 'status', `${PANEL_DEAL_ID}.json`)
  const agentFile = join(dataRoot, 'status', PANEL_DEAL_ID, 'agents', `${PANEL_AGENT_ID}.json`)
  mkdirSync(dirname(agentFile), { recursive: true })
  writeFileSync(dealStatusFile, JSON.stringify(checkpoint, null, 2))
  writeFileSync(
    agentFile,
    JSON.stringify(
      {
        agentName: PANEL_AGENT_ID,
        phase: 'underwriting',
        dealId: PANEL_DEAL_ID,
        status: 'COMPLETE',
        progress: 1,
        startedAt: updatedAt,
        completedAt: updatedAt,
        lastUpdatedAt: updatedAt,
        resumePoint: null,
        outputs: {
          summary: 'Base-case model calibrated and validated.',
          findings: ['Going-in cap rate 5.4%; exit cap held at 5.5%.'],
          metrics: { irr: 0.16 },
          verdict: 'PASS',
        },
        dataGaps: [],
        errors: [],
        redFlags: [],
        childAgents: [],
      },
      null,
      2,
    ),
  )
}

// Written after the client connects: the watcher broadcasts each new ndjson event over the
// WebSocket. Includes the agent's reasoning stream + a `document_created` event for its
// workpaper (the client synthesizes the DocumentArtifact from that event, so the panel's output
// card renders without a separate active-run documents file).
function writeRecordedAgentEvents(): void {
  const eventsFile = join(dataRoot, 'status', PANEL_DEAL_ID, `run-${PANEL_RUN_ID}-events.ndjson`)
  mkdirSync(dirname(eventsFile), { recursive: true })
  const base = { runId: PANEL_RUN_ID, dealId: PANEL_DEAL_ID, phase: 'underwriting', phaseLabel: 'Underwriting' }
  const events = [
    { ...base, seq: 1, ts: '2099-03-01T00:00:01.000Z', kind: 'agent_started', agent: PANEL_AGENT_ID, title: `${PANEL_AGENT_ID} started` },
    { ...base, seq: 2, ts: '2099-03-01T00:00:02.000Z', kind: 'agent_message', agent: PANEL_AGENT_ID, summary: 'Calibrating the base-case model.' },
    {
      ...base,
      seq: 3,
      ts: '2099-03-01T00:00:03.000Z',
      kind: 'document_created',
      agent: PANEL_AGENT_ID,
      docId: `underwriting:${PANEL_AGENT_ID}:workpaper-v1`,
      docType: 'workpaper',
      title: `${PANEL_AGENT_ID} Workpaper`,
      path: `data/reports/${PANEL_DEAL_ID}/underwriting/${PANEL_AGENT_ID}-workpaper-v1.md`,
      summary: 'Base-case underwriting workpaper.',
    },
    { ...base, seq: 4, ts: '2099-03-01T00:00:04.000Z', kind: 'agent_completed', agent: PANEL_AGENT_ID, title: `${PANEL_AGENT_ID} completed` },
  ]
  writeFileSync(eventsFile, events.map((event) => JSON.stringify(event)).join('\n') + '\n')
}

function cleanupPanelDeal(): void {
  cleanupDealArtifacts(PANEL_DEAL_ID)
  const reports = join(dataRoot, 'reports', PANEL_DEAL_ID)
  if (existsSync(reports)) rmSync(reports, { recursive: true, force: true })
}

test.beforeEach(async ({ request }) => {
  cleanupPanelDeal()
  await stopActiveRun(request)
})

test.afterEach(async ({ request }) => {
  await stopActiveRun(request)
  cleanupPanelDeal()
})

// Open the seeded deal's workspace, then seed its recorded story events (after connect) and
// focus Underwriting where the agent is staffed.
async function openSeededDealAtUnderwriting(
  page: Page,
  request: Parameters<typeof saveLaunchReadyDeal>[0],
  runtimeProvider: 'simulation' | 'codex' = 'simulation',
): Promise<void> {
  await saveLaunchReadyDeal(request, PANEL_DEAL_ID, PANEL_DEAL_NAME)
  // Checkpoints before connect (initial payload); deal status file marks the deal complete.
  writeRecordedAgentCheckpoint(runtimeProvider)
  await stopActiveRun(request)
  await openWorkspaceFromRecentDeals(page, PANEL_DEAL_ID, PANEL_DEAL_NAME)
  // Story events after connect (broadcast as the ndjson file is added).
  writeRecordedAgentEvents()
  await focusStage(page, 'underwriting')
}

test('summons an agent from the Your Team rail and replays its recorded work (offline)', async ({ page, request }) => {
  await openSeededDealAtUnderwriting(page, request)

  const railAgent = page.getByTestId(`team-agent-${PANEL_AGENT_ID}`)
  await expect(railAgent).toBeVisible()
  await railAgent.click()

  // The agent panel slides in with the agent's identity and its replayed reasoning stream.
  const panel = page.getByTestId('agent-panel')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('heading', { name: PANEL_AGENT_NAME })).toBeVisible()
  const stream = page.getByTestId('agent-panel-stream')
  await expect(stream).toBeVisible()
  // Recorded story events render as stream lines (status resolves to done from the checkpoint).
  await expect(stream).toContainText(`${PANEL_AGENT_ID} completed`, { timeout: 20_000 })

  // The agent filed a workpaper (its document_created event), so the output card renders with the
  // workpaper title + an "open full workpaper" action.
  const output = page.getByTestId('agent-panel-output')
  await expect(output).toBeVisible()
  await expect(output).toContainText(`${PANEL_AGENT_ID} Workpaper`)
  await expect(page.getByTestId('agent-panel-open-workpaper')).toBeVisible()

  // Offline = replay: the follow-up box is present but disabled (codex-only dispatch).
  await expect(page.getByTestId('agent-followup-input')).toBeDisabled()

  await page.getByTestId('agent-panel-close').click()
  await expect(panel).toBeHidden()
})

test('single-agent Codex follow-up keeps live web search enabled', async ({ page, request }) => {
  await openSeededDealAtUnderwriting(page, request, 'codex')

  const railAgent = page.getByTestId(`team-agent-${PANEL_AGENT_ID}`)
  await expect(railAgent).toBeVisible()
  await railAgent.click()

  const panel = page.getByTestId('agent-panel')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('heading', { name: PANEL_AGENT_NAME })).toBeVisible()
  const input = page.getByTestId('agent-followup-input')
  await expect(input).toBeEnabled()

  let capturedBody: Record<string, unknown> | null = null
  await page.route('**/api/workflows/full-acquisition-review/launch', async (route) => {
    capturedBody = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ runId: 'run-single-agent-live', status: 'starting', state: 'STARTING' }),
    })
  })

  await input.fill('Refresh lender terms with current market context')
  await input.press('Enter')

  await expect.poll(() => capturedBody).not.toBeNull()
  expect(capturedBody!.runtimeProvider).toBe('codex')
  expect(capturedBody!.codexAgents).toEqual([PANEL_AGENT_ID])
  expect(capturedBody!.codexMaxAgents).toBe(1)
  expect(capturedBody!.codexSearch).toBe(true)
  expect(capturedBody!.reset).toBe(false)
  expect(capturedBody!.notes).toBe('Refresh lender terms with current market context')
})

test('a command-bar chip opens the right agent panel', async ({ page, request }) => {
  await openSeededDealAtUnderwriting(page, request)

  // The underwriting chip "Refresh the model" carries intent agent:financial-model-builder.
  const chip = page.locator(`[data-testid^="command-chip-"][data-intent="agent:${PANEL_AGENT_ID}"]`)
  await expect(chip).toBeVisible()
  await chip.click()

  const panel = page.getByTestId('agent-panel')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('heading', { name: PANEL_AGENT_NAME })).toBeVisible()
  await expect(page.getByTestId('agent-panel-stream')).toBeVisible()
  // Fix C: a chip summon echoes what was asked — the panel shows the task + its source.
  await expect(panel).toContainText('Your command')

  await page.getByTestId('agent-panel-close').click()
  await expect(panel).toBeHidden()
})

test('a command-bar free-text intent routes to the matching agent', async ({ page, request }) => {
  await openSeededDealAtUnderwriting(page, request)

  // Free text routed by the documented keyword map: "refresh the model" -> financial-model-builder.
  await page.getByTestId('command-input').fill('refresh the model')
  await page.getByTestId('command-submit').click()

  const panel = page.getByTestId('agent-panel')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('heading', { name: PANEL_AGENT_NAME })).toBeVisible()
  // Fix C: the panel echoes the exact typed command as its task.
  await expect(panel).toContainText('refresh the model')

  await page.getByTestId('agent-panel-close').click()
  await expect(panel).toBeHidden()
})
