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

async function postApi(path, body) {
  const response = await fetch(`${apiURL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  if (!response.ok) throw new Error(`POST ${path} failed with ${response.status}`)
  return response.json().catch(() => ({}))
}

// Kick the deterministic demo run the same way the header "Run Demo" button does (it POSTs
// /api/run/start). That control is now hidden on the clean front door, so call the API directly;
// the app auto-reveals the workspace once the run goes active.
async function startDemoRun() {
  await postApi('/api/run/start', {
    dealPath: 'config/deal.json',
    mode: 'live',
    speed: 'normal',
    runtimeProvider: 'simulation',
    reset: true,
  })
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

// Land in the persistent deal space (the redesigned "workspace-frame", which replaced the old
// "operator-deal-hub"). From the front door we capture the door, then run the deterministic
// Parkview demo so the spine, rail, and stages populate with no API keys.
async function waitForWorkspace(page) {
  await page.goto(baseURL, { waitUntil: 'networkidle' })
  await page.getByText('Connected').waitFor({ timeout: 20_000 })
  await waitForRunIdle()

  if (await page.getByTestId('drop-zone-hero').isVisible().catch(() => false)) {
    await capture(page, 'dashboard-front-door.png')
  }

  if (!(await page.getByTestId('workspace-frame').isVisible().catch(() => false))) {
    await startDemoRun()
    await waitForRunStartedOrCompleted()
    await page.getByTestId('workspace-frame').waitFor({ timeout: 30_000 })
  }

  await waitForRunIdle()
  await waitForRunDocuments()
  await page.getByText('Completed').first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(500)
  await page.getByTestId('workspace-frame').waitFor({ timeout: 30_000 })
}

async function capture(page, name) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.screenshot({ path: resolve(assetsDir, name), fullPage: false })
  console.log(`captured docs/assets/${name}`)
}

// Focus a lifecycle stage by clicking its spine step. Stage ids: intake | diligence |
// underwriting | financing | legal | closing | ic. The center stage swaps to the focused stage;
// the frame (header, spine, rail, command bar) stays put.
async function focusStage(page, stageId) {
  await page.getByTestId(`spine-step-${stageId}`).click({ force: true })
  await page.waitForTimeout(350)
}

// W50 (redesigned): capture the Intake auto-fill moment in an isolated page so it does not
// disturb the deterministic demo gallery captured on the main page. Creates a deal from the
// document-first front door, lands in Intake, extracts the rent roll so the auto-filled deal
// record populates, and captures it. Skips gracefully if the front door is not reachable.
async function captureIntakeAutoFill(browser) {
  const intakePage = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 })
  try {
    await intakePage.goto(baseURL, { waitUntil: 'networkidle' })
    await intakePage.getByText('Connected').waitFor({ timeout: 20_000 })
    await intakePage.addStyleTag({
      content: `*, *::before, *::after { animation-duration: 0.001s !important; transition-duration: 0.001s !important; scroll-behavior: auto !important; }`,
    })
    const hero = intakePage.getByTestId('drop-zone-hero')
    if (!(await hero.isVisible().catch(() => false))) {
      // A deal is already open (e.g. the demo run captured on the main page); return to the
      // document-first front door via the New Deal header affordance.
      const newDealButton = intakePage.getByTestId('header-new-deal-button')
      if (await newDealButton.isVisible().catch(() => false)) {
        await newDealButton.click()
        await hero.waitFor({ timeout: 10_000 }).catch(() => {})
      }
    }
    if (!(await hero.isVisible().catch(() => false))) {
      console.warn('skip source-extraction-review.png: document-first front door not reachable')
      return
    }
    await intakePage.getByTestId('drop-zone-input').setInputFiles(sampleUploadPath)
    await intakePage.getByTestId('quick-deal-modal').waitFor({ timeout: 20_000 })
    await intakePage.getByTestId('quick-deal-create').click()
    await intakePage.getByTestId('workspace-frame').waitFor({ timeout: 30_000 })
    // The deal opens on the Intake stage; make sure it is focused, then surface the auto-filled
    // record. Open the detailed-review disclosure to extract if the record has not auto-filled yet.
    await focusStage(intakePage, 'intake')
    await intakePage.getByTestId('intake-stage').waitFor({ timeout: 20_000 })
    const detailedReview = intakePage.getByTestId('intake-detailed-review')
    if (await detailedReview.isVisible().catch(() => false)) {
      const extractButton = intakePage.getByTestId('extract-document-rent_roll')
      if (await extractButton.isVisible().catch(() => false)) {
        await extractButton.click()
      }
    }
    const inspector = intakePage.getByTestId('uploaded-data-inspector')
    if (await inspector.isVisible({ timeout: 30_000 }).catch(() => false)) {
      await inspector.getByTestId('uploaded-field-list').getByText('Market Rent').click().catch(() => {})
      await inspector.getByTestId('uploaded-row-3').click().catch(() => {})
      await inspector.scrollIntoViewIfNeeded()
      await intakePage.waitForTimeout(300)
      await capture(intakePage, 'uploaded-data-inspector.png')
    } else {
      console.warn('skip uploaded-data-inspector.png: uploaded data inspector not visible')
    }
    // The auto-filled deal record is the headline of Intake.
    await intakePage.getByTestId('deal-record').waitFor({ timeout: 30_000 })
    await intakePage.getByTestId('deal-record').scrollIntoViewIfNeeded()
    await intakePage.waitForTimeout(500)
    await capture(intakePage, 'source-extraction-review.png')
  } finally {
    await intakePage.close()
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

// The deal space: the whole frame — header + lifecycle spine + center stage + Live Feed / Your
// Team rail + command bar. Focus Underwriting so the center stage shows a phase mid-lifecycle.
await focusStage(page, 'underwriting')
await page.getByTestId('lifecycle-spine').waitFor({ timeout: 20_000 })
await page.getByTestId('live-feed').waitFor({ timeout: 20_000 })
await page.getByTestId('command-bar').waitFor({ timeout: 20_000 })
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(200)
await capture(page, 'acquisition-command.png')

// Watch it work: summon a specialist into the slide-in agent panel (streaming work + workpaper),
// with the Live Feed still running in the rail. Open it from the Your Team rail on a stage that
// has staffed agents.
await focusStage(page, 'diligence')
await page.getByTestId('team-rail').waitFor({ timeout: 20_000 })
const rentRollAgent = page.getByTestId('team-agent-rent-roll-analyst')
const anyTeamAgent = page.locator('[data-testid^="team-agent-"]').first()
const agentButton = (await rentRollAgent.isVisible().catch(() => false)) ? rentRollAgent : anyTeamAgent
if (await agentButton.isVisible().catch(() => false)) {
  await agentButton.click({ force: true })
  await page.getByTestId('agent-panel').waitFor({ timeout: 20_000 })
  await page.waitForTimeout(400)
  await capture(page, 'deal-team-handoffs.png')
  await page.getByTestId('agent-panel-close').click().catch(() => {})
  await page.getByTestId('agent-panel').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
} else {
  console.warn('skip deal-team-handoffs.png: no staffed agent in the Your Team rail to summon')
}

// IC package: the committee-ready output assembled at the IC stage.
await focusStage(page, 'ic')
await page.getByTestId('completion-package-view').waitFor({ timeout: 20_000 })
await capture(page, 'ic-package.png')

await captureIntakeAutoFill(browser)

await browser.close()
