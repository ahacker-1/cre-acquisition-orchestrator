import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import {
  cleanupDealArtifacts,
  openWorkspaceFromRecentDeals,
  saveLaunchReadyDeal,
  stopActiveRun,
} from './helpers'

// Lightweight automated accessibility coverage for the public demo. Loads the persistent
// workspace frame and runs axe-core against the WCAG 2.0/2.1 A & AA rule sets, then exercises
// keyboard operability of the always-present command bar and the agent-panel dialog.
//
// NOTE: this spec is intentionally not wired into ci.yml / Vercel here — it runs via the same
// `node ./scripts/run-e2e.mjs e2e/a11y.spec.ts` harness as the rest of the e2e suite.

const A11Y_DEAL_ID = 'DEAL-2099-A11Y'
const A11Y_DEAL_NAME = 'Playwright A11y Deal'

// The WCAG levels we hold the demo to (color-contrast lives in wcag2aa).
const WCAG_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ request }) => {
  cleanupDealArtifacts(A11Y_DEAL_ID)
  await stopActiveRun(request)
})

test.afterEach(async ({ request }) => {
  await stopActiveRun(request)
  cleanupDealArtifacts(A11Y_DEAL_ID)
})

test('workspace frame has no WCAG A/AA accessibility violations', async ({ page, request }) => {
  await saveLaunchReadyDeal(request, A11Y_DEAL_ID, A11Y_DEAL_NAME)
  await openWorkspaceFromRecentDeals(page, A11Y_DEAL_ID, A11Y_DEAL_NAME)

  await expect(page.getByTestId('workspace-frame')).toBeVisible()
  await expect(page.getByTestId('command-bar')).toBeVisible()

  const results = await new AxeBuilder({ page }).withTags(WCAG_AA_TAGS).analyze()

  // Surface a readable summary if anything regresses (axe's default error is terse).
  const summary = results.violations.map(
    (v) => `${v.id} (${v.impact}) ×${v.nodes.length} — ${v.help}`,
  )
  expect(summary, summary.join('\n')).toEqual([])
})

test('color-contrast specifically passes on the loaded workspace', async ({ page, request }) => {
  await saveLaunchReadyDeal(request, A11Y_DEAL_ID, A11Y_DEAL_NAME)
  await openWorkspaceFromRecentDeals(page, A11Y_DEAL_ID, A11Y_DEAL_NAME)
  await expect(page.getByTestId('workspace-frame')).toBeVisible()

  const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
  const offenders = results.violations.flatMap((v) =>
    v.nodes.map((n) => `${n.target.join(' ')} :: ${n.failureSummary}`),
  )
  expect(offenders, offenders.join('\n')).toEqual([])
})

test('command bar is keyboard operable and submits on Enter', async ({ page, request }) => {
  await saveLaunchReadyDeal(request, A11Y_DEAL_ID, A11Y_DEAL_NAME)
  await openWorkspaceFromRecentDeals(page, A11Y_DEAL_ID, A11Y_DEAL_NAME)

  // The command input is reachable and carries an accessible name.
  const input = page.getByTestId('command-input')
  await expect(input).toHaveAttribute('aria-label', 'Tell your team what to do')
  await input.focus()
  await expect(input).toBeFocused()

  // Typing + Enter submits without needing a pointer, and clears the field.
  await page.keyboard.type('Re-run the rent roll parser')
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('')
})

test('agent panel dialog traps focus and closes on Escape', async ({ page, request }) => {
  await saveLaunchReadyDeal(request, A11Y_DEAL_ID, A11Y_DEAL_NAME)
  await openWorkspaceFromRecentDeals(page, A11Y_DEAL_ID, A11Y_DEAL_NAME)

  // Open the first staffed agent from the "Your Team" rail via keyboard activation.
  const firstAgent = page.getByTestId('team-rail').getByRole('button').first()
  await firstAgent.focus()
  await page.keyboard.press('Enter')

  const panel = page.getByTestId('agent-panel')
  await expect(panel).toBeVisible()
  const dialog = panel.getByRole('dialog')
  await expect(dialog).toHaveAttribute('aria-modal', 'true')

  // Escape closes the dialog (keyboard dismissal, no pointer needed).
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
})
