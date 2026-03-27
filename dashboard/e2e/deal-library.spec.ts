import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
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

async function stopActiveRun(request: APIRequestContext): Promise<void> {
  await request.post('http://127.0.0.1:8081/api/run/stop')

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await request.get('http://127.0.0.1:8081/api/run/status')
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
  await expect(page.getByRole('heading', { name: /Create a Deal|Edit Deal/ })).toBeVisible()
}

async function openDealLibraryModal(page: Page) {
  await page.getByTestId('header-deals-button').click()
  return page.getByTestId('deal-library-modal')
}

async function goNext(page: Page): Promise<void> {
  await page.getByTestId('deal-wizard-next').click()
}

async function fillLaunchReadyDeal(page: Page, dealId: string, dealName: string): Promise<void> {
  await page.getByTestId('deal-id-input').fill(dealId)
  await page.getByTestId('deal-name-input').fill(dealName)
  await page.getByRole('spinbutton', { name: 'Target Hold Period (years)' }).fill('5')
  await page.getByRole('spinbutton', { name: /Target IRR/ }).fill('0.15')
  await page.getByRole('spinbutton', { name: 'Target Equity Multiple' }).fill('1.9')
  await page.getByRole('spinbutton', { name: /Target Cash-on-Cash/ }).fill('0.08')
  await goNext(page)

  await page.getByRole('textbox', { name: 'Street Address' }).fill('500 Release Avenue')
  await page.getByRole('textbox', { name: 'City' }).fill('Austin')
  await page.getByRole('textbox', { name: /State/ }).fill('TX')
  await page.getByRole('textbox', { name: 'ZIP Code' }).fill('78701')
  await page.getByRole('spinbutton', { name: 'Year Built' }).fill('2003')
  await page.getByRole('spinbutton', { name: 'Total Units' }).fill('18')
  await goNext(page)

  await page.getByRole('textbox', { name: 'Type' }).fill('1BR/1BA')
  await page.getByRole('spinbutton', { name: 'Count' }).fill('18')
  await page.getByRole('spinbutton', { name: 'Avg Sq Ft' }).fill('725')
  await page.getByRole('spinbutton', { name: 'Market Rent' }).fill('1700')
  await page.getByRole('spinbutton', { name: 'In-Place Rent' }).fill('1600')
  await goNext(page)

  await page.getByRole('spinbutton', { name: 'Asking Price' }).fill('3600000')
  await page.getByRole('spinbutton', { name: 'Current NOI' }).fill('230000')
  await page.getByRole('spinbutton', { name: /In-Place Occupancy/ }).fill('0.94')
  await page.getByRole('spinbutton', { name: 'Target LTV (decimal)' }).fill('0.7')
  await page.getByRole('spinbutton', { name: 'Estimated Rate (decimal)' }).fill('0.061')
  await page.getByRole('spinbutton', { name: 'Loan Term' }).fill('10')
  await page.getByRole('spinbutton', { name: 'Amortization' }).fill('30')
  await goNext(page)

  await page.getByRole('textbox', { name: 'Seller Entity' }).fill('Playwright Seller LLC')
  await page.getByRole('textbox', { name: 'PSA Execution Date' }).fill('2026-04-01')
  await page.getByRole('textbox', { name: 'DD Start Date' }).fill('2026-04-02')
  await page.getByRole('textbox', { name: 'DD Expiration Date' }).fill('2026-04-20')
  await page.getByRole('textbox', { name: 'Closing Date' }).fill('2026-05-15')
  await page.getByTestId('deal-wizard-next').click()
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ request }) => {
  cleanupDealArtifacts(DRAFT_DEAL_ID)
  cleanupDealArtifacts(READY_DEAL_ID)
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
  await expect(page.getByRole('heading', { name: READY_DEAL_NAME })).toBeVisible({ timeout: 20_000 })

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
  await expect(page.getByRole('heading', { name: 'Riverside Gardens' })).toBeVisible({ timeout: 20_000 })

  expect(consoleErrors).toEqual([])
})
