import { expect, test, type APIRequestContext, type APIResponse, type Page } from '@playwright/test'
import { existsSync, rmSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dashboardRoot = resolve(__dirname, '..')
const repoRoot = resolve(dashboardRoot, '..')
const dataRoot = join(repoRoot, 'data')

const DRAFT_DEAL_ID = 'DEAL-2099-901'
const DRAFT_DEAL_NAME = 'Playwright Draft Deal'
const READY_DEAL_ID = 'DEAL-2099-902'
const READY_DEAL_NAME = 'Playwright Launch Deal'
const SAMPLE_DEAL_ID = 'demo-pass-001'
const WORKSPACE_DEAL_ID = 'DEAL-2099-903'
const WORKSPACE_DEAL_NAME = 'Playwright Operator Hub Deal'

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

async function waitForDashboardReady(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByText('Connected')).toBeVisible({ timeout: 20_000 })
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
  await waitForDashboardReady(page)
  await expect(page.getByTestId('operator-deal-hub')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('main').getByRole('heading', { name: dealName })).toBeVisible({ timeout: 20_000 })
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
  await expect(modal.getByTestId(`deal-card-${READY_DEAL_ID}`)).toContainText('Running')

  expect(consoleErrors).toEqual([])
})

test('launches a shipped sample deal from the library', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page)

  await waitForDashboardReady(page)
  const modal = await openDealLibraryModal(page)
  await modal.getByTestId('launch-deal-demo-pass-001').click()

  await expect(page.getByText('Run: Running')).toBeVisible({ timeout: 15_000 })
  await expect(modal).toBeHidden({ timeout: 20_000 })
  await expect(page.getByRole('main').getByRole('heading', { name: 'Riverside Gardens' })).toBeVisible({ timeout: 20_000 })

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
    {
      name: 'playwright-rent-roll.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from([
        'Unit,Unit Type,SqFt,Market Rent,Current Rent,Status',
        '101,1BR/1BA,700,1700,1600,Occupied',
        '102,1BR/1BA,710,1710,1610,Occupied',
        '201,2BR/2BA,980,2200,2050,Occupied',
        '202,2BR/2BA,990,2210,0,Vacant',
      ].join('\n')),
    },
    {
      name: 'playwright-t12-financials.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from([
        'Line Item,T12 Total',
        'Total Revenue,520000',
        'Total Operating Expenses,260000',
        'Net Operating Income,260000',
      ].join('\n')),
    },
    {
      name: 'playwright-offering-memo.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from([
        '# Playwright Offering Memo',
        'Asking Price: $3,750,000',
        'Total Units | 4-unit community',
        'Year Built | 2009',
        'NOI: $260,000',
        '75% occupancy',
      ].join('\n')),
    },
  ])

  await expect(page.getByTestId('source-document-rent_roll')).toContainText('playwright-rent-roll.csv')
  await expect(page.getByTestId('source-document-t12')).toContainText('playwright-t12-financials.csv')
  await expect(page.getByTestId('source-document-offering_memo')).toContainText('playwright-offering-memo.md')

  const extractionPreview = page.getByTestId('extraction-preview')

  await page.getByTestId('extract-document-rent_roll').click()
  await expect(extractionPreview).toContainText('3 Fields Found')
  await expect(extractionPreview).toContainText('Parsed 4 rent roll rows')
  await expect(extractionPreview).toContainText('Total Units')
  await expect(extractionPreview).toContainText('In-Place Occupancy')
  await extractionPreview.locator('[data-field-path="property.totalUnits"]').check()
  await extractionPreview.locator('[data-field-path="property.unitMix.types"]').check()
  await extractionPreview.locator('[data-field-path="financials.inPlaceOccupancy"]').check()
  await extractionPreview.getByTestId('confirm-conflict-review').check()
  await page.getByTestId('apply-extraction').click()
  await expect(page.getByTestId('source-document-rent_roll')).toContainText('applied')

  await page.getByTestId('extract-document-t12').click()
  await expect(extractionPreview).toContainText('3 Fields Found')
  await expect(extractionPreview).toContainText('Trailing T12 Revenue')
  await expect(extractionPreview).toContainText('Current NOI')
  await extractionPreview.locator('[data-field-path="financials.trailingT12Revenue"]').check()
  await extractionPreview.locator('[data-field-path="financials.trailingT12Expenses"]').check()
  await extractionPreview.locator('[data-field-path="financials.currentNOI"]').check()
  await extractionPreview.getByTestId('confirm-conflict-review').check()
  await page.getByTestId('apply-extraction').click()
  await expect(page.getByTestId('source-document-t12')).toContainText('applied')

  const dealResponse = await request.get(`${API_URL}/api/deals/${WORKSPACE_DEAL_ID}`)
  await expectApiOk(dealResponse)
  const dealRecord = (await dealResponse.json()) as {
    deal: { property?: Record<string, unknown>; financials?: Record<string, unknown> }
  }
  expect(dealRecord.deal.property?.totalUnits).toBe(4)
  expect(dealRecord.deal.financials?.currentNOI).toBe(260_000)
  expect(dealRecord.deal.financials?.trailingT12Revenue).toBe(520_000)

  await page.getByTestId('workspace-tab-underwriting').click()
  await expect(page.getByRole('heading', { name: 'Agent Playbook' })).toBeVisible()
  await expect(documentCoverageStat(page)).toContainText('100%')
  await expect(page.getByText('Required Documents').locator('..')).toContainText('Offering Memo')

  await page.getByTestId('workspace-tab-due-diligence').click()
  await expect(page.getByTestId('workspace-tab-due-diligence')).toHaveClass(/active/)
  await expect(documentCoverageStat(page)).toContainText('20%')

  await page.getByTestId('workspace-tab-financing').click()
  await expect(page.getByTestId('workspace-tab-financing')).toHaveClass(/active/)
  await expect(documentCoverageStat(page)).toContainText('67%')

  await page.getByTestId('workspace-tab-underwriting').click()
  await stopActiveRun(request)
  await page.getByTestId('phase-launch-underwriting').click()
  await expect(page.getByText(/Run: (Starting|Running|Completed)/)).toBeVisible({ timeout: 15_000 })

  const status = await request.get(`${API_URL}/api/run/status`)
  const payload = (await status.json()) as { state?: string; workflowId?: string }
  expect(payload.workflowId).toBe('underwriting-refresh')
  expect(['STARTING', 'RUNNING', 'COMPLETED']).toContain(payload.state)

  expect(consoleErrors).toEqual([])
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
  await page.getByTestId('workspace-tab-overview').click()
  await expect(page.getByText('skipped').first()).toBeVisible({ timeout: 20_000 })

  await page.getByTestId('workspace-tab-package').click()
  const packageView = page.getByTestId('completion-package-view')
  await expect(packageView).toBeVisible()
  await expect(packageView).toContainText('Completion Package')
  await expect(packageView).toContainText('Riverside Gardens')
  await expect(packageView.getByTestId('source-backed-input-summary')).toContainText('Source-Backed Inputs')
  await expect(packageView).toContainText('Scoped workflow completed. Review the package outputs before expanding to a full closing run.')

  expect(consoleErrors).toEqual([])
})
