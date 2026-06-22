import { expect, test } from '@playwright/test'
import { spawnSync } from 'child_process'
import { join } from 'path'
import {
  closeAdvancedDrawer,
  focusStage,
  openAdvancedDrawer,
  repoRoot,
  waitForDashboardReady,
} from './helpers'

const TARGET_COUNT = 150
const TARGET_DEAL_ID = 'QA-LOCAL-2026-0150'
const TARGET_DEAL_NAME = 'QA Local Portfolio 0150'
const SPINE_STAGE_IDS = ['intake', 'diligence', 'underwriting', 'financing', 'legal', 'closing', 'ic'] as const

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  const result = spawnSync(
    process.execPath,
    [
      join(repoRoot, 'scripts', 'seed-production-local-data.js'),
      '--count',
      String(TARGET_COUNT),
      '--clean',
      '--quiet',
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  )

  if (result.status !== 0) {
    throw new Error(`Failed to seed production-scale local data\n${result.stdout}\n${result.stderr}`)
  }
})

test('opens and exercises a 150-deal local production-scale workspace', async ({ page }) => {
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))

  await waitForDashboardReady(page)
  await page.getByTestId('header-deals-button').click()

  const library = page.getByTestId('deal-library-modal')
  await expect(library).toBeVisible()
  await expect
    .poll(async () => library.getByTestId(/^deal-card-QA-LOCAL-2026-/).count(), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(TARGET_COUNT)

  await library.getByTestId(`workspace-docs-${TARGET_DEAL_ID}`).click()

  const workspace = page.getByTestId('workspace-frame')
  await expect(workspace).toBeVisible({ timeout: 30_000 })
  await expect(workspace.getByRole('heading', { name: TARGET_DEAL_NAME, level: 1 })).toBeVisible()

  for (const stageId of SPINE_STAGE_IDS) {
    const step = page.getByTestId(`spine-step-${stageId}`)
    await expect(step).toBeVisible()
    await expect(step).toHaveAttribute('data-status', /done|live|blocked|idle/)
  }

  const intakeDetails = page.getByTestId('intake-detailed-review')
  await expect(intakeDetails).toBeVisible()
  if (!(await intakeDetails.evaluate((node) => (node as HTMLDetailsElement).open))) {
    await intakeDetails.locator('summary').click()
  }
  await expect(page.getByTestId('source-document-rent_roll')).toBeVisible()
  await page.getByTestId('extract-document-rent_roll').click()
  await expect(page.getByTestId('extraction-preview')).toBeVisible()
  await expect(page.getByTestId('uploaded-data-inspector')).toBeVisible()
  await page.getByTestId('uploaded-field-search').fill('rent')
  await expect(page.getByTestId('uploaded-field-list')).toContainText(/rent/i)

  await focusStage(page, 'underwriting')
  await expect(page.getByRole('heading', { name: 'Agent Playbook', level: 2 })).toBeVisible()
  await expect(page.getByTestId('phase-launch-underwriting')).toBeVisible()
  await expect(page.getByTestId('phase-agent-financial-model-builder')).toBeVisible()

  await page.getByTestId('command-input').fill('refresh the model')
  await page.getByTestId('command-submit').click()
  const agentPanel = page.getByTestId('agent-panel')
  await expect(agentPanel).toBeVisible()
  await expect(agentPanel).toContainText('Financial Model Builder')
  await page.getByTestId('agent-panel-close').click()

  const drawer = await openAdvancedDrawer(page)
  await expect(drawer.getByTestId('mission-control')).toBeVisible()
  await expect(drawer.getByTestId('workspace-workflow-launcher')).toBeVisible()
  await expect(drawer.getByTestId('workflow-step-deal')).toBeVisible()
  await expect(drawer.getByTestId('workflow-step-workflow')).toBeVisible()
  await drawer.getByTestId('workflow-step-review').click()
  await expect(drawer.getByTestId('workflow-deal-select')).toBeVisible()
  await expect(drawer.getByTestId('workflow-select')).toBeVisible()
  await expect(drawer.getByTestId('workflow-runtime-provider-select')).toBeVisible()
  await closeAdvancedDrawer(page)

  await focusStage(page, 'ic')
  await expect(page.getByTestId('completion-package-view')).toBeVisible()
  await expect(page.getByTestId('source-backed-input-summary')).toBeVisible()
  await page.getByTestId('package-export-json').click()
  await expect(page.getByTestId('package-export-status')).toContainText('JSON exported', { timeout: 30_000 })

  expect(browserErrors).toEqual([])
})
