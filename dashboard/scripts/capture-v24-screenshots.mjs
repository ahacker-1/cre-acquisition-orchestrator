import { chromium } from '@playwright/test'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, '..', '..')
const assetsDir = resolve(repoRoot, 'docs', 'assets')
const baseURL = process.env.CRE_DASHBOARD_URL || 'http://localhost:5173'

async function waitForRunIdle(page) {
  await page.waitForFunction(async () => {
    try {
      const response = await fetch('/api/run/status')
      const status = await response.json()
      return !status.active
    } catch {
      return false
    }
  }, null, { timeout: 120_000 })
}

async function waitForWorkspace(page) {
  await page.goto(baseURL, { waitUntil: 'networkidle' })
  await page.getByText('Connected').waitFor({ timeout: 20_000 })
  await waitForRunIdle(page)

  if (!(await page.getByTestId('operator-deal-hub').isVisible().catch(() => false))) {
    const demoButton = page.getByTestId('drop-zone-demo')
    if (await demoButton.isVisible().catch(() => false)) {
      await demoButton.click()
      await page.getByTestId('operator-deal-hub').waitFor({ timeout: 30_000 })
    }
  }

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

await clickTab(page, 'mission')
await page.getByTestId('mission-control').waitFor({ timeout: 20_000 })
await capture(page, 'acquisition-command.png')

await page.evaluate(() => window.scrollTo(0, Math.floor(window.innerHeight * 0.55)))
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

await browser.close()
