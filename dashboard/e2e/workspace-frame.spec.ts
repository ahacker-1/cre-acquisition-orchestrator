import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  cleanupDealArtifacts,
  closeAdvancedDrawer,
  dataRoot,
  openAdvancedDrawer,
  openWorkspaceFromRecentDeals,
  saveLaunchReadyDeal,
  stopActiveRun,
} from './helpers'

// Focused smoke coverage for the redesigned persistent workspace frame (the lifecycle-spine
// shell that replaced the old 6-tab DealWorkspace). Verifies the always-present chrome:
// frame, spine (all 7 stages), right rail (live feed), command bar, stage focusing, and the
// advanced drawer open/close. The deep functional flows live in deal-library.spec.ts.

const FRAME_DEAL_ID = 'DEAL-2099-907'
const FRAME_DEAL_NAME = 'Playwright Frame Smoke Deal'
const FLAGGED_RECORD_DEAL_ID = 'DEAL-2099-908'
const CLEAN_RECORD_DEAL_ID = 'DEAL-2099-909'

// The seven lifecycle stages rendered by the spine, in order (see lib/stageModel.ts).
const SPINE_STAGE_IDS = ['intake', 'diligence', 'underwriting', 'financing', 'legal', 'closing', 'ic'] as const

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ request }) => {
  cleanupDealArtifacts(FRAME_DEAL_ID)
  cleanupDealArtifacts(FLAGGED_RECORD_DEAL_ID)
  cleanupDealArtifacts(CLEAN_RECORD_DEAL_ID)
  await stopActiveRun(request)
})

test.afterEach(async ({ request }) => {
  await stopActiveRun(request)
  cleanupDealArtifacts(FRAME_DEAL_ID)
  cleanupDealArtifacts(FLAGGED_RECORD_DEAL_ID)
  cleanupDealArtifacts(CLEAN_RECORD_DEAL_ID)
})

function seedRecordExtraction({
  dealId,
  documentId,
  fileName,
  path,
  label,
  value,
  valueType,
  unit,
  confidence,
}: {
  dealId: string
  documentId: string
  fileName: string
  path: string
  label: string
  value: unknown
  valueType: 'integer' | 'number' | 'string'
  unit?: string
  confidence: number
}): void {
  const now = '2026-06-24T00:00:00.000Z'
  const dealRoot = join(dataRoot, 'deals', dealId)
  const documentsDir = join(dealRoot, 'documents')
  const extractionsDir = join(dealRoot, 'extractions')
  mkdirSync(documentsDir, { recursive: true })
  mkdirSync(extractionsDir, { recursive: true })

  const storedName = `${documentId}.csv`
  const documentPath = join(documentsDir, storedName)
  writeFileSync(documentPath, `${label},${String(value)}\n`)

  const sourceRef = {
    documentId,
    fileName,
    fileHash: `hash-${documentId}`,
    parserId: 'playwright-seed',
    parserVersion: '1',
    location: { line: 1 },
    raw: `${label}: ${String(value)}`,
  }
  const document = {
    documentId,
    fileName,
    storedName,
    path: documentPath,
    mime: 'text/csv',
    size: 32,
    type: 'rent_roll',
    typeLabel: 'Rent Roll',
    phase: 'diligence',
    phaseLabel: 'Diligence',
    status: 'review_ready',
    extractionStatus: 'extracted',
    uploadedAt: now,
    extractedAt: now,
    parserId: 'playwright-seed',
    parserVersion: '1',
    sourceHash: `hash-${documentId}`,
    summary: 'Seeded extraction for workspace-frame e2e',
  }
  const extraction = {
    documentId,
    status: 'extracted',
    extractedAt: now,
    fields: [
      {
        fieldId: `${documentId}:${path}`,
        path,
        label,
        value,
        valueType,
        unit,
        confidence,
        source: fileName,
        sourceRef,
        reviewStatus: 'candidate',
      },
    ],
    metrics: {},
    notes: [],
    parserId: 'playwright-seed',
    parserVersion: '1',
    sourceHash: `hash-${documentId}`,
  }

  writeFileSync(
    join(dealRoot, 'document-manifest.json'),
    JSON.stringify({ version: 1, dealId, documents: [document] }, null, 2),
  )
  writeFileSync(join(extractionsDir, `${documentId}.json`), JSON.stringify(extraction, null, 2))
}

test('renders the persistent workspace frame, spine, rail, and command bar', async ({ page, request }) => {
  await saveLaunchReadyDeal(request, FRAME_DEAL_ID, FRAME_DEAL_NAME)
  await openWorkspaceFromRecentDeals(page, FRAME_DEAL_ID, FRAME_DEAL_NAME)

  // The frame shell + the always-visible lifecycle spine.
  await expect(page.getByTestId('workspace-frame')).toBeVisible()
  const spine = page.getByTestId('lifecycle-spine')
  await expect(spine).toBeVisible()

  // All seven stages render at once, each carrying a functional status marker.
  for (const stageId of SPINE_STAGE_IDS) {
    const step = page.getByTestId(`spine-step-${stageId}`)
    await expect(step).toBeVisible()
    await expect(step).toHaveAttribute('data-status', /done|live|blocked|idle/)
  }

  // The right rail (live feed) and the command bar are always present.
  await expect(page.getByTestId('live-feed')).toBeVisible()
  await expect(page.getByTestId('command-bar')).toBeVisible()
  await expect(page.getByTestId('command-input')).toBeVisible()

  const intakeProofPath = page.getByTestId('proof-path-strip-intake')
  await expect(intakeProofPath).toBeVisible()
  await expect(intakeProofPath).toContainText('Source doc')
  await expect(intakeProofPath).toContainText('Approved field')
  await expect(intakeProofPath).toContainText('Agent workpaper')
  await expect(intakeProofPath).toContainText('IC package')

  await page.getByTestId('spine-step-ic').click()
  const packageProofPath = page.getByTestId('proof-path-strip')
  await expect(packageProofPath).toBeVisible()
  await expect(packageProofPath).toContainText('Source doc')
  await expect(packageProofPath).toContainText('Approved field')
  await expect(packageProofPath).toContainText('Agent workpaper')
  await expect(packageProofPath).toContainText('IC package')
})

test('focuses a stage when its spine step is clicked', async ({ page, request }) => {
  await saveLaunchReadyDeal(request, FRAME_DEAL_ID, FRAME_DEAL_NAME)
  await openWorkspaceFromRecentDeals(page, FRAME_DEAL_ID, FRAME_DEAL_NAME)

  // A freshly opened deal starts focused on Intake.
  await expect(page.getByTestId('spine-step-intake')).toHaveAttribute('aria-current', 'step')

  // Clicking another stage focuses it (aria-current moves) and unfocuses the previous one.
  const underwriting = page.getByTestId('spine-step-underwriting')
  await underwriting.click()
  await expect(underwriting).toHaveAttribute('aria-current', 'step')
  await expect(page.getByTestId('spine-step-intake')).not.toHaveAttribute('aria-current', 'step')

  // The clicked step still exposes a valid functional status marker.
  await expect(underwriting).toHaveAttribute('data-status', /done|live|blocked|idle/)
})

test('staffs the Intake stage Your Team rail with the ingestion crew', async ({ page, request }) => {
  await saveLaunchReadyDeal(request, FRAME_DEAL_ID, FRAME_DEAL_NAME)
  await openWorkspaceFromRecentDeals(page, FRAME_DEAL_ID, FRAME_DEAL_NAME)

  // A freshly opened deal lands on Intake (the default stage). Its "Your Team" rail must show the
  // ingestion crew — intake is NOT a runtime checkpoint phase, so its team comes from the fixed
  // ingestion roster rather than workspace.phases. Regression guard for the empty-rail bug that
  // left the default landing reading "No agents staffed on this stage yet."
  await expect(page.getByTestId('spine-step-intake')).toHaveAttribute('aria-current', 'step')
  const teamRail = page.getByTestId('team-rail')
  await expect(teamRail).toBeVisible()
  await expect(teamRail.getByTestId('team-agent-document-orchestrator')).toBeVisible()
  await expect(teamRail.getByTestId('team-agent-rent-roll-parser')).toBeVisible()
  await expect(teamRail).not.toContainText('No agents staffed')

  // A runtime phase (underwriting) still staffs its own specialists from workspace.phases.
  await page.getByTestId('spine-step-underwriting').click()
  await expect(teamRail.getByTestId('team-agent-financial-model-builder')).toBeVisible()
})

test('blocks diligence start while intake record fields need review', async ({ page, request }) => {
  await saveLaunchReadyDeal(request, FLAGGED_RECORD_DEAL_ID, 'Flagged Intake Record Deal')
  seedRecordExtraction({
    dealId: FLAGGED_RECORD_DEAL_ID,
    documentId: 'doc-low-confidence',
    fileName: 'low-confidence-rent-roll.csv',
    path: 'financials.inPlaceOccupancy',
    label: 'In-Place Occupancy',
    value: 0.62,
    valueType: 'number',
    unit: 'decimal',
    confidence: 0.58,
  })
  await openWorkspaceFromRecentDeals(page, FLAGGED_RECORD_DEAL_ID, 'Flagged Intake Record Deal')

  await expect(page.getByTestId('needs-eye-count')).toContainText('1 value')
  const flaggedStart = page.getByTestId('start-diligence')
  await expect(flaggedStart).toBeDisabled()
  await flaggedStart.evaluate((button) => (button as HTMLButtonElement).click())
  await expect(page.getByTestId('spine-step-intake')).toHaveAttribute('aria-current', 'step')
  await expect(page.getByTestId('spine-step-diligence')).not.toHaveAttribute('aria-current', 'step')

  await saveLaunchReadyDeal(request, CLEAN_RECORD_DEAL_ID, 'Clean Intake Record Deal')
  seedRecordExtraction({
    dealId: CLEAN_RECORD_DEAL_ID,
    documentId: 'doc-clean-record',
    fileName: 'clean-rent-roll.csv',
    path: 'property.totalUnits',
    label: 'Total Units',
    value: 12,
    valueType: 'integer',
    unit: 'count',
    confidence: 0.94,
  })
  await openWorkspaceFromRecentDeals(page, CLEAN_RECORD_DEAL_ID, 'Clean Intake Record Deal')

  await expect(page.getByTestId('needs-eye-count')).toContainText('All values read cleanly')
  const cleanStart = page.getByTestId('start-diligence')
  await expect(cleanStart).toBeEnabled()
  await cleanStart.click()
  await expect(page.getByTestId('spine-step-diligence')).toHaveAttribute('aria-current', 'step')
})

test('opens and closes the advanced drawer', async ({ page, request }) => {
  await saveLaunchReadyDeal(request, FRAME_DEAL_ID, FRAME_DEAL_NAME)
  await openWorkspaceFromRecentDeals(page, FRAME_DEAL_ID, FRAME_DEAL_NAME)

  await expect(page.getByTestId('advanced-drawer')).toHaveCount(0)
  const drawer = await openAdvancedDrawer(page)
  // The drawer hosts the moved Mission / Controls surfaces.
  await expect(drawer.getByTestId('mission-control')).toBeVisible()
  await closeAdvancedDrawer(page)
  await expect(page.getByTestId('advanced-drawer')).toHaveCount(0)
})
