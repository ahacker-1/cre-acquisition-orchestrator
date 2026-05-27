import { expect, test } from '@playwright/test'
import {
  cleanupDealArtifacts,
  closeAdvancedDrawer,
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

// The seven lifecycle stages rendered by the spine, in order (see lib/stageModel.ts).
const SPINE_STAGE_IDS = ['intake', 'diligence', 'underwriting', 'financing', 'legal', 'closing', 'ic'] as const

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ request }) => {
  cleanupDealArtifacts(FRAME_DEAL_ID)
  await stopActiveRun(request)
})

test.afterEach(async ({ request }) => {
  await stopActiveRun(request)
  cleanupDealArtifacts(FRAME_DEAL_ID)
})

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
