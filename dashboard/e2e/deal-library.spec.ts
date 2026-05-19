import { expect, test, type APIRequestContext, type APIResponse, type Page } from '@playwright/test'
import { existsSync, rmSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dashboardRoot = resolve(__dirname, '..')
const repoRoot = resolve(dashboardRoot, '..')
const dataRoot = join(repoRoot, 'data')
const parserFixturesRoot = join(repoRoot, 'fixtures', 'parsers')
const firstRealDealRoot = join(repoRoot, 'fixtures', 'first-real-deal')

const DRAFT_DEAL_ID = 'DEAL-2099-901'
const DRAFT_DEAL_NAME = 'Playwright Draft Deal'
const READY_DEAL_ID = 'DEAL-2099-902'
const READY_DEAL_NAME = 'Playwright Launch Deal'
const SAMPLE_DEAL_ID = 'demo-pass-001'
const WORKSPACE_DEAL_ID = 'DEAL-2099-903'
const WORKSPACE_DEAL_NAME = 'Playwright Operator Hub Deal'
const RECENT_DEAL_ID = 'DEAL-2099-904'
const RECENT_DEAL_NAME = 'Playwright Recent Deal'

const API_URL = 'http://127.0.0.1:8081'

function cleanupDealArtifacts(dealId: string): void {
  const targets = [
    join(dataRoot, 'deals', dealId),
    join(dataRoot, 'status', `${dealId}.json`),
    join(dataRoot, 'status', dealId),
    join(dataRoot, 'logs', dealId),
  ]

  for (const target of targets) {
    if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true })
    }
  }
}

function cleanupWorkflowPresets(): void {
  const target = join(dataRoot, 'workflow-presets')
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true })
  }
}

function cleanupGeneratedRuntimeArtifacts(dealId: string): void {
  const targets = [
    join(dataRoot, 'phase-outputs', dealId),
    join(dataRoot, 'reports', dealId),
  ]

  for (const target of targets) {
    if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true })
    }
  }
}

async function expectApiOk(response: APIResponse): Promise<void> {
  if (response.ok()) return
  throw new Error(`API request failed (${response.status()} ${response.statusText()}): ${await response.text()}`)
}

function isApiResponse(response: APIResponse, method: string, path: string): boolean {
  return new URL(response.url()).pathname === path && response.request().method() === method
}

async function stopActiveRun(request: APIRequestContext): Promise<void> {
  await request.post(`${API_URL}/api/run/stop`)

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await request.get(`${API_URL}/api/run/status`)
    const payload = (await response.json()) as { active?: boolean }
    if (!payload.active) return
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500))
  }
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

async function waitForDashboardReady(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByText('Connected')).toBeVisible({ timeout: 20_000 })
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

function buildLaunchReadyDeal(dealId: string, dealName: string): Record<string, unknown> {
  return {
    dealId,
    dealName,
    property: {
      address: '500 Operator Way',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      propertyType: 'multifamily',
      yearBuilt: 2008,
      totalUnits: 12,
      unitMix: {
        types: [
          { type: '1BR/1BA', count: 12, avgSqFt: 725, marketRent: 1700, inPlaceRent: 1600 },
        ],
      },
    },
    financials: {
      askingPrice: 3_600_000,
      currentNOI: 230_000,
      inPlaceOccupancy: 0.94,
    },
    financing: {
      targetLTV: 0.7,
      estimatedRate: 0.061,
      loanTerm: 10,
      amortization: 30,
      loanType: 'Agency',
    },
    investmentStrategy: 'core-plus',
    targetHoldPeriod: 5,
    targetIRR: 0.15,
    targetEquityMultiple: 1.9,
    targetCashOnCash: 0.08,
    seller: {
      entity: 'Playwright Seller LLC',
    },
    timeline: {
      psaExecutionDate: '2026-04-01',
      ddStartDate: '2026-04-02',
      ddExpirationDate: '2026-04-20',
      closingDate: '2026-05-15',
    },
    notes: 'Operator hub E2E fixture.',
  }
}

async function saveLaunchReadyDeal(
  request: APIRequestContext,
  dealId: string,
  dealName: string,
): Promise<void> {
  const response = await request.post(`${API_URL}/api/deals`, {
    data: {
      deal: buildLaunchReadyDeal(dealId, dealName),
      mode: 'launch',
    },
  })
  await expectApiOk(response)
}

async function launchWorkflowForDeal(
  request: APIRequestContext,
  workflowId: string,
  dealId: string,
): Promise<void> {
  const response = await request.post(`${API_URL}/api/workflows/${workflowId}/launch`, {
    data: {
      dealId,
      scenario: 'core-plus',
      speed: 'fast',
      reset: false,
    },
  })
  await expectApiOk(response)
}

async function waitForOperatorDealHub(page: Page, dealName: string): Promise<void> {
  await openWorkspaceFromRecentDeals(page, WORKSPACE_DEAL_ID, dealName)
}

async function openWorkspaceFromRecentDeals(page: Page, dealId: string, dealName: string): Promise<void> {
  await waitForDashboardReady(page)
  const workspace = page.getByTestId('operator-deal-hub')
  const heading = page.getByRole('main').getByRole('heading', { name: dealName })
  const strip = page.getByTestId('recent-deals-strip')
  const card = strip.getByTestId(`deal-card-${dealId}`)

  const visibleTarget = await Promise.race([
    workspace.waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'workspace' as const).catch(() => null),
    card.waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'card' as const).catch(() => null),
  ])

  if (visibleTarget === 'workspace' || (await workspace.isVisible())) {
    await expect(heading).toBeVisible({ timeout: 20_000 })
    return
  }

  if (visibleTarget !== 'card') {
    await expect(card).toBeVisible({ timeout: 1_000 })
  }

  try {
    await strip.getByTestId(`workspace-docs-${dealId}`).click({ timeout: 5_000 })
  } catch (error) {
    if (!(await workspace.isVisible())) {
      throw error
    }
  }

  if (await workspace.isVisible()) {
    await expect(heading).toBeVisible({ timeout: 20_000 })
    return
  }

  await expect(workspace).toBeVisible({ timeout: 20_000 })
  await expect(heading).toBeVisible({ timeout: 20_000 })
}

function documentCoverageStat(page: Page) {
  return page.getByText('Doc Coverage').locator('..')
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ request }) => {
  cleanupDealArtifacts(DRAFT_DEAL_ID)
  cleanupDealArtifacts(READY_DEAL_ID)
  cleanupDealArtifacts(SAMPLE_DEAL_ID)
  cleanupDealArtifacts(WORKSPACE_DEAL_ID)
  cleanupDealArtifacts(RECENT_DEAL_ID)
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

  await expect(page.getByTestId('operator-deal-hub')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('workspace-tab-documents')).toHaveClass(/active/)
  await expect(page.getByTestId('operator-command-bar')).toContainText('Upload the first source package')
  await page.getByTestId('workspace-tab-documents').click()
  await expect(page.getByTestId('source-document-rent_roll')).toContainText('playwright-hero-rent-roll.csv')

  const extractionPreview = page.getByTestId('extraction-preview')
  await page.getByTestId('extract-document-rent_roll').click()
  await expect(extractionPreview).toContainText('3 Fields Found')
  await extractionPreview.locator('[data-field-path="property.totalUnits"]').check()
  await extractionPreview.locator('[data-field-path="property.unitMix.types"]').check()
  await extractionPreview.locator('[data-field-path="financials.inPlaceOccupancy"]').check()
  await page.getByTestId('apply-extraction').click()
  await expect(page.getByTestId('source-document-rent_roll')).toContainText('applied')

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
  await expect(page.getByTestId('operator-deal-hub')).toBeVisible({ timeout: 20_000 })
  await expectViewportAtTop(page)
  await expect(page.getByTestId('workspace-tab-documents')).toHaveClass(/active/)

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

  await expect(page.getByTestId('operator-deal-hub')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('main').getByRole('heading', { name: 'Parkview Apartments' })).toBeVisible({ timeout: 20_000 })

  const tour = page.getByTestId('guided-demo-overlay')
  await expect(tour).toBeVisible()
  await expect(tour.getByTestId('guided-demo-step-title')).toContainText('Acquisition Command')
  await expect(page.getByTestId('workspace-tab-mission')).toHaveClass(/active/)
  await expect(page.getByTestId('mission-control')).toBeVisible()

  await tour.getByTestId('guided-demo-next').click()
  await expect(tour.getByTestId('guided-demo-step-title')).toContainText('Swarm Goal Console')
  await expect(page.getByTestId('workspace-tab-mission')).toHaveClass(/active/)
  await expect(page.getByTestId('swarm-goal-console')).toBeVisible()

  await tour.getByTestId('guided-demo-next').click()
  await expect(tour.getByTestId('guided-demo-step-title')).toContainText('Deal Team')
  await expect(page.getByTestId('workspace-tab-agents')).toHaveClass(/active/)
  await expect(page.getByTestId('agent-tree')).toBeVisible()

  await tour.getByTestId('guided-demo-next').click()
  await expect(tour.getByTestId('guided-demo-step-title')).toContainText('Workpapers & Evidence')
  await expect(page.getByTestId('workspace-tab-workpapers')).toHaveClass(/active/)
  await expect(page.getByTestId('workpapers-evidence-view')).toBeVisible()

  await tour.getByTestId('guided-demo-next').click()
  await expect(tour.getByTestId('guided-demo-step-title')).toContainText('IC Package')
  await expect(page.getByTestId('workspace-tab-package')).toHaveClass(/active/)
  await expect(page.getByTestId('completion-package-view')).toBeVisible()

  await tour.getByTestId('guided-demo-close').click()
  await expect(tour).toBeHidden()

  expect(consoleErrors).toEqual([])
})

test('mobile guided workspace smoke @mobile', async ({ page, request }) => {
  const consoleErrors = collectConsoleErrors(page)

  await saveLaunchReadyDeal(request, WORKSPACE_DEAL_ID, WORKSPACE_DEAL_NAME)
  await waitForDashboardReady(page)

  await page.getByTestId(`workspace-docs-${WORKSPACE_DEAL_ID}`).click()
  await expect(page.getByTestId('operator-deal-hub')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('operator-command-bar')).toBeVisible()
  await page.getByTestId('workspace-tab-mission').scrollIntoViewIfNeeded()
  await expect(page.getByTestId('workspace-tab-advanced')).toBeInViewport()
  await page.getByTestId('workspace-tab-mission').click()
  await expect(page.getByTestId('mission-control')).toContainText('Acquisition Command')
  await page.getByTestId('workspace-tab-advanced').click()
  await expect(page.getByTestId('deal-progression-guide')).toContainText('What is needed next')
  await page.getByTestId('workspace-tab-package').click()
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
  await expect(page.getByTestId('operator-deal-hub')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('workspace-tab-advanced').click()

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
  await waitForOperatorDealHub(page, WORKSPACE_DEAL_NAME)
  await stopActiveRun(request)

  await expect(page.getByTestId('workspace-tab-documents')).toHaveClass(/active/)
  await expect(page.getByTestId('operator-command-bar')).toContainText('Sample evidence is driving the active run')
  await page.getByTestId('workspace-tab-mission').click()
  await expect(page.getByTestId('mission-control')).toContainText('Acquisition Command')
  await page.getByTestId('workspace-tab-advanced').click()
  await expect(page.getByTestId('deal-progression-guide')).toContainText('What is needed next')
  await expect(page.getByTestId('guide-section-underwriting')).toContainText('Checklist and help guide')
  const briefing = page.getByTestId('operator-briefing')
  await expect(briefing).toContainText('Launch Readiness')
  await expect(briefing.getByTestId('operator-next-action')).toContainText('Upload the first source package')
  await expect(briefing.getByTestId('source-backed-input-score')).toContainText('0/4')
  await expect(briefing.getByTestId('workflow-readiness-full-acquisition-review')).toContainText('warning')
  await expect(page.getByTestId('cockpit-launch-readiness')).toContainText('0/4')

  await page.getByTestId('criteria-scenario').selectOption('value-add')
  await page.getByTestId('criteria-target-irr').fill('0.185')
  const criteriaSaveResponse = page.waitForResponse(
    (response) => isApiResponse(response, 'POST', `/api/deals/${WORKSPACE_DEAL_ID}/criteria`),
  )
  await page.getByTestId('criteria-save').click()
  expect((await criteriaSaveResponse).ok()).toBe(true)

  const workspaceResponse = await request.get(`${API_URL}/api/deals/${WORKSPACE_DEAL_ID}/workspace`)
  await expectApiOk(workspaceResponse)
  const workspace = (await workspaceResponse.json()) as {
    criteria: { scenario?: string; targetIRR?: number }
  }
  expect(workspace.criteria.scenario).toBe('value-add')
  expect(workspace.criteria.targetIRR).toBe(0.185)

  await page.getByTestId('workspace-tab-documents').click()
  await page.getByTestId('source-document-upload').setInputFiles([
    join(parserFixturesRoot, 'rent-roll-messy-realistic.xlsx'),
    join(parserFixturesRoot, 't12-messy-realistic.xlsx'),
    join(firstRealDealRoot, 'offering-memo-messy-realistic.md'),
  ])

  await expect(page.getByTestId('source-document-rent_roll')).toContainText('rent-roll-messy-realistic.xlsx')
  await expect(page.getByTestId('source-document-t12')).toContainText('t12-messy-realistic.xlsx')
  await expect(page.getByTestId('source-document-offering_memo')).toContainText('offering-memo-messy-realistic.md')
  await expect(page.getByTestId('deal-cockpit-sidebar')).toContainText('Rent Roll')
  await expect(page.getByTestId('deal-cockpit-sidebar')).toContainText('T12')
  await expect(page.getByTestId('deal-cockpit-sidebar')).toContainText('Environmental')
  await expect(page.getByTestId('cockpit-next-action')).toContainText('Run extraction')
  await page.getByTestId('cockpit-phase-underwriting').click()
  await expect(page.getByRole('heading', { name: 'Underwriting' })).toBeVisible()
  await page.getByTestId('workspace-tab-documents').click()

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

  await page.getByTestId('extract-document-t12').click()
  await expect(extractionPreview).toContainText('3 Fields Found')
  await expect(extractionPreview).toContainText('Trailing T12 Revenue')
  await expect(extractionPreview).toContainText('Current NOI')
  await extractionPreview.getByTestId('select-all-safe-fields').click()
  await expect(extractionPreview.getByTestId('selected-field-change-summary')).toContainText('Current NOI')
  await extractionPreview.getByTestId('confirm-conflict-review').check()
  await page.getByTestId('apply-extraction').click()
  await expect(page.getByTestId('source-document-t12')).toContainText('applied')
  await expect(page.getByTestId('cockpit-launch-readiness')).toContainText('3/4')

  await page.getByTestId('extract-document-offering_memo').click()
  await expect(extractionPreview).toContainText('Asking Price')
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
  await expect(page.getByTestId('cockpit-launch-readiness')).toContainText('4/4')

  await page.getByTestId('workspace-tab-advanced').click()
  await expect(page.getByTestId('operator-command-bar')).toBeVisible()
  await expect(page.getByTestId('guide-section-underwriting')).toContainText('Run underwriting refresh')
  await page.getByTestId('guide-note-underwriting-run-workflow').fill('Reviewed by Playwright before phase launch.')
  await page.getByTestId('guide-complete-underwriting-run-workflow').click()
  await expect(page.getByTestId('guide-checklist-underwriting-run-workflow')).toContainText('complete')

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

  await page.getByTestId('workspace-tab-package').click()
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

  await page.getByTestId('cockpit-phase-underwriting').click()
  await expect(page.getByRole('heading', { name: 'Agent Playbook' })).toBeVisible()
  await expect(documentCoverageStat(page)).toContainText('100%')
  await expect(page.getByText('Required Documents').locator('..')).toContainText('Offering Memo')
  await page.getByTestId('cockpit-phase-due-diligence').click()
  await expect(page.getByRole('heading', { name: 'Due Diligence' })).toBeVisible()

  await page.getByTestId('cockpit-phase-due-diligence').click()
  await expect(page.getByRole('heading', { name: 'Due Diligence' })).toBeVisible()
  await expect(documentCoverageStat(page)).toContainText('20%')

  await page.getByTestId('cockpit-phase-financing').click()
  await expect(page.getByRole('heading', { name: 'Financing' })).toBeVisible()
  await expect(documentCoverageStat(page)).toContainText('67%')

  await page.getByTestId('cockpit-phase-underwriting').click()
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
  await expect(page.getByTestId('operator-deal-hub')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('workspace-tab-documents').click()
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
  await expect(page.getByTestId('deal-cockpit-sidebar')).toContainText('PDF and Excel stay honest')

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
  await expect(page.getByTestId('operator-deal-hub')).toBeVisible()

  await page.getByTestId('workspace-tab-mission').click()
  const mission = page.getByTestId('mission-control')
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

  await page.getByTestId('workspace-tab-agents').click()
  await expect(page.getByTestId('agent-tree')).toContainText('Deal Team Lead')
  await expect(page.getByTestId('agent-phase-row-due-diligence')).toContainText(/Complete|Running|Skipped/)
  await expect(page.getByTestId('agent-row-rent-roll-analyst')).toContainText(/Filed|Working now|Queued/)
  await expect(page.getByTestId('agent-row-financial-model-builder')).toContainText(/Stress-testing returns|Filed/)

  await page.getByTestId('workspace-tab-advanced').click()
  await expect(page.getByText('skipped').first()).toBeVisible({ timeout: 20_000 })

  await page.getByTestId('workspace-tab-package').click()
  const packageView = page.getByTestId('completion-package-view')
  await expect(packageView).toBeVisible()
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
