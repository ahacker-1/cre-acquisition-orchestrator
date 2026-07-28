import { chromium } from '@playwright/test'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, '..', '..')
const assetsDir = resolve(repoRoot, 'docs', 'assets')
const baseURL = process.env.CRE_DASHBOARD_URL || 'http://localhost:5173'
const sampleUploadPath = resolve(repoRoot, 'fixtures', 'parsers', 'rent-roll-basic.xlsx')

async function stabilizePage(page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0.001s !important;
        animation-delay: 0s !important;
        transition-duration: 0.001s !important;
        scroll-behavior: auto !important;
      }
    `,
  }).catch(() => {})
}

async function capture(page, name) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(200)
  await page.screenshot({ path: resolve(assetsDir, name), fullPage: false })
  console.log(`captured docs/assets/${name}`)
}

async function waitForConversationDesk(page) {
  await page.goto(baseURL, { waitUntil: 'networkidle' })
  await page.getByText('Connected').first().waitFor({ timeout: 20_000 })
  await stabilizePage(page)

  if (await page.getByTestId('conversation-home').isVisible().catch(() => false)) return

  const backToConversations = page.getByTestId('header-conversations-button')
  if (await backToConversations.isVisible().catch(() => false)) {
    await backToConversations.click()
  } else if (await page.getByTestId('back-to-conversations').isVisible().catch(() => false)) {
    await page.getByTestId('back-to-conversations').click()
  }
  await page.getByTestId('conversation-home').waitFor({ timeout: 20_000 })
}

async function openNewDealSurface(page) {
  const headerNewDeal = page.getByTestId('header-new-deal-button')
  await headerNewDeal.waitFor({ timeout: 10_000 })
  await headerNewDeal.click()
  await page.getByTestId('drop-zone-hero').waitFor({ timeout: 20_000 })
  await stabilizePage(page)
}

async function captureConversationDeskJourney(page) {
  await waitForConversationDesk(page)
  await page.getByTestId('conversation-home').waitFor({ timeout: 20_000 })
  await capture(page, 'conversation-desk.jpg')

  const specialistTrigger = page.getByTestId('conversation-home-agent-select')
  if (!(await specialistTrigger.isVisible().catch(() => false))) {
    throw new Error('Conversation Desk has no specialist picker. Run npm run demo before npm run screenshots.')
  }
  await specialistTrigger.click()
  const picker = page.getByTestId('conversation-home-agent-menu')
  await picker.waitFor({ timeout: 10_000 })
  const specialistSearch = page.getByTestId('conversation-home-agent-search')
  await capture(page, 'specialist-picker.jpg')
  await specialistSearch.press('Escape')
  await picker.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})

  await openNewDealSurface(page)
  await capture(page, 'new-deal-source-package.jpg')
  await page.getByTestId('back-to-conversations').click()
  await page.getByTestId('conversation-home').waitFor({ timeout: 20_000 })
}

// A release checkout may have no retained local threads. Reuse an existing, complete,
// source-backed conversation when one is available, but never send a prompt or invoke Codex just
// to manufacture a screenshot.
async function captureRetainedAgentConversation(page) {
  const conversation = page.getByTestId('agent-conversation')
  const threadList = page.getByTestId('conversation-home-thread-list')
  const threadButtons = threadList.locator('button[data-testid^="conversation-home-thread-"]')
  const threadCount = await threadButtons.count().catch(() => 0)

  async function hasSourceBackedAnswer() {
    const threadId = await conversation.getAttribute('data-thread-id').catch(() => null)
    const assistantCount = await conversation.locator('[data-role="assistant"]').count().catch(() => 0)
    const citationCount = await conversation.locator('[data-testid^="conversation-citation-"]').count().catch(() => 0)
    return Boolean(threadId) && assistantCount > 0 && citationCount > 0
  }

  if (!(await hasSourceBackedAnswer())) {
    for (let index = 0; index < threadCount; index += 1) {
      const threadButton = threadButtons.nth(index)
      if (!(await threadButton.isVisible().catch(() => false))) continue
      await threadButton.click()
      await page.waitForTimeout(250)
      if (await hasSourceBackedAnswer()) break
    }
  }

  if (!(await hasSourceBackedAnswer())) {
    console.warn(
      'skip agent-conversation.jpg: no retained source-backed thread with an assistant answer and citation; live Codex was not invoked',
    )
    return
  }

  await page.getByTestId('conversation-timeline').evaluate((node) => {
    node.scrollTop = node.scrollHeight
  }).catch(() => {})
  await capture(page, 'agent-conversation.jpg')
}

async function openGuidedDemoFromUi(page) {
  await openNewDealSurface(page)
  const guidedDemo = page.getByTestId('guided-demo-front-door-cta')
  await guidedDemo.waitFor({ timeout: 10_000 })
  await guidedDemo.click()
  await page.getByTestId('workspace-frame').waitFor({ timeout: 30_000 })
  await stabilizePage(page)

  const guidedTourClose = page.getByTestId('guided-demo-close')
  if (await guidedTourClose.isVisible().catch(() => false)) {
    await guidedTourClose.click()
    await page.getByTestId('guided-demo-overlay').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
  }
}

function runStatusFromUi(page) {
  return page.locator('[role="status"]').evaluateAll((nodes) => (
    nodes
      .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .find((text) => text.startsWith('Run: '))
      ?? ''
  ))
}

// The app broadcasts run lifecycle messages on its existing WebSocket. Keep a lightweight record
// from page creation onward so a prior run's terminal UI label can never satisfy this run's wait.
function createRunEventObserver(page) {
  const statesByRunId = new Map()
  const waiters = new Set()

  function resolveWaiters(runId, state) {
    for (const waiter of waiters) {
      if (waiter.runId !== runId || !waiter.states.has(state)) continue
      clearTimeout(waiter.timeout)
      waiters.delete(waiter)
      waiter.resolve(state)
    }
  }

  function recordFrame(frame) {
    try {
      const payload = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString()
      const message = JSON.parse(payload)
      if (
        message?.type !== 'run'
        || typeof message.runId !== 'string'
        || typeof message.state !== 'string'
      ) return
      const states = statesByRunId.get(message.runId) ?? new Set()
      states.add(message.state)
      statesByRunId.set(message.runId, states)
      resolveWaiters(message.runId, message.state)
    } catch {
      // Non-JSON frames are irrelevant to the run lifecycle.
    }
  }

  page.on('websocket', (socket) => socket.on('framereceived', recordFrame))

  return {
    waitForState(runId, expectedStates, timeoutMs) {
      const expected = new Set(expectedStates)
      const observed = statesByRunId.get(runId)
      const existing = [...(observed ?? [])].find((state) => expected.has(state))
      if (existing) return Promise.resolve(existing)

      return new Promise((resolve, reject) => {
        const waiter = {
          runId,
          states: expected,
          resolve,
          timeout: setTimeout(() => {
            waiters.delete(waiter)
            reject(new Error(`Timed out waiting for ${runId} to reach ${expectedStates.join(' or ')}`))
          }, timeoutMs),
        }
        waiters.add(waiter)
      })
    },
  }
}

// The chat-first route opens Parkview but deliberately does not launch anything. Start the
// no-credential workflow through its visible UI instead of calling an API directly: this keeps
// screenshot capture on the deterministic Simulation Demo lane and cannot send a conversation to
// Codex. Resetting means a clean checkout never reuses an incomplete prior run.
async function startAndWaitForDeterministicDemo(page, runEvents) {
  await page.getByTestId('open-advanced').click({ force: true })
  const drawer = page.getByTestId('advanced-drawer')
  await drawer.waitFor({ timeout: 10_000 })

  const launcher = drawer.getByTestId('workspace-workflow-launcher')
  await launcher.waitFor({ timeout: 20_000 })
  await launcher.getByTestId('workflow-step-review').click()
  await launcher.getByTestId('workflow-select').selectOption('full-acquisition-review')
  await launcher.getByTestId('workflow-runtime-provider-select').selectOption('simulation')
  await launcher.getByTestId('workflow-scenario-select').selectOption('core-plus')
  await launcher.getByTestId('workflow-speed-select').selectOption('normal')
  await launcher.getByTestId('workflow-mode-select').selectOption('live')

  // Parkview uses the checked-in deterministic evidence bundle, not an operator-uploaded source
  // package, so the real-deal source approval gate would correctly block this demo run.
  const sourceGate = launcher.getByTestId('workflow-require-source-backed-inputs')
  if (await sourceGate.isChecked()) await sourceGate.click()

  const resetArtifacts = launcher
    .getByText('Reset prior run artifacts before launch', { exact: true })
    .locator('..')
    .getByRole('checkbox')
  if (!(await resetArtifacts.isChecked())) await resetArtifacts.click()

  const launchResponse = page.waitForResponse((response) => (
    response.request().method() === 'POST'
    && response.url().includes('/api/workflows/full-acquisition-review/launch')
  ), { timeout: 20_000 })
  await launcher.getByTestId('workflow-launch-selected').click()
  const response = await launchResponse
  if (!response.ok()) {
    throw new Error(`Deterministic demo launch failed with HTTP ${response.status()}`)
  }
  const launchPayload = await response.json().catch(() => null)
  const runId = typeof launchPayload?.runId === 'string' ? launchPayload.runId : null
  if (!runId) {
    throw new Error('Deterministic demo launch response did not include a runId')
  }

  // Bind the UI state to the exact launch response. A previous completed simulation cannot satisfy
  // this sequence because it must first receive a STARTING/RUNNING event for this runId.
  await runEvents.waitForState(runId, ['STARTING', 'RUNNING'], 20_000)
  await page.waitForFunction(() => (
    Array.from(document.querySelectorAll('[role="status"]')).some((node) => (
      /^Run: (Starting|Running) \/ Simulation$/.test(
        node.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      )
    ))
  ), { timeout: 20_000 })
  const terminalState = await runEvents.waitForState(runId, ['COMPLETED', 'FAILED', 'STOPPED'], 120_000)
  if (terminalState !== 'COMPLETED') {
    throw new Error(`Deterministic demo ${runId} did not complete successfully (${terminalState})`)
  }
  const terminalStatus = await (await page.waitForFunction(() => (
    Array.from(document.querySelectorAll('[role="status"]'))
      .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .find((text) => /^Run: (Completed|Failed|Stopped) \/ Simulation$/.test(text))
      ?? ''
  ), { timeout: 120_000 })).jsonValue()
  if (terminalStatus !== 'Run: Completed / Simulation') {
    throw new Error(`Deterministic demo did not complete successfully (${terminalStatus || await runStatusFromUi(page)})`)
  }

  // Completion alone is not enough for proof screenshots: wait until the two captured lifecycle
  // stages have received their completed state from the deterministic run.
  await page.waitForFunction(() => (
    ['underwriting', 'ic'].every((stage) => (
      document.querySelector(`[data-testid="spine-step-${stage}"]`)?.getAttribute('data-status') === 'done'
    ))
  ), { timeout: 30_000 })

  await page.getByTestId('advanced-drawer-close').click().catch(() => {})
  await drawer.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
}

// Focus a lifecycle stage by clicking its spine step. The center stage swaps while the persistent
// frame (header, spine, rail, and command bar) stays in place.
async function focusStage(page, stageId) {
  await page.getByTestId(`spine-step-${stageId}`).click({ force: true })
  await page.waitForTimeout(350)
}

// Capture the source inspection/review path in an isolated real-deal page so it does not disturb
// the deterministic Parkview workspace already open on the main page.
async function captureIntakeEvidence(browser) {
  const intakePage = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 })
  try {
    await intakePage.goto(baseURL, { waitUntil: 'networkidle' })
    await intakePage.getByText('Connected').first().waitFor({ timeout: 20_000 })
    await stabilizePage(intakePage)

    if (!(await intakePage.getByTestId('drop-zone-hero').isVisible().catch(() => false))) {
      await intakePage.getByTestId('header-new-deal-button').click()
      await intakePage.getByTestId('drop-zone-hero').waitFor({ timeout: 20_000 })
    }

    await intakePage.getByTestId('drop-zone-input').setInputFiles(sampleUploadPath)
    await intakePage.getByTestId('quick-deal-modal').waitFor({ timeout: 20_000 })
    await intakePage.getByTestId('quick-deal-create').click()
    await intakePage.getByTestId('workspace-frame').waitFor({ timeout: 30_000 })
    await stabilizePage(intakePage)
    await focusStage(intakePage, 'intake')
    await intakePage.getByTestId('intake-stage').waitFor({ timeout: 20_000 })

    const detailedReview = intakePage.getByTestId('intake-detailed-review')
    const extractButton = intakePage.getByTestId('extract-document-rent_roll')
    if (!(await extractButton.isVisible().catch(() => false))) {
      await detailedReview.locator('summary').click()
      await extractButton.waitFor({ timeout: 10_000 }).catch(() => {})
    }
    if (
      await extractButton.isVisible().catch(() => false)
      && await extractButton.isEnabled().catch(() => false)
    ) {
      await extractButton.click()
    }

    const inspector = intakePage.getByTestId('uploaded-data-inspector')
    if (await inspector.isVisible({ timeout: 30_000 }).catch(() => false)) {
      await inspector.getByTestId('uploaded-field-list').getByText('Market Rent').click().catch(() => {})
      await inspector.getByTestId('uploaded-row-3').click().catch(() => {})
      await inspector.scrollIntoViewIfNeeded()
      await capture(intakePage, 'uploaded-data-inspector.jpg')
    } else {
      console.warn('skip uploaded-data-inspector.jpg: uploaded data inspector not visible')
    }

    const extractionPreview = intakePage.getByTestId('extraction-preview')
    if (await extractionPreview.isVisible({ timeout: 10_000 }).catch(() => false)) {
      const firstCandidate = extractionPreview.locator('[data-testid^="extraction-field-"]').first()
      if (await firstCandidate.isVisible().catch(() => false)) {
        await firstCandidate.scrollIntoViewIfNeeded()
      } else {
        await extractionPreview.scrollIntoViewIfNeeded()
      }
      await capture(intakePage, 'source-extraction-review.jpg')
    } else {
      console.warn('skip source-extraction-review.jpg: extraction review not visible')
    }
  } finally {
    await intakePage.close()
  }
}

// Capture the Advanced drawer's Workflow Launcher with the live Codex controls visible. Selecting
// the runtime does not launch it, so this screenshot remains safe and deterministic.
async function captureWorkflowLauncher(page) {
  const openAdvanced = page.getByTestId('open-advanced')
  if (!(await openAdvanced.isVisible().catch(() => false))) {
    console.warn('skip workflow-launcher.png: Advanced control not visible')
    return
  }
  await openAdvanced.click({ force: true })
  if (!(await page.getByTestId('advanced-drawer').isVisible({ timeout: 10_000 }).catch(() => false))) {
    console.warn('skip workflow-launcher.png: Advanced drawer did not open')
    return
  }
  const launcher = page.getByTestId('workspace-workflow-launcher')
  if (!(await launcher.isVisible({ timeout: 10_000 }).catch(() => false))) {
    console.warn('skip workflow-launcher.png: workflow launcher not visible')
    await page.getByTestId('advanced-drawer-close').click().catch(() => {})
    return
  }
  await page.getByTestId('workflow-step-review').click().catch(() => {})
  await page.getByTestId('workflow-runtime-provider-select').waitFor({ timeout: 10_000 }).catch(() => {})
  await page.getByTestId('workflow-runtime-provider-select').selectOption('codex').catch(() => {})
  await page.setViewportSize({ width: 1440, height: 1900 })
  await page.waitForTimeout(400)
  const launcherBox = await launcher.boundingBox()
  const launchBox = await page.getByTestId('workflow-launch-selected').boundingBox().catch(() => null)
  if (launcherBox && launchBox) {
    const height = Math.min(launchBox.y + launchBox.height + 24, launcherBox.y + launcherBox.height) - launcherBox.y
    await page.screenshot({
      path: resolve(assetsDir, 'workflow-launcher.png'),
      clip: { x: launcherBox.x, y: launcherBox.y, width: launcherBox.width, height },
    })
  } else {
    await launcher.screenshot({ path: resolve(assetsDir, 'workflow-launcher.png') })
  }
  console.log('captured docs/assets/workflow-launcher.png')
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.getByTestId('advanced-drawer-close').click().catch(() => {})
  await page.getByTestId('advanced-drawer').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
}

// Default: launch Playwright's bundled headless Chromium. Set CRE_CDP_ENDPOINT (for example,
// http://localhost:9222) to attach to an already-running Chromium over the DevTools Protocol.
const cdpEndpoint = process.env.CRE_CDP_ENDPOINT
const browser = cdpEndpoint
  ? await chromium.connectOverCDP(cdpEndpoint)
  : await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 })
const runEvents = createRunEventObserver(page)

await captureConversationDeskJourney(page)
await captureRetainedAgentConversation(page)
await openGuidedDemoFromUi(page)
await startAndWaitForDeterministicDemo(page, runEvents)

// Keep the trust-path shots in source-to-decision order. The real upload page is isolated; the
// main page remains on the deterministic guided-demo workspace throughout.
await captureIntakeEvidence(browser)

await focusStage(page, 'underwriting')
await page.getByTestId('lifecycle-spine').waitFor({ timeout: 20_000 })
await page.getByTestId('live-feed').waitFor({ timeout: 20_000 })
await page.getByTestId('command-bar').waitFor({ timeout: 20_000 })
await page.evaluate(() => window.scrollTo(0, 0))
await capture(page, 'acquisition-command.png')

await focusStage(page, 'ic')
await page.getByTestId('completion-package-view').waitFor({ timeout: 20_000 })
await capture(page, 'ic-package.png')

await captureWorkflowLauncher(page)
await browser.close()
