import { chromium } from '@playwright/test'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, '..', '..')
const assetsDir = resolve(repoRoot, 'docs', 'assets')
const baseURL = process.env.CRE_DASHBOARD_URL || 'http://localhost:5173'
const apiURL = process.env.CRE_API_URL || 'http://localhost:8081'
const sampleUploadPath = resolve(repoRoot, 'fixtures', 'parsers', 'rent-roll-basic.xlsx')

async function delay(ms) {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}

async function readApi(path) {
  const response = await fetch(`${apiURL}${path}`)
  if (!response.ok) throw new Error(`GET ${path} failed with ${response.status}`)
  return response.json()
}

async function waitForCondition(label, predicate, timeoutMs, intervalMs = 500) {
  const startedAt = Date.now()
  let lastError = null
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (await predicate()) return
    } catch (err) {
      lastError = err
    }
    await delay(intervalMs)
  }
  const suffix = lastError instanceof Error ? ` Last error: ${lastError.message}` : ''
  throw new Error(`Timed out waiting for ${label}.${suffix}`)
}

async function waitForRunIdle() {
  await waitForCondition('run to finish', async () => {
    const status = await readApi('/api/run/status')
    return !status.active && ['IDLE', 'COMPLETED', 'FAILED', 'STOPPED'].includes(status.state)
  }, 120_000)
}

async function waitForRunStartedOrCompleted() {
  await waitForCondition('run to start', async () => {
    const status = await readApi('/api/run/status')
    return status.active || ['STARTING', 'RUNNING', 'COMPLETED', 'FAILED', 'STOPPED'].includes(status.state)
  }, 20_000)
}

async function waitForRunDocuments() {
  await waitForCondition('run documents to be written', async () => {
    const status = await readApi('/api/run/status')
    if (!status.runId) return false
    const documents = await readApi(`/api/run/${status.runId}/documents`)
    return Array.isArray(documents.documents) && documents.documents.length >= 20
  }, 40_000)
}

async function waitForWorkspace(page) {
  await page.goto(baseURL, { waitUntil: 'networkidle' })
  await page.getByText('Connected').waitFor({ timeout: 20_000 })
  await waitForRunIdle()

  if (await page.getByTestId('drop-zone-hero').isVisible().catch(() => false)) {
    await capture(page, 'dashboard-front-door.png')
    await page.getByTestId('drop-zone-input').setInputFiles(sampleUploadPath)
    await page.getByTestId('quick-deal-modal').waitFor({ timeout: 20_000 })
    await capture(page, 'quick-deal-create.png')
    await page.getByTestId('quick-deal-cancel').click()
    await page.getByTestId('quick-deal-modal').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
  }

  if (!(await page.getByTestId('operator-deal-hub').isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /^Run Demo$/ }).click()
    await waitForRunStartedOrCompleted()
    await page.getByTestId('operator-deal-hub').waitFor({ timeout: 30_000 })
  }

  await waitForRunIdle()
  await waitForRunDocuments()
  await page.getByText('Completed').first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(500)
  await page.getByTestId('operator-deal-hub').waitFor({ timeout: 30_000 })
}

async function capture(page, name) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.screenshot({ path: resolve(assetsDir, name), fullPage: false })
  console.log(`captured docs/assets/${name}`)
}

async function clickTab(page, id) {
  await page.getByTestId(`workspace-tab-${id}`).click({ force: true })
  await page.waitForTimeout(350)
}

// W50: capture the source-backed extraction review panel. Runs in an isolated page so it
// does not disturb the deterministic demo gallery captured on the main page. Creates a deal
// from the document-first front door, opens Evidence, previews extraction, and captures the
// candidate-field review panel. Skips gracefully if the front door is not the landing view.
async function captureSourceExtractionReview(browser) {
  const reviewPage = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 })
  try {
    await reviewPage.goto(baseURL, { waitUntil: 'networkidle' })
    await reviewPage.getByText('Connected').waitFor({ timeout: 20_000 })
    await reviewPage.addStyleTag({
      content: `*, *::before, *::after { animation-duration: 0.001s !important; transition-duration: 0.001s !important; scroll-behavior: auto !important; }`,
    })
    const hero = reviewPage.getByTestId('drop-zone-hero')
    if (!(await hero.isVisible().catch(() => false))) {
      // A deal is already open (e.g. the demo run captured on the main page); return to the
      // document-first upload front door via the header affordance.
      const uploadButton = reviewPage.getByTestId('header-upload-package-button')
      if (await uploadButton.isVisible().catch(() => false)) {
        await uploadButton.click()
        await hero.waitFor({ timeout: 10_000 }).catch(() => {})
      }
    }
    if (!(await hero.isVisible().catch(() => false))) {
      console.warn('skip source-extraction-review.png: document-first front door not reachable')
      return
    }
    await reviewPage.getByTestId('drop-zone-input').setInputFiles(sampleUploadPath)
    await reviewPage.getByTestId('quick-deal-modal').waitFor({ timeout: 20_000 })
    await reviewPage.getByTestId('quick-deal-create').click()
    await reviewPage.getByTestId('operator-deal-hub').waitFor({ timeout: 30_000 })
    await reviewPage.getByTestId('workspace-tab-documents').click()
    const extractButton = reviewPage.getByTestId('extract-document-rent_roll')
    await extractButton.waitFor({ timeout: 20_000 })
    await extractButton.click()
    const preview = reviewPage.getByTestId('extraction-preview')
    await preview.waitFor({ timeout: 30_000 })
    await preview.getByText('Fields Found').first().waitFor({ timeout: 30_000 })
    await reviewPage.waitForTimeout(400)
    await capture(reviewPage, 'source-extraction-review.png')
  } finally {
    await reviewPage.close()
  }
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 })

await page.addStyleTag({
  content: `
    *, *::before, *::after {
      animation-duration: 0.001s !important;
      animation-delay: 0s !important;
      transition-duration: 0.001s !important;
      scroll-behavior: auto !important;
    }
  `,
})

await waitForWorkspace(page)

const guidedTourClose = page.getByTestId('guided-demo-close')
if (await guidedTourClose.isVisible().catch(() => false)) {
  await guidedTourClose.click()
  await page.getByTestId('guided-demo-overlay').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
}

await clickTab(page, 'mission')
await page.getByTestId('mission-control').waitFor({ timeout: 20_000 })
await capture(page, 'acquisition-command.png')

const swarmConsole = page.getByTestId('swarm-goal-console')
if (await swarmConsole.isVisible().catch(() => false)) {
  await swarmConsole
    .getByTestId('swarm-goal-input')
    .fill('Build an IC-ready go/no-go package and show me which specialists should work the deal')
  await swarmConsole.getByTestId('swarm-plan-button').click()
  await swarmConsole.getByTestId('swarm-recommended-workflow').waitFor({ timeout: 20_000 })
  await page.waitForTimeout(250)
}
await page.evaluate(() => window.scrollTo(0, Math.floor(window.innerHeight * 0.45)))
await page.waitForTimeout(200)
await capture(page, 'swarm-goal-console.png')

await page.evaluate(() => window.scrollTo(0, Math.floor(window.innerHeight * 0.75)))
await page.waitForTimeout(200)
await capture(page, 'mission-control.png')
await page.evaluate(() => window.scrollTo(0, 0))

await clickTab(page, 'agents')
await page.getByTestId('agent-tree').waitFor({ timeout: 20_000 })
const rentRollAgent = page.getByTestId('agent-row-rent-roll-analyst')
if (await rentRollAgent.isVisible().catch(() => false)) {
  await rentRollAgent.click({ force: true })
  await page.waitForTimeout(200)
}
await capture(page, 'deal-team-handoffs.png')

await clickTab(page, 'workpapers')
await page.getByText('Workpapers').first().waitFor({ timeout: 20_000 })
await capture(page, 'workpapers-evidence.png')

await clickTab(page, 'package')
await page.getByTestId('completion-package-view').waitFor({ timeout: 20_000 })
await capture(page, 'ic-package.png')

await captureSourceExtractionReview(browser)

await browser.close()
