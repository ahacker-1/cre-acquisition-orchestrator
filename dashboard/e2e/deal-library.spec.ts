import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import {
  API_URL,
  cleanupDealArtifacts,
  cleanupGeneratedRuntimeArtifacts,
  closeAdvancedDrawer,
  dataRoot,
  expectApiOk,
  firstRealDealRoot,
  focusStage,
  isApiResponse,
  launchWorkflowForDeal,
  openAdvancedDrawer,
  openWorkspaceFromRecentDeals,
  parserFixturesRoot,
  saveLaunchReadyDeal,
  stopActiveRun,
  waitForDashboardReady,
} from './helpers'

const DRAFT_DEAL_ID = 'DEAL-2099-901'
const DRAFT_DEAL_NAME = 'Playwright Draft Deal'
const READY_DEAL_ID = 'DEAL-2099-902'
const READY_DEAL_NAME = 'Playwright Launch Deal'
const SAMPLE_DEAL_ID = 'demo-pass-001'
const WORKSPACE_DEAL_ID = 'DEAL-2099-903'
const WORKSPACE_DEAL_NAME = 'Playwright Operator Hub Deal'
const RECENT_DEAL_ID = 'DEAL-2099-904'
const RECENT_DEAL_NAME = 'Playwright Recent Deal'
const PARTIAL_DEAL_ID = 'DEAL-2099-905'
const PARTIAL_DEAL_NAME = 'Playwright Partial Failure Deal'
const PARTIAL_RUN_ID = 'codex-playwright-partial-001'
const RED_FLAG_DEAL_ID = 'DEAL-2099-906'
const RED_FLAG_DEAL_NAME = 'Playwright Red Flag Deal'

function cleanupWorkflowPresets(): void {
  const target = join(dataRoot, 'workflow-presets')
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true })
  }
}

// W72: write a deal checkpoint that finished with a failed specialist agent, plus its
// agent checkpoint and an `agent_failed` story event. The watcher broadcasts these over
// the WebSocket so the dashboard surfaces the partial-failure recovery panel offline,
// without depending on a real Codex process.
const PARTIAL_FAILED_AGENT = 'scenario-analyst'

function writePartialFailureCheckpoint(dealId: string, dealName: string): void {
  const updatedAt = '2099-01-01T00:00:00.000Z'
  const checkpoint = {
    dealId,
    dealName,
    property: { address: '900 Partial Way', city: 'Austin', state: 'TX', zip: '78701', totalUnits: 12, askingPrice: 3_600_000 },
    status: 'COMPLETE',
    workflowId: 'quick-deal-screen',
    workflowName: 'Quick Deal Screen',
    runtimeProvider: 'codex',
    overallProgress: 100,
    startedAt: updatedAt,
    lastUpdatedAt: updatedAt,
    completedAt: updatedAt,
    phases: {
      underwriting: {
        status: 'COMPLETE',
        progress: 1,
        outputs: { phaseSummary: 'Underwriting completed with a failed specialist.', keyFindings: [], redFlags: [], dataGaps: [], phaseVerdict: 'NEEDS_REVIEW' },
        agentStatuses: {
          'financial-model-builder': 'complete',
          'scenario-analyst': 'failed',
        },
      },
    },
    resumeInstructions: 'Re-run the failed scenario-analyst agent.',
  }

  const dealStatusFile = join(dataRoot, 'status', `${dealId}.json`)
  const agentFile = join(dataRoot, 'status', dealId, 'agents', `${PARTIAL_FAILED_AGENT}.json`)

  mkdirSync(dirname(agentFile), { recursive: true })
  writeFileSync(dealStatusFile, JSON.stringify(checkpoint, null, 2))
  writeFileSync(
    agentFile,
    JSON.stringify(
      {
        agentName: PARTIAL_FAILED_AGENT,
        phase: 'underwriting',
        dealId,
        status: 'failed',
        progress: 0,
        startedAt: updatedAt,
        completedAt: null,
        lastUpdatedAt: updatedAt,
        resumePoint: null,
        outputs: { summary: 'Scenario analyst failed to produce a workpaper.', findings: [], metrics: {}, verdict: null },
        dataGaps: [],
        errors: [{ message: 'Codex exec returned non-zero exit.', timestamp: updatedAt, recoverable: true }],
        redFlags: [],
        childAgents: [],
      },
      null,
      2,
    ),
  )
}

// Written after the client connects: the watcher broadcasts the new ndjson file's
// `agent_failed` event over the WebSocket, supplying the prior run id used for re-run.
function writePartialFailureEvent(dealId: string, runId: string): void {
  const eventsFile = join(dataRoot, 'status', dealId, `run-${runId}-events.ndjson`)
  mkdirSync(dirname(eventsFile), { recursive: true })
  writeFileSync(
    eventsFile,
    JSON.stringify({
      runId,
      dealId,
      seq: 1,
      ts: '2099-01-01T00:00:00.000Z',
      kind: 'agent_failed',
      phase: 'underwriting',
      phaseLabel: 'Underwriting',
      agent: PARTIAL_FAILED_AGENT,
      summary: 'Scenario analyst failed after 3 attempts.',
    }) + '\n',
  )
}

// W62: write a completed deal checkpoint that carries a specialist red flag so the IC
// package view can drill from the flag back to its originating workpaper. Broadcast over
// the WebSocket by the watcher, so no real run is required.
function writeRedFlagRun(dealId: string, dealName: string): void {
  const updatedAt = '2099-02-01T00:00:00.000Z'
  const checkpoint = {
    dealId,
    dealName,
    property: { address: '700 Red Flag Road', city: 'Austin', state: 'TX', zip: '78701', totalUnits: 18, askingPrice: 3_600_000 },
    status: 'COMPLETE',
    workflowId: 'quick-deal-screen',
    workflowName: 'Quick Deal Screen',
    overallProgress: 100,
    startedAt: updatedAt,
    lastUpdatedAt: updatedAt,
    completedAt: updatedAt,
    phases: {
      underwriting: {
        status: 'COMPLETE',
        progress: 1,
        verdict: 'NEEDS_REVIEW',
        outputs: {
          phaseSummary: 'Underwriting flagged a debt service coverage concern.',
          keyFindings: ['DSCR below lender threshold'],
          redFlags: [
            {
              description: 'Projected DSCR of 1.05x is below the 1.25x lender minimum.',
              severity: 'HIGH',
              category: 'financing',
              owner: 'Financial Model Builder',
              impact: 'May block agency debt sizing at the target leverage.',
            },
          ],
          dataGaps: [],
          phaseVerdict: 'NEEDS_REVIEW',
        },
        agentStatuses: { 'financial-model-builder': 'complete' },
      },
    },
    resumeInstructions: 'Review the DSCR red flag before committee.',
  }
  const dealStatusFile = join(dataRoot, 'status', `${dealId}.json`)
  mkdirSync(dirname(dealStatusFile), { recursive: true })
  writeFileSync(dealStatusFile, JSON.stringify(checkpoint, null, 2))
}

async function waitForRunIdle(request: APIRequestContext): Promise<void> {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const response = await request.get(`${API_URL}/api/run/status`)
    const payload = (await response.json()) as { active?: boolean }
    if (!payload.active) return
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500))
  }
  throw new Error('Timed out waiting for active run to finish')
}

async function expectViewportAtTop(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5_000 }).toBeLessThan(20)
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })

  page.on('pageerror', (error) => {
    errors.push(error.message)
  })

  return errors
}

async function openWizard(page: Page): Promise<void> {
  await page.getByTestId('header-new-deal-button').click()
  await expect(page.getByTestId('deal-wizard-modal').getByRole('heading', { name: /Create a Deal|Edit Deal/ })).toBeVisible()
}

async function openDealLibraryModal(page: Page) {
  await page.getByTestId('header-deals-button').click()
  return page.getByTestId('deal-library-modal')
}

async function goNext(page: Page): Promise<void> {
  await page.getByTestId('deal-wizard-next').click()
}

async function fillLaunchReadyDeal(page: Page, dealId: string, dealName: string): Promise<void> {
  const wizard = page.getByTestId('deal-wizard-modal')
  await wizard.getByTestId('deal-id-input').fill(dealId)
  await wizard.getByTestId('deal-name-input').fill(dealName)
  await wizard.getByRole('spinbutton', { name: 'Target Hold Period (years)' }).fill('5')
  await wizard.getByRole('spinbutton', { name: /Target IRR/ }).fill('0.15')
  await wizard.getByRole('spinbutton', { name: 'Target Equity Multiple' }).fill('1.9')
  await wizard.getByRole('spinbutton', { name: /Target Cash-on-Cash/ }).fill('0.08')
  await goNext(page)

  await wizard.getByRole('textbox', { name: 'Street Address' }).fill('500 Release Avenue')
  await wizard.getByRole('textbox', { name: 'City' }).fill('Austin')
  await wizard.getByRole('textbox', { name: /State/ }).fill('TX')
  await wizard.getByRole('textbox', { name: 'ZIP Code' }).fill('78701')
  await wizard.getByRole('spinbutton', { name: 'Year Built' }).fill('2003')
  await wizard.getByRole('spinbutton', { name: 'Total Units' }).fill('18')
  await goNext(page)

  await wizard.getByRole('textbox', { name: 'Type' }).fill('1BR/1BA')
  await wizard.getByRole('spinbutton', { name: 'Count' }).fill('18')
  await wizard.getByRole('spinbutton', { name: 'Avg Sq Ft' }).fill('725')
  await wizard.getByRole('spinbutton', { name: 'Market Rent' }).fill('1700')
  await wizard.getByRole('spinbutton', { name: 'In-Place Rent' }).fill('1600')
  await goNext(page)

  await wizard.getByRole('spinbutton', { name: 'Asking Price' }).fill('3600000')
  await wizard.getByRole('spinbutton', { name: 'Current NOI' }).fill('230000')
  await wizard.getByRole('spinbutton', { name: /In-Place Occupancy/ }).fill('0.94')
  await wizard.getByRole('spinbutton', { name: 'Target LTV (decimal)' }).fill('0.7')
  await wizard.getByRole('spinbutton', { name: 'Estimated Rate (decimal)' }).fill('0.061')
  await wizard.getByRole('spinbutton', { name: 'Loan Term' }).fill('10')
  await wizard.getByRole('spinbutton', { name: 'Amortization' }).fill('30')
  await goNext(page)

  await wizard.getByRole('textbox', { name: 'Seller Entity' }).fill('Playwright Seller LLC')
  await wizard.getByRole('textbox', { name: 'PSA Execution Date' }).fill('2026-04-01')
  await wizard.getByRole('textbox', { name: 'DD Start Date' }).fill('2026-04-02')
  await wizard.getByRole('textbox', { name: 'DD Expiration Date' }).fill('2026-04-20')
  await wizard.getByRole('textbox', { name: 'Closing Date' }).fill('2026-05-15')
  await wizard.getByRole('combobox', { name: 'Speed' }).selectOption('fast')
  await page.getByTestId('deal-wizard-next').click()
}

function documentCoverageStat(page: Page) {
  return page.getByText('Doc Coverage').locator('..')
}

// Intake now leads with the auto-filled deal record; the per-field extraction approve/reject/
// waive + provenance flow lives behind the "Source documents & detailed review" disclosure.
// Open it (idempotently) before driving any of that detailed-review machinery. The disclosure's
// open-state is owned by the workspace so it survives the stage body re-mounting on refresh; this
// helper just opens it the first time and is a no-op once it is already open.
async function openIntakeDetailedReview(page: Page): Promise<void> {
  const details = page.getByTestId('intake-detailed-review')
  await expect(details).toBeVisible()
  if (!(await details.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await details.locator('summary').click()
  }
  await expect.poll(() => details.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(true)
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ request }) => {
  cleanupDealArtifacts(DRAFT_DEAL_ID)
  cleanupDealArtifacts(READY_DEAL_ID)
  cleanupDealArtifacts(SAMPLE_DEAL_ID)
  cleanupDealArtifacts(WORKSPACE_DEAL_ID)
  cleanupDealArtifacts(RECENT_DEAL_ID)
  cleanupDealArtifacts(PARTIAL_DEAL_ID)
  cleanupDealArtifacts(RED_FLAG_DEAL_ID)
  cleanupGeneratedRuntimeArtifacts(WORKSPACE_DEAL_ID)
  cleanupWorkflowPresets()
  await stopActiveRun(request)
})

test.afterEach(async ({ request }) => {
  await stopActiveRun(request)
})


test('saves a draft and reopens it from the deal library', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page)

  await waitForDashboardReady(page)
  await openWizard(page)

  await page.getByTestId('deal-id-input').fill(DRAFT_DEAL_ID)
  await page.getByTestId('deal-name-input').fill(DRAFT_DEAL_NAME)
  await page.getByTestId('deal-wizard-save-draft').click()

  const modal = await openDealLibraryModal(page)
  await expect(modal.getByTestId(`deal-card-${DRAFT_DEAL_ID}`)).toContainText('Draft')

  await modal.getByTestId(`edit-deal-${DRAFT_DEAL_ID}`).click()
  await expect(page.getByRole('heading', { name: 'Edit Deal' })).toBeVisible()
  await expect(page.getByTestId('deal-id-input')).toHaveValue(DRAFT_DEAL_ID)
  await expect(page.getByTestId('deal-name-input')).toHaveValue(DRAFT_DEAL_NAME)

  expect(consoleErrors).toEqual([])
})

test('creates a launch-ready deal and starts a run from the wizard', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page)

  await waitForDashboardReady(page)
  await openWizard(page)
  await fillLaunchReadyDeal(page, READY_DEAL_ID, READY_DEAL_NAME)

  await expect(page.getByText('Launch Ready')).toBeVisible()
  await expect(page.getByText('0 blocking issue(s), 0 warning(s)')).toBeVisible()

  await page.getByTestId('deal-wizard-save-launch').click()

  await expect(page.getByText('Run: Running')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('main').getByRole('heading', { name: READY_DEAL_NAME })).toBeVisible({ timeout: 20_000 })

  const modal = await openDealLibraryModal(page)
  await expect(modal.getByTestId(`deal-card-${READY_DEAL_ID}`)).toContainText(/Running|Complete/)

  expect(consoleErrors).toEqual([])
})

test('launches a shipped sample deal from the library', async ({ page, request }) => {
  const consoleErrors = collectConsoleErrors(page)

  await waitForDashboardReady(page)
  await stopActiveRun(request)
  const modal = await openDealLibraryModal(page)
  const launchResponsePromise = page.waitForResponse((response) =>
    isApiResponse(response, 'POST', `/api/deals/${SAMPLE_DEAL_ID}/launch`)
  )
  await modal.getByTestId('launch-deal-demo-pass-001').click()
  const launchResponse = await launchResponsePromise
  await expectApiOk(launchResponse)
  const launchPayload = (await launchResponse.json()) as { deal?: { dealId?: string } }
  expect(launchPayload.deal?.dealId).toBe(SAMPLE_DEAL_ID)

  await expect
    .poll(
      async () => {
        const response = await request.get(`${API_URL}/api/run/status`)
        if (!response.ok()) return null
        const payload = (await response.json()) as { dealPath?: string | null }
        return payload.dealPath ?? null
      },
      { timeout: 15_000 },
    )
    .toBe('demo/deals/riverside-gardens.json')

  await expect(page.getByText('Run: Running')).toBeVisible({ timeout: 15_000 })
  await expect(modal).toBeHidden({ timeout: 20_000 })
  await expect(page.getByRole('main').getByRole('heading', { name: 'Riverside Gardens' })).toBeVisible({ timeout: 20_000 })

  expect(consoleErrors).toEqual([])
})

test('creates a draft from the document-first homepage and uploads the dropped file', async ({ page, request }) => {
  const consoleErrors = collectConsoleErrors(page)

  await waitForDashboardReady(page)
  await expect(page.getByTestId('drop-zone-hero')).toContainText('Drop the deal. Watch the team go to work.')
  await expect(page.getByTestId('drop-zone-hero')).toContainText('supported XLSX rent rolls or T12s extract now')

  await page.getByTestId('drop-zone-input').setInputFiles({
    name: 'playwright-hero-rent-roll.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([
      'Unit,Unit Type,SqFt,Market Rent,Current Rent,Status',
      '101,1BR/1BA,700,1700,1600,Occupied',
      '102,1BR/1BA,710,1710,1610,Occupied',
    ].join('\n')),
  })

  const quickModal = page.getByTestId('quick-deal-modal')
  await expect(quickModal).toBeVisible()
  await expect(quickModal.getByTestId('quick-upload-progress')).toContainText('0/1 uploaded')
  await expect(quickModal.getByTestId('quick-upload-item-queued')).toContainText('playwright-hero-rent-roll.csv')
  await quickModal.getByTestId('quick-deal-name-input').fill('Playwright Hero Drop Deal')

  const saveResponsePromise = page.waitForResponse((response) => isApiResponse(response, 'POST', '/api/deals'))
  await quickModal.getByTestId('quick-deal-create').click()
  const saveResponse = await saveResponsePromise
  await expectApiOk(saveResponse)
  const savePayload = (await saveResponse.json()) as { item: { dealId: string } }
  const quickDealId = savePayload.item.dealId

  await expect(page.getByTestId('workspace-frame')).toBeVisible({ timeout: 20_000 })
  // A freshly created deal opens focused on the Intake stage (the old "documents" tab body),
  // and the always-present command bar replaces the removed OperatorCommandBar surface that
  // used to read "Upload the first source package".
  await expect(page.getByTestId('spine-step-intake')).toHaveAttribute('aria-current', 'step')
  await expect(page.getByTestId('command-bar')).toBeVisible()

  // The auto-filled deal record is the lead surface of Intake; uploading + per-field review now
  // live behind the "Source documents & detailed review" disclosure. Open it to drive extraction.
  await expect(page.getByTestId('deal-record')).toBeVisible()
  await openIntakeDetailedReview(page)
  await expect(page.getByTestId('source-document-rent_roll')).toContainText('playwright-hero-rent-roll.csv')

  const extractionPreview = page.getByTestId('extraction-preview')
  await page.getByTestId('extract-document-rent_roll').click()
  await expect(extractionPreview).toContainText('3 Fields Found')
  // Auto-apply default (backend I2b): the rent roll's trusted reads (total units, unit mix,
  // occupancy — all high-confidence, no conflict on a fresh deal) apply themselves the moment
  // they're read, so the document goes straight to "applied" without manual field selection.
  await expect(page.getByTestId('source-document-rent_roll')).toContainText('applied')

  // Those auto-applied reads flow into the lead deal record (nothing typed by hand): the record
  // shows the rent roll's Total Units (2) under the Property group, read cleanly.
  const recordPanel = page.getByTestId('deal-record')
  await expect(recordPanel.getByTestId('record-field-property.totalUnits')).toContainText('Total Units')
  await expect(recordPanel.getByTestId('record-field-property.totalUnits')).toContainText('2')

  const workspaceResponse = await request.get(`${API_URL}/api/deals/${quickDealId}/workspace`)
  await expectApiOk(workspaceResponse)
  const workspace = (await workspaceResponse.json()) as { documents: Array<{ fileName?: string; type?: string }> }
  expect(workspace.documents.some((doc) => doc.fileName === 'playwright-hero-rent-roll.csv' && doc.type === 'rent_roll')).toBe(true)

  const dealResponse = await request.get(`${API_URL}/api/deals/${quickDealId}`)
  await expectApiOk(dealResponse)
  const dealRecord = (await dealResponse.json()) as {
    deal: { property?: Record<string, unknown>; financials?: Record<string, unknown> }
    item: { saveState?: string }
  }
  expect(dealRecord.deal.property?.totalUnits).toBe(2)
  expect(dealRecord.deal.financials?.inPlaceOccupancy).toBe(1)
  expect(dealRecord.item.saveState).toBe('draft')

  const modal = await openDealLibraryModal(page)
  await expect(modal.getByTestId(`deal-card-${quickDealId}`)).toContainText('Draft')
  cleanupDealArtifacts(quickDealId)

  expect(consoleErrors).toEqual([])
})

test('shows compact recent deals without changing the full deal library modal', async ({ page, request }) => {
  const consoleErrors = collectConsoleErrors(page)

  await saveLaunchReadyDeal(request, RECENT_DEAL_ID, RECENT_DEAL_NAME)
  await waitForDashboardReady(page)

  const strip = page.getByTestId('recent-deals-strip')
  await expect(strip).toBeVisible()
  await expect(strip.getByTestId(`deal-card-${RECENT_DEAL_ID}`)).toContainText(RECENT_DEAL_NAME)

  await strip.getByTestId(`workspace-docs-${RECENT_DEAL_ID}`).click()
  await expect(page.getByTestId('workspace-frame')).toBeVisible({ timeout: 20_000 })
  await expectViewportAtTop(page)
  await expect(page.getByTestId('spine-step-intake')).toHaveAttribute('aria-current', 'step')

  await page.getByTestId('header-deals-button').click()
  const modal = page.getByTestId('deal-library-modal')
  await expect(modal).toBeVisible()
  await expect(modal.getByTestId(`deal-card-${RECENT_DEAL_ID}`)).toContainText('Ready')
  await expect(modal.getByTestId(`launch-deal-${RECENT_DEAL_ID}`)).toBeVisible()

  expect(consoleErrors).toEqual([])
})

test('returns to the upload package page from a checkpoint-backed workspace', async ({ page, request }) => {
  const consoleErrors = collectConsoleErrors(page)

  await saveLaunchReadyDeal(request, WORKSPACE_DEAL_ID, WORKSPACE_DEAL_NAME)
  await launchWorkflowForDeal(request, 'quick-deal-screen', WORKSPACE_DEAL_ID)
  await openWorkspaceFromRecentDeals(page, WORKSPACE_DEAL_ID, WORKSPACE_DEAL_NAME)
  await stopActiveRun(request)

  await page.getByTestId('header-upload-package-button').click()
  await expect(page.getByTestId('drop-zone-hero')).toBeVisible()
  await expectViewportAtTop(page)
  await expect(page.getByTestId('drop-zone-hero')).toContainText('Drop the deal. Watch the team go to work.')
  await expect(page.getByTestId('recent-deals-strip')).toContainText(WORKSPACE_DEAL_NAME)

  expect(consoleErrors).toEqual([])
})

test('guided demo mode opens the sample deal, advances through major sections, and closes', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page)

  await waitForDashboardReady(page)
  await page.getByTestId('guided-demo-front-door-cta').click()

  await expect(page.getByTestId('workspace-frame')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('main').getByRole('heading', { name: 'Parkview Apartments' })).toBeVisible({ timeout: 20_000 })

  // The redesigned 5-step tour drives lifecycle stages (not the removed tabs): each step
  // focuses a stage on the spine and points at the persistent frame surface it describes.
  const tour = page.getByTestId('guided-demo-overlay')
  await expect(tour).toBeVisible()
  await expect(tour.getByTestId('guided-demo-step-title')).toContainText('The Deal Space')
  await expect(page.getByTestId('spine-step-intake')).toHaveAttribute('aria-current', 'step')
  await expect(page.getByTestId('lifecycle-spine')).toBeVisible()

  await tour.getByTestId('guided-demo-next').click()
  await expect(tour.getByTestId('guided-demo-step-title')).toContainText('Command Your Team')
  await expect(page.getByTestId('spine-step-intake')).toHaveAttribute('aria-current', 'step')
  await expect(page.getByTestId('command-bar')).toBeVisible()

  await tour.getByTestId('guided-demo-next').click()
  await expect(tour.getByTestId('guided-demo-step-title')).toContainText('Your Team')
  await expect(page.getByTestId('spine-step-diligence')).toHaveAttribute('aria-current', 'step')
  await expect(page.getByTestId('team-rail')).toBeVisible()

  await tour.getByTestId('guided-demo-next').click()
  await expect(tour.getByTestId('guided-demo-step-title')).toContainText('Watch It Work')
  await expect(page.getByTestId('spine-step-underwriting')).toHaveAttribute('aria-current', 'step')
  await expect(page.getByTestId('live-feed')).toBeVisible()

  await tour.getByTestId('guided-demo-next').click()
  await expect(tour.getByTestId('guided-demo-step-title')).toContainText('IC Package')
  await expect(page.getByTestId('spine-step-ic')).toHaveAttribute('aria-current', 'step')
  await expect(page.getByTestId('completion-package-view')).toBeVisible()

  await tour.getByTestId('guided-demo-finish').click()
  await expect(tour).toBeHidden()

  expect(consoleErrors).toEqual([])
})

test('mobile guided workspace smoke @mobile', async ({ page, request }) => {
  const consoleErrors = collectConsoleErrors(page)

  await saveLaunchReadyDeal(request, WORKSPACE_DEAL_ID, WORKSPACE_DEAL_NAME)
  await waitForDashboardReady(page)

  await page.getByTestId(`workspace-docs-${WORKSPACE_DEAL_ID}`).click()
  await expect(page.getByTestId('workspace-frame')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('command-bar')).toBeVisible()
  // The lifecycle spine + Advanced control replace the old tab strip on mobile.
  await expect(page.getByTestId('lifecycle-spine')).toBeVisible()
  await page.getByTestId('open-advanced').scrollIntoViewIfNeeded()
  await expect(page.getByTestId('open-advanced')).toBeInViewport()
  // Mission Control + the progression guide now live in the Advanced drawer.
  const drawer = await openAdvancedDrawer(page)
  await expect(drawer.getByTestId('mission-control')).toContainText('Acquisition Command')
  await expect(drawer.getByTestId('deal-progression-guide')).toContainText('What is needed next')
  await closeAdvancedDrawer(page)
  // The IC package body is the IC stage of the spine.
  await focusStage(page, 'ic')
  await expect(page.getByTestId('completion-package-view')).toBeVisible()

  expect(consoleErrors).toEqual([])
})

test('keeps the embedded workflow launcher scoped to the open deal', async ({ page, request }) => {
  const consoleErrors = collectConsoleErrors(page)

  await saveLaunchReadyDeal(request, WORKSPACE_DEAL_ID, WORKSPACE_DEAL_NAME)
  await saveLaunchReadyDeal(request, READY_DEAL_ID, READY_DEAL_NAME)
  await page.addInitScript((storedDealId) => {
    window.localStorage.setItem('cre.workflowLauncher.v1', JSON.stringify({
      dealId: storedDealId,
      workflowId: 'quick-deal-screen',
      scenario: 'core-plus',
      speed: 'normal',
      mode: 'live',
      runtimeProvider: 'simulation',
    }))
  }, READY_DEAL_ID)

  await waitForDashboardReady(page)
  await page.getByTestId(`workspace-docs-${WORKSPACE_DEAL_ID}`).click()
  await expect(page.getByTestId('workspace-frame')).toBeVisible({ timeout: 20_000 })
  await openAdvancedDrawer(page)

  const launcher = page.getByTestId('workspace-workflow-launcher')
  await launcher.getByTestId('workflow-step-review').click()
  await expect(launcher.getByTestId('workflow-deal-select')).toHaveValue(WORKSPACE_DEAL_ID)
  await expect(launcher.getByTestId('workflow-launch-readiness')).toContainText('Readiness Check')
  await expect(launcher.getByTestId('workflow-require-source-backed-inputs')).toBeChecked()
  await expect(launcher.getByTestId('workflow-launch-selected')).toBeDisabled()

  expect(consoleErrors).toEqual([])
})

test('loads workflow catalog and saves a reusable preset', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page)

  await waitForDashboardReady(page)
  await page.getByTestId('header-workflows-button').click()
  const modal = page.getByTestId('workflow-launcher-modal')
  await expect(modal).toBeVisible()
  await expect(modal.getByTestId('workflow-catalog-load')).toContainText('workflows available')

  await modal.getByTestId('workflow-step-review').click()
  await modal.getByTestId('workflow-deal-select').selectOption(SAMPLE_DEAL_ID)
  await modal.getByTestId('workflow-select').selectOption('quick-deal-screen')
  await modal.getByTestId('workflow-speed-select').selectOption('fast')
  await modal.getByPlaceholder('Preset name').fill('Playwright Quick Screen')
  await modal.getByTestId('workflow-preset-save').click()

  await expect(modal.getByText('Saved preset: Playwright Quick Screen')).toBeVisible()
  expect(consoleErrors).toEqual([])
})

test('shows Codex ChatGPT authentication status in workflow launcher', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page)

  await waitForDashboardReady(page)
  await page.getByTestId('header-workflows-button').click()
  const modal = page.getByTestId('workflow-launcher-modal')
  await modal.getByTestId('workflow-step-review').click()
  await modal.getByTestId('workflow-runtime-provider-select').selectOption('codex')

  const authCard = modal.getByTestId('workflow-codex-auth-card')
  await expect(authCard).toContainText('ChatGPT Authentication')
  await expect(authCard).toContainText('No authentication is stored in this repository')
  await expect(authCard.getByTestId('workflow-codex-refresh-status')).toBeVisible()
  await expect(authCard.getByTestId('workflow-codex-login-chatgpt')).toBeVisible()

  await authCard.getByTestId('workflow-codex-refresh-status').click()
  await expect(authCard).toContainText(/Logged in|Not logged in|not installed|Not checked/)

  expect(consoleErrors).toEqual([])
})

test('guards local document upload API against unsafe browser origins and malformed content', async ({ request }) => {
  const rejectedOrigin = await request.post(`${API_URL}/api/deals/${WORKSPACE_DEAL_ID}/documents`, {
    headers: { Origin: 'https://example.com' },
    data: {
      fileName: 'cross-origin-rent-roll.csv',
      content: 'Unit,Current Rent\n101,1600',
    },
  })
  expect(rejectedOrigin.status()).toBe(403)

  await saveLaunchReadyDeal(request, WORKSPACE_DEAL_ID, WORKSPACE_DEAL_NAME)
  const malformedUpload = await request.post(`${API_URL}/api/deals/${WORKSPACE_DEAL_ID}/documents`, {
    headers: { Origin: 'http://localhost:5173' },
    data: {
      fileName: 'bad-rent-roll.csv',
      contentBase64: 'not-base64!!!',
    },
  })
  expect(malformedUpload.status()).toBe(400)
  await expect(malformedUpload).not.toBeOK()
  expect(await malformedUpload.text()).toContain('Invalid base64 document content')
})

test('enforces source-backed saved presets when launching through the workflow API', async ({ request }) => {
  await saveLaunchReadyDeal(request, WORKSPACE_DEAL_ID, WORKSPACE_DEAL_NAME)

  const presetResponse = await request.post(`${API_URL}/api/workflow-presets`, {
    data: {
      name: 'Playwright Source-Gated Preset',
      workflowId: 'quick-deal-screen',
      dealId: WORKSPACE_DEAL_ID,
      inputs: {
        scenario: 'core-plus',
        speed: 'fast',
        mode: 'live',
        runtimeProvider: 'simulation',
        reset: false,
        requireSourceBackedInputs: true,
      },
    },
  })
  await expectApiOk(presetResponse)
  const presetPayload = (await presetResponse.json()) as { preset: { presetId?: string; id?: string } }
  const presetId = presetPayload.preset.presetId ?? presetPayload.preset.id
  expect(presetId).toBeTruthy()

  const launchResponse = await request.post(`${API_URL}/api/workflows/quick-deal-screen/launch`, {
    data: { presetId },
  })
  expect(launchResponse.status()).toBe(400)
  const payload = (await launchResponse.json()) as {
    error?: string
    readiness?: {
      blockers?: string[]
      sourceCoverage?: { missingApprovedFieldCount?: number }
    }
  }
  expect(payload.error).toContain('readiness blocked')
  expect(payload.readiness?.blockers?.join(' ')).toContain('Workflow requires approved source-backed fields')
  expect(payload.readiness?.sourceCoverage?.missingApprovedFieldCount).toBeGreaterThan(0)
})

test('launches full acquisition workflow from the launcher', async ({ page, request }) => {
  const consoleErrors = collectConsoleErrors(page)

  await waitForDashboardReady(page)
  await page.getByTestId('header-workflows-button').click()
  const modal = page.getByTestId('workflow-launcher-modal')
  await modal.getByTestId('workflow-step-review').click()
  await modal.getByTestId('workflow-deal-select').selectOption(SAMPLE_DEAL_ID)
  await modal.getByTestId('workflow-select').selectOption('full-acquisition-review')
  await modal.getByTestId('workflow-speed-select').selectOption('fast')
  await modal.getByTestId('workflow-launch-selected').click()

  await expect(page.getByText('Run: Running')).toBeVisible({ timeout: 15_000 })
  const status = await request.get(`${API_URL}/api/run/status`)
  const payload = (await status.json()) as { workflowId?: string }
  expect(payload.workflowId).toBe('full-acquisition-review')

  expect(consoleErrors).toEqual([])
})

test('operates the deal hub criteria, source documents, extraction, phase coverage, and phase launch', async ({ page, request }) => {
  const consoleErrors = collectConsoleErrors(page)

  await saveLaunchReadyDeal(request, WORKSPACE_DEAL_ID, WORKSPACE_DEAL_NAME)
  await launchWorkflowForDeal(request, 'quick-deal-screen', WORKSPACE_DEAL_ID)
  // Stop the seed run before opening so the workspace is opened durably from the deal record
  // (a stopped run's live checkpoint would otherwise collapse the auto-revealed view).
  await stopActiveRun(request)
  await openWorkspaceFromRecentDeals(page, WORKSPACE_DEAL_ID, WORKSPACE_DEAL_NAME)

  // The deal opens focused on Intake; the persistent command bar replaces the removed
  // OperatorCommandBar (which used to read "Sample evidence is driving the active run").
  await expect(page.getByTestId('spine-step-intake')).toHaveAttribute('aria-current', 'step')
  await expect(page.getByTestId('command-bar')).toBeVisible()

  // Mission Control, the progression guide, the operator briefing, and the criteria editor
  // all moved into the Advanced drawer. The cockpit's "launch readiness N/4" is now the
  // operator briefing's source-backed-input-score (same approved/required field count).
  const drawer = await openAdvancedDrawer(page)
  await expect(drawer.getByTestId('mission-control')).toContainText('Acquisition Command')
  await expect(drawer.getByTestId('deal-progression-guide')).toContainText('What is needed next')
  await expect(drawer.getByTestId('guide-section-underwriting')).toContainText('Checklist and help guide')
  const briefing = drawer.getByTestId('operator-briefing')
  await expect(briefing).toContainText('Launch Readiness')
  await expect(briefing.getByTestId('operator-next-action')).toContainText('Upload the first source package')
  await expect(briefing.getByTestId('source-backed-input-score')).toContainText('0/4')
  await expect(briefing.getByTestId('workflow-readiness-full-acquisition-review')).toContainText('warning')

  await drawer.getByTestId('criteria-scenario').selectOption('value-add')
  await drawer.getByTestId('criteria-target-irr').fill('0.185')
  const criteriaSaveResponse = page.waitForResponse(
    (response) => isApiResponse(response, 'POST', `/api/deals/${WORKSPACE_DEAL_ID}/criteria`),
  )
  await drawer.getByTestId('criteria-save').click()
  expect((await criteriaSaveResponse).ok()).toBe(true)
  await closeAdvancedDrawer(page)

  const workspaceResponse = await request.get(`${API_URL}/api/deals/${WORKSPACE_DEAL_ID}/workspace`)
  await expectApiOk(workspaceResponse)
  const workspace = (await workspaceResponse.json()) as {
    criteria: { scenario?: string; targetIRR?: number }
  }
  expect(workspace.criteria.scenario).toBe('value-add')
  expect(workspace.criteria.targetIRR).toBe(0.185)

  await focusStage(page, 'intake')
  // The auto-filled deal record leads Intake; uploads + per-field review live behind the
  // "Source documents & detailed review" disclosure. Open it to drive the extraction flow.
  await expect(page.getByTestId('deal-record')).toBeVisible()
  await openIntakeDetailedReview(page)
  await page.getByTestId('source-document-upload').setInputFiles([
    join(parserFixturesRoot, 'rent-roll-messy-realistic.xlsx'),
    join(parserFixturesRoot, 't12-messy-realistic.xlsx'),
    join(firstRealDealRoot, 'offering-memo-messy-realistic.md'),
  ])

  // The intake source panel is the new "documents you have" surface; each uploaded doc
  // renders its type label (Rent Roll, T12 Financials) — replacing the removed cockpit list.
  await expect(page.getByTestId('source-document-rent_roll')).toContainText('rent-roll-messy-realistic.xlsx')
  await expect(page.getByTestId('source-document-rent_roll')).toContainText('Rent Roll')
  await expect(page.getByTestId('source-document-t12')).toContainText('t12-messy-realistic.xlsx')
  await expect(page.getByTestId('source-document-t12')).toContainText('T12')
  await expect(page.getByTestId('source-document-offering_memo')).toContainText('offering-memo-messy-realistic.md')

  // Cockpit "Environmental" required-doc slot + "Run extraction" next action now live in the
  // Advanced drawer (progression guide required-doc badges + operator briefing next action).
  const docsDrawer = await openAdvancedDrawer(page)
  await expect(docsDrawer.getByTestId('guide-section-due-diligence')).toContainText('Environmental')
  await expect(docsDrawer.getByTestId('operator-next-action')).toContainText('Run or resolve the extraction queue')
  await closeAdvancedDrawer(page)

  // Phase bodies are reached by focusing their lifecycle stage on the spine.
  await focusStage(page, 'underwriting')
  await expect(page.getByRole('heading', { name: 'Underwriting' })).toBeVisible()
  await focusStage(page, 'intake')
  // Leaving + returning to Intake re-mounts the disclosure closed; re-open it to continue.
  await openIntakeDetailedReview(page)

  const extractionPreview = page.getByTestId('extraction-preview')

  await page.getByTestId('extract-document-rent_roll').click()
  await expect(extractionPreview).toContainText('Fields Found')
  await expect(extractionPreview).toContainText('Mapped')
  await expect(extractionPreview).toContainText('Ambiguous occupancy status')
  await expect(extractionPreview).toContainText('Total Units')
  await expect(extractionPreview).toContainText('In-Place Occupancy')
  await extractionPreview.getByTestId('select-all-safe-fields').click()
  await expect(extractionPreview.getByTestId('selected-field-change-summary')).toContainText('Deal data changes')
  await extractionPreview.getByTestId('confirm-conflict-review').check()
  await page.getByTestId('apply-extraction').click()
  await expect(page.getByTestId('source-document-rent_roll')).toContainText('applied')

  // W42: from the applied rent roll, drill into the originating source row to read the
  // stored snippet / location for an approved input.
  await expect(page.getByTestId('extract-document-rent_roll')).toContainText('View Applied Evidence')
  await page.getByTestId('extract-document-rent_roll').click()
  const appliedTotalUnits = extractionPreview.locator('label:has([data-field-path="property.totalUnits"])')
  await expect(appliedTotalUnits).toBeVisible()
  const drilldownToggle = appliedTotalUnits.getByTestId(/^source-drilldown-toggle-/)
  await expect(drilldownToggle).toBeVisible()
  await drilldownToggle.click()
  await expect(appliedTotalUnits.getByTestId(/^source-drilldown-file-/)).toContainText('rent-roll-messy-realistic.xlsx')
  await expect(appliedTotalUnits.getByTestId(/^source-drilldown-location-/)).toContainText(/Sheet|Row/)

  await page.getByTestId('extract-document-t12').click()
  await expect(extractionPreview).toContainText('3 Fields Found')
  await expect(extractionPreview).toContainText('Trailing T12 Revenue')
  await expect(extractionPreview).toContainText('Current NOI')
  await extractionPreview.getByTestId('select-all-safe-fields').click()
  await expect(extractionPreview.getByTestId('selected-field-change-summary')).toContainText('Current NOI')
  await extractionPreview.getByTestId('confirm-conflict-review').check()
  await page.getByTestId('apply-extraction').click()
  await expect(page.getByTestId('source-document-t12')).toContainText('applied')
  // Source-backed input progress (was cockpit-launch-readiness) now reads from the operator
  // briefing's source-backed-input-score in the Advanced drawer.
  const readiness3of4Drawer = await openAdvancedDrawer(page)
  await expect(readiness3of4Drawer.getByTestId('source-backed-input-score')).toContainText('3/4')
  await closeAdvancedDrawer(page)

  // Auto-applied source-backed reads flow into the lead deal record (nothing typed by hand).
  // The T12's Current NOI ($95,400) is now live there, grouped under Operations.
  const recordPanel = page.getByTestId('deal-record')
  await expect(recordPanel).toBeVisible()
  const recordNoi = recordPanel.getByTestId('record-field-financials.currentNOI')
  await expect(recordNoi).toContainText('Current NOI')
  await expect(recordNoi).toContainText('$95,400')

  // Inline override (I1): edit an auto-populated value directly in the record. Occupancy was
  // read from the rent roll; correcting it persists with provenance + audit via field-edit.
  const recordOccupancy = recordPanel.getByTestId('record-field-financials.inPlaceOccupancy')
  await expect(recordOccupancy).toBeVisible()
  const fieldEditResponse = page.waitForResponse(
    (response) => isApiResponse(response, 'POST', `/api/deals/${WORKSPACE_DEAL_ID}/field-edit`),
  )
  await recordOccupancy.getByTestId('record-field-edit-financials.inPlaceOccupancy').click()
  const occupancyInput = recordOccupancy.getByTestId('record-field-input-financials.inPlaceOccupancy')
  await occupancyInput.fill('95%')
  await occupancyInput.press('Enter')
  await expectApiOk(await fieldEditResponse)
  // The edited value round-trips into the saved deal record (stored as the 0.95 ratio).
  await expect
    .poll(async () => {
      const response = await request.get(`${API_URL}/api/deals/${WORKSPACE_DEAL_ID}`)
      if (!response.ok()) return null
      const payload = (await response.json()) as { deal: { financials?: Record<string, unknown> } }
      return payload.deal.financials?.inPlaceOccupancy ?? null
    }, { timeout: 10_000 })
    .toBe(0.95)

  await page.getByTestId('extract-document-offering_memo').click()
  await expect(extractionPreview).toContainText('Asking Price')

  // The offering memo's NOI ($96,000) disagrees with the already-applied T12 NOI ($95,400):
  // a source conflict. The record surfaces it as a flagged field needing the operator's eye.
  await expect(recordPanel.getByTestId('record-field-flag-financials.currentNOI')).toBeVisible()
  await expect(recordPanel.getByTestId('record-field-financials.currentNOI')).toHaveAttribute('data-flagged', 'true')
  await expect(recordPanel.getByTestId('needs-eye-count')).toContainText('need your eye')

  await extractionPreview.locator('[data-field-path="financials.currentNOI"]').check()
  await extractionPreview.getByTestId('extraction-review-note').fill('T12 controls NOI for this package.')
  const waiverResponsePromise = page.waitForResponse((response) => {
    const pathname = new URL(response.url()).pathname
    return (
      response.request().method() === 'POST' &&
      pathname.startsWith(`/api/deals/${WORKSPACE_DEAL_ID}/documents/`) &&
      pathname.endsWith('/review-extraction')
    )
  })
  await page.getByTestId('waive-extraction-fields').click()
  await expectApiOk(await waiverResponsePromise)
  await expect(extractionPreview).toContainText('waived')
  await extractionPreview.locator('[data-field-path="financials.askingPrice"]').check()
  await extractionPreview.locator('[data-field-path="property.yearBuilt"]').check()
  await extractionPreview.getByTestId('confirm-conflict-review').check()
  await page.getByTestId('apply-extraction').click()
  await expect(page.getByTestId('source-document-offering_memo')).toContainText('applied')

  // The command bar persists across stages (it is part of the frame, not a stage body).
  await expect(page.getByTestId('command-bar')).toBeVisible()
  // 4/4 source-backed inputs + the progression-guide checklist both live in the Advanced
  // drawer now (was the cockpit launch-readiness panel + the advanced tab).
  const guideDrawer = await openAdvancedDrawer(page)
  await expect(guideDrawer.getByTestId('source-backed-input-score')).toContainText('4/4')
  await expect(guideDrawer.getByTestId('guide-section-underwriting')).toContainText('Run underwriting refresh')
  await guideDrawer.getByTestId('guide-note-underwriting-run-workflow').fill('Reviewed by Playwright before phase launch.')
  await guideDrawer.getByTestId('guide-complete-underwriting-run-workflow').click()
  await expect(guideDrawer.getByTestId('guide-checklist-underwriting-run-workflow')).toContainText('complete')
  await closeAdvancedDrawer(page)

  const checklistWorkspaceResponse = await request.get(`${API_URL}/api/deals/${WORKSPACE_DEAL_ID}/workspace`)
  await expectApiOk(checklistWorkspaceResponse)
  const checklistWorkspace = (await checklistWorkspaceResponse.json()) as {
    progressionGuide: {
      sections: Array<{ phaseSlug: string; checklist: Array<{ id: string; status: string; note?: string }> }>
    }
  }
  const underwritingGuide = checklistWorkspace.progressionGuide.sections.find((section) => section.phaseSlug === 'underwriting')
  expect(underwritingGuide?.checklist.find((item) => item.id === 'underwriting-run-workflow')?.status).toBe('complete')
  expect(underwritingGuide?.checklist.find((item) => item.id === 'underwriting-run-workflow')?.note).toContain('Playwright')

  const dealResponse = await request.get(`${API_URL}/api/deals/${WORKSPACE_DEAL_ID}`)
  await expectApiOk(dealResponse)
  const dealRecord = (await dealResponse.json()) as {
    deal: { property?: Record<string, unknown>; financials?: Record<string, unknown> }
  }
  expect(dealRecord.deal.property?.totalUnits).toBe(7)
  expect(dealRecord.deal.property?.yearBuilt).toBe(1998)
  expect(dealRecord.deal.financials?.askingPrice).toBe(2_450_000)
  expect(dealRecord.deal.financials?.currentNOI).toBe(95_400)
  expect(dealRecord.deal.financials?.trailingT12Revenue).toBe(156_600)

  // The IC package body is the IC stage of the spine (was the "package" tab).
  await focusStage(page, 'ic')
  const markdownExportResponse = page.waitForResponse(
    (response) => isApiResponse(response, 'POST', `/api/deals/${WORKSPACE_DEAL_ID}/ic-starter-package`),
  )
  const markdownDownload = page.waitForEvent('download')
  await page.getByTestId('package-export-markdown').click()
  await expectApiOk(await markdownExportResponse)
  expect((await markdownDownload).suggestedFilename()).toContain('ic-starter-package.md')
  await expect(page.getByTestId('package-export-status')).toContainText('Markdown exported')

  const jsonExportResponse = page.waitForResponse(
    (response) => isApiResponse(response, 'POST', `/api/deals/${WORKSPACE_DEAL_ID}/ic-starter-package`),
  )
  const jsonDownload = page.waitForEvent('download')
  await page.getByTestId('package-export-json').click()
  await expectApiOk(await jsonExportResponse)
  expect((await jsonDownload).suggestedFilename()).toContain('ic-starter-package.json')
  await expect(page.getByTestId('package-export-status')).toContainText('JSON exported')

  // Per-phase document coverage is reached by focusing each lifecycle stage on the spine
  // (was the cockpit phase buttons). The diligence spine step maps to the due-diligence phase.
  await focusStage(page, 'underwriting')
  await expect(page.getByRole('heading', { name: 'Agent Playbook' })).toBeVisible()
  await expect(documentCoverageStat(page)).toContainText('100%')
  await expect(page.getByText('Required Documents').locator('..')).toContainText('Offering Memo')

  await focusStage(page, 'diligence')
  await expect(page.getByRole('heading', { name: 'Due Diligence' })).toBeVisible()
  await expect(documentCoverageStat(page)).toContainText('20%')

  await focusStage(page, 'financing')
  await expect(page.getByRole('heading', { name: 'Financing' })).toBeVisible()
  await expect(documentCoverageStat(page)).toContainText('67%')

  await focusStage(page, 'underwriting')
  await stopActiveRun(request)
  await page.getByTestId('phase-launch-underwriting').click()
  await expect(page.getByText(/Run: (Starting|Running|Completed)/)).toBeVisible({ timeout: 15_000 })

  const status = await request.get(`${API_URL}/api/run/status`)
  const payload = (await status.json()) as { state?: string; workflowId?: string }
  expect(payload.workflowId).toBe('underwriting-refresh')
  expect(['STARTING', 'RUNNING', 'COMPLETED']).toContain(payload.state)

  expect(consoleErrors).toEqual([])
})

test('keeps PDF and XLSX document status honest in the cockpit', async ({ page, request }) => {
  const consoleErrors = collectConsoleErrors(page)

  await saveLaunchReadyDeal(request, WORKSPACE_DEAL_ID, WORKSPACE_DEAL_NAME)
  await waitForDashboardReady(page)
  await page.getByTestId(`workspace-docs-${WORKSPACE_DEAL_ID}`).click()
  await expect(page.getByTestId('workspace-frame')).toBeVisible({ timeout: 20_000 })
  // The Intake stage body is the document intake surface (was the "documents" tab).
  await focusStage(page, 'intake')
  await page.getByTestId('source-document-upload').setInputFiles([
    {
      name: 'playwright-title.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n% Playwright title fixture\n'),
    },
    {
      name: 'playwright-rent-roll.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('not-a-real-workbook-but-stored-for-status'),
    },
  ])

  await expect(page.getByTestId('source-document-title')).toContainText('playwright-title.pdf')
  await expect(page.getByTestId('source-document-title')).toContainText('Extraction Pending')
  await expect(page.getByTestId('source-document-rent_roll')).toContainText('playwright-rent-roll.xlsx')
  await expect(page.getByTestId('source-document-rent_roll')).toContainText('Preview Extraction')
  // The cockpit's "PDF and Excel stay honest" caption is gone; the equivalent honest-status
  // messaging now lives in the intake stage's extraction preview panel (the empty-state copy
  // explains that PDF evidence is stored for pending review rather than auto-extracted).
  await expect(page.getByTestId('stage-outlet')).toContainText('PDF evidence is stored for pending review')

  const workspaceResponse = await request.get(`${API_URL}/api/deals/${WORKSPACE_DEAL_ID}/workspace`)
  await expectApiOk(workspaceResponse)
  const workspace = (await workspaceResponse.json()) as {
    documents: Array<{ fileName?: string; extractionStatus?: string }>
  }
  expect(workspace.documents.find((doc) => doc.fileName === 'playwright-title.pdf')?.extractionStatus).toBe('extraction-pending')
  expect(workspace.documents.find((doc) => doc.fileName === 'playwright-rent-roll.xlsx')?.extractionStatus).toBe('not-started')

  expect(consoleErrors).toEqual([])
})

test('plans a swarm from an operator goal through the API', async ({ request }) => {
  const response = await request.post(`${API_URL}/api/swarm/plan`, {
    data: {
      dealId: SAMPLE_DEAL_ID,
      goal: 'Help me quickly decide whether this acquisition is worth pursuing',
    },
  })
  await expectApiOk(response)
  const payload = await response.json() as {
    workflowId?: string
    launchRequest?: { workflowId?: string; dealId?: string }
    agentPlan?: Array<{ agentName?: string }>
    nextAction?: { label?: string }
  }

  expect(payload.workflowId).toBe('quick-deal-screen')
  expect(payload.launchRequest?.workflowId).toBe('quick-deal-screen')
  expect(payload.launchRequest?.dealId).toBe(SAMPLE_DEAL_ID)
  expect(payload.agentPlan?.some((agent) => agent.agentName === 'rent-roll-analyst')).toBe(true)
  expect(payload.nextAction?.label).toMatch(/Launch|Unblock/)
})

test('runs quick deal screen workflow to completion with skipped phases and package view', async ({ page, request }) => {
  const consoleErrors = collectConsoleErrors(page)

  await waitForDashboardReady(page)
  await page.getByTestId('header-workflows-button').click()
  const modal = page.getByTestId('workflow-launcher-modal')
  await modal.getByTestId('workflow-step-review').click()
  await modal.getByTestId('workflow-deal-select').selectOption(SAMPLE_DEAL_ID)
  await modal.getByTestId('workflow-select').selectOption('quick-deal-screen')
  await modal.getByTestId('workflow-speed-select').selectOption('fast')
  await modal.getByTestId('workflow-mode-select').selectOption('fast')
  await modal.getByTestId('workflow-launch-selected').click()

  await expect(page.getByText('Run: Running')).toBeVisible({ timeout: 15_000 })

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await request.get(`${API_URL}/api/run/status`)
    const payload = (await response.json()) as { state?: string; workflowId?: string }
    if (payload.state === 'COMPLETED') {
      expect(payload.workflowId).toBe('quick-deal-screen')
      break
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000))
    if (attempt === 59) throw new Error('Quick deal workflow did not complete in time')
  }

  await expect(page.getByText('Run: Completed')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('workspace-frame')).toBeVisible()

  // Mission Control + the Swarm Goal Console moved into the Advanced drawer.
  const drawer = await openAdvancedDrawer(page)
  const mission = drawer.getByTestId('mission-control')
  await expect(mission).toContainText('Acquisition Command')
  await expect(mission).toContainText('Decision package is ready for committee review')
  const swarmConsole = mission.getByTestId('swarm-goal-console')
  await expect(swarmConsole).toBeVisible()
  await expect(swarmConsole).toContainText('Swarm Goal Console')
  await swarmConsole.getByTestId('swarm-goal-input').fill('Help me quickly decide whether this acquisition is worth pursuing')
  await swarmConsole.getByTestId('swarm-plan-button').click()
  await expect(swarmConsole.getByTestId('swarm-recommended-workflow')).toContainText(/quick-deal-screen|Quick Deal Screen/i)
  await expect(swarmConsole.getByTestId('swarm-agent-roster')).toContainText(/Rent Roll Analyst|Financial Model Builder|IC Memo Writer/)
  await expect(swarmConsole.getByTestId('swarm-launch-button')).toBeVisible()
  await swarmConsole.getByTestId('swarm-launch-button').click()
  await expect(page.getByText(/Run: Running|Run: Completed/)).toBeVisible({ timeout: 15_000 })
  await waitForRunIdle(request)
  await expect(page.getByText(/Run: Completed/)).toBeVisible({ timeout: 15_000 })
  // The launch itself is verified by the run-status poll above. Keep the post-launch assertions on
  // stable workspace surfaces so this test does not race the live WebSocket refresh after relaunch.

  // Deal Team (agent tree) + the skipped-phase status badges also live in the Advanced drawer.
  // Re-open it in a poll loop in case a late checkpoint refresh re-renders the drawer contents.
  const agentTree = drawer.getByTestId('agent-tree')
  await expect(async () => {
    await openAdvancedDrawer(page)
    await expect(agentTree).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 20_000 })
  await expect(agentTree).toContainText('Deal Team Lead')
  await expect(drawer.getByTestId('agent-phase-row-due-diligence')).toContainText(/Complete|Running|Skipped/)
  await expect(drawer.getByTestId('agent-row-rent-roll-analyst')).toContainText(/Filed|Working now|Queued/)
  await expect(drawer.getByTestId('agent-row-financial-model-builder')).toContainText(/Stress-testing returns|Filed/)

  // Skipped phases surface in the drawer (pipeline + agent tree). Some skipped markers live
  // inside collapsed regions, so assert on the first *visible* one rather than DOM-first.
  await expect(async () => {
    await openAdvancedDrawer(page)
    await expect(drawer.getByText('skipped').locator('visible=true').first()).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 20_000 })
  await closeAdvancedDrawer(page)

  // After a relaunch the workspace can reset the active stage when the live checkpoint flips
  // to complete; re-focus the IC stage until the package view settles so this navigation does
  // not race the post-relaunch WebSocket refresh.
  const packageView = page.getByTestId('completion-package-view')
  await expect(async () => {
    await page.getByTestId('spine-step-ic').click()
    await expect(packageView).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 20_000 })
  await expect(packageView).toContainText('Completion Package')
  await expect(packageView.getByTestId('ic-review-brief')).toContainText('IC Review Brief')
  await expect(packageView.getByTestId('ic-review-brief')).toContainText('Recommended next decision')
  await expect(packageView).toContainText('Riverside Gardens')
  await expect(packageView.getByTestId('source-backed-input-summary')).toContainText('Source-Backed Inputs')
  await expect(packageView).toContainText('Scoped workflow completed. Review the package outputs before expanding to a full closing run.')
  await expect(packageView).toContainText('Phase Outcomes')
  await expect(packageView).toContainText('Workpapers')
  await expect(packageView).toContainText('Final Recommendation Package')
  await expect(packageView).toContainText('Priority Flags')

  expect(consoleErrors).toEqual([])
})

test('drills a red flag back to its originating specialist workpaper in the IC package', async ({ page, request }) => {
  const consoleErrors = collectConsoleErrors(page)

  await saveLaunchReadyDeal(request, RED_FLAG_DEAL_ID, RED_FLAG_DEAL_NAME)
  await waitForDashboardReady(page)

  // The IC package renders from the *visible* deal checkpoint. Opening a deal from the
  // recent-deals card pins a deal-record checkpoint (empty pending phases) as the visible
  // workspace, which would shadow the seeded live checkpoint and hide its red flags. So
  // instead drive the workspace from the LIVE checkpoint: run a fast workflow to completion
  // (the dashboard auto-reveals the live workspace, leaving the manual deal-record checkpoint
  // unset), then overwrite the status checkpoint with the completed-with-red-flag fixture so
  // the watcher broadcasts it as the live checkpoint for this already-open deal.
  await launchWorkflowForDeal(request, 'quick-deal-screen', RED_FLAG_DEAL_ID)
  await expect
    .poll(
      async () => {
        const response = await request.get(`${API_URL}/api/run/status`)
        if (!response.ok()) return null
        const payload = (await response.json()) as { state?: string }
        return payload.state ?? null
      },
      { timeout: 60_000 },
    )
    .toBe('COMPLETED')
  await expect(page.getByTestId('workspace-frame')).toBeVisible({ timeout: 20_000 })
  // Stop the completed run before seeding so a trailing run broadcast does not re-clobber the
  // red-flag checkpoint we are about to write.
  await stopActiveRun(request)
  writeRedFlagRun(RED_FLAG_DEAL_ID, RED_FLAG_DEAL_NAME)

  // Re-focus the IC stage until the live checkpoint settles so this navigation does not
  // race a late WebSocket checkpoint refresh that can reset the active stage.
  const drilldowns = page.getByTestId('red-flag-drilldowns')
  await expect(async () => {
    await page.getByTestId('spine-step-ic').click()
    await expect(drilldowns).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 25_000 })
  await expect(drilldowns).toContainText('Projected DSCR of 1.05x is below the 1.25x lender minimum.')

  const firstFlag = drilldowns.getByTestId(/^red-flag-drilldown-underwriting-/).first()
  await firstFlag.getByTestId(/^red-flag-drilldown-toggle-/).click()
  // The expanded origin block ties the flag back to its originating Underwriting workpaper.
  // The completed run files a real underwriting workpaper, so the origin names the phase as
  // "...in Underwriting" (and falls back to "Underwriting specialist workpaper" if no artifact
  // is filed) — assert on the origin block, which carries the phase either way.
  await expect(firstFlag.getByTestId(/^red-flag-origin-underwriting-/)).toContainText(/Underwriting/i)
  await expect(firstFlag.getByTestId(/^red-flag-origin-workpaper-/)).toBeVisible()
  await expect(firstFlag).toContainText('Originating workpaper')
  await expect(firstFlag).toContainText('Financial Model Builder')

  cleanupDealArtifacts(RED_FLAG_DEAL_ID)
  expect(consoleErrors).toEqual([])
})

test('surfaces failed agents and retries only them through the run API', async ({ page, request }) => {
  const consoleErrors = collectConsoleErrors(page)

  await saveLaunchReadyDeal(request, PARTIAL_DEAL_ID, PARTIAL_DEAL_NAME)
  // Write the partial-failure checkpoint + failed agent before connecting so they arrive
  // in the initial WebSocket payload and drive the live workspace for this deal.
  writePartialFailureCheckpoint(PARTIAL_DEAL_ID, PARTIAL_DEAL_NAME)
  await stopActiveRun(request)
  await openWorkspaceFromRecentDeals(page, PARTIAL_DEAL_ID, PARTIAL_DEAL_NAME)

  // The agent_failed story event is broadcast as a new ndjson file is added, so write it
  // after the client has connected to supply the prior run id used for the re-run.
  writePartialFailureEvent(PARTIAL_DEAL_ID, PARTIAL_RUN_ID)

  const recovery = page.getByTestId('partial-failure-recovery')
  await expect(recovery).toBeVisible({ timeout: 20_000 })
  await expect(recovery.getByTestId('partial-failure-outcome')).toContainText('partial')
  await expect(recovery.getByTestId('failed-agent-scenario-analyst')).toBeVisible()

  const retryButton = recovery.getByTestId('retry-failed-agents')
  await expect(retryButton).toBeEnabled({ timeout: 20_000 })

  // Intercept the run-start call so no real Codex process is launched, and assert the
  // request re-runs only the failed agents from the prior run id.
  let capturedBody: Record<string, unknown> | null = null
  await page.route('**/api/run/start', async (route) => {
    capturedBody = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ runId: PARTIAL_RUN_ID, status: 'starting', state: 'STARTING' }),
    })
  })

  await retryButton.click()
  await expect(recovery.getByTestId('partial-failure-status')).toContainText(PARTIAL_RUN_ID, { timeout: 20_000 })

  expect(capturedBody).not.toBeNull()
  expect(capturedBody!.codexRerunFailed).toBe(true)
  expect(capturedBody!.codexRerunRunId).toBe(PARTIAL_RUN_ID)
  expect(capturedBody!.runtimeProvider).toBe('codex')
  expect(capturedBody!.reset).toBe(false)

  cleanupDealArtifacts(PARTIAL_DEAL_ID)
  expect(consoleErrors).toEqual([])
})
