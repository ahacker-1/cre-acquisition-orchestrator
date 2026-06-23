import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
export const dashboardRoot = resolve(__dirname, '..')
export const repoRoot = resolve(dashboardRoot, '..')
export const dataRoot = join(repoRoot, 'data')
export const parserFixturesRoot = join(repoRoot, 'fixtures', 'parsers')
export const firstRealDealRoot = join(repoRoot, 'fixtures', 'first-real-deal')

export const API_URL = 'http://127.0.0.1:8081'

export function cleanupDealArtifacts(dealId: string): void {
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

export function cleanupGeneratedRuntimeArtifacts(dealId: string): void {
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

export async function expectApiOk(response: APIResponse): Promise<void> {
  if (response.ok()) return
  throw new Error(`API request failed (${response.status()} ${response.statusText()}): ${await response.text()}`)
}

function isTransientApiRequestError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /ECONNRESET|ECONNREFUSED|ECONNABORTED|ETIMEDOUT|socket hang up|fetch failed/i.test(message)
}

async function retryApiRequest<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await operation()
    } catch (err) {
      lastError = err
      if (!isTransientApiRequestError(err) || attempt === 4) break
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 150 * (attempt + 1)))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError || 'API request failed'))
}

export async function apiGet(
  request: APIRequestContext,
  url: string,
  options?: Parameters<APIRequestContext['get']>[1],
): Promise<APIResponse> {
  return retryApiRequest(() => request.get(url, options))
}

export async function apiPost(
  request: APIRequestContext,
  url: string,
  options?: Parameters<APIRequestContext['post']>[1],
): Promise<APIResponse> {
  return retryApiRequest(() => request.post(url, options))
}

export function isApiResponse(response: APIResponse, method: string, path: string): boolean {
  return new URL(response.url()).pathname === path && response.request().method() === method
}

export async function stopActiveRun(request: APIRequestContext): Promise<void> {
  await apiPost(request, `${API_URL}/api/run/stop`)

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await apiGet(request, `${API_URL}/api/run/status`)
    const payload = (await response.json()) as { active?: boolean }
    if (!payload.active) return
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500))
  }
}

export async function waitForDashboardReady(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByText('Connected')).toBeVisible({ timeout: 20_000 })
}

export function buildLaunchReadyDeal(dealId: string, dealName: string): Record<string, unknown> {
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

export async function saveLaunchReadyDeal(
  request: APIRequestContext,
  dealId: string,
  dealName: string,
): Promise<void> {
  const response = await apiPost(request, `${API_URL}/api/deals`, {
    data: {
      deal: buildLaunchReadyDeal(dealId, dealName),
      mode: 'launch',
    },
  })
  await expectApiOk(response)
}

// Seed an incomplete deal that fails launch validation, so it persists as a `draft`
// (deal-service derives saveState from launch-readiness, not the request mode). Used to
// exercise reopening / continuing a saved deal in the EDIT wizard, now that creation happens
// only through the document-drop front door.
export async function saveDraftDeal(
  request: APIRequestContext,
  dealId: string,
  dealName: string,
): Promise<void> {
  const response = await apiPost(request, `${API_URL}/api/deals`, {
    data: {
      deal: { dealId, dealName, property: { city: 'Austin', state: 'TX' } },
      mode: 'draft',
    },
  })
  await expectApiOk(response)
}

export async function launchWorkflowForDeal(
  request: APIRequestContext,
  workflowId: string,
  dealId: string,
): Promise<void> {
  const response = await apiPost(request, `${API_URL}/api/workflows/${workflowId}/launch`, {
    data: {
      dealId,
      scenario: 'core-plus',
      speed: 'fast',
      runtimeProvider: 'simulation',
      reset: false,
    },
  })
  await expectApiOk(response)
}

/**
 * Open a seeded deal from the recent-deals strip into the persistent workspace frame.
 *
 * The redesigned workspace renders `workspace-frame` (the old `operator-deal-hub` tab hub
 * is gone). A deal opens by clicking its `workspace-docs-<id>` button in the
 * `recent-deals-strip`; the frame then mounts with the deal name as the main heading.
 *
 * The dashboard auto-reveals a completed run's workspace on load, so a leftover deal from a
 * prior test can already be on screen. This helper is robust to that: if the frame is showing
 * a *different* deal, it returns to the front door (New Deal) before clicking the card.
 */
export async function openWorkspaceFromRecentDeals(page: Page, dealId: string, dealName: string): Promise<void> {
  await waitForDashboardReady(page)
  const workspace = page.getByTestId('workspace-frame')
  const libraryBackdrop = page.getByTestId('deal-library-backdrop')
  const libraryModal = page.getByTestId('deal-library-modal')
  // The frame's own H1 — distinct from the recent-deals card's H3 of the same name, which
  // also lives inside <main>, so we must scope the heading to the frame to avoid matching it.
  const heading = workspace.getByRole('heading', { name: dealName, level: 1 })
  const strip = page.getByTestId('recent-deals-strip')
  const card = strip.getByTestId(`workspace-docs-${dealId}`)

  async function ensureLibraryOverlayClosed(): Promise<void> {
    if (await libraryBackdrop.isVisible().catch(() => false)) {
      const closeButton = page.getByLabel('Close deal library')
      if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click({ timeout: 5_000 }).catch(() => undefined)
      }
    }
    await expect(libraryBackdrop).toBeHidden({ timeout: 5_000 })
    await expect(libraryModal).toBeHidden({ timeout: 5_000 })
  }

  // Fast path: the target deal's workspace is already on screen (its run auto-revealed it).
  if ((await workspace.isVisible().catch(() => false)) && (await heading.isVisible().catch(() => false))) {
    await ensureLibraryOverlayClosed()
    return
  }

  async function clickWorkspaceButton(button: ReturnType<Page['getByTestId']>): Promise<boolean> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if ((await workspace.isVisible().catch(() => false)) && (await heading.isVisible().catch(() => false))) {
        await ensureLibraryOverlayClosed()
        return true
      }
      try {
        await button.scrollIntoViewIfNeeded({ timeout: 5_000 })
        await button.click({ timeout: 5_000 })
        await expect(workspace).toBeVisible({ timeout: 20_000 })
        await expect(heading).toBeVisible({ timeout: 20_000 })
        await ensureLibraryOverlayClosed()
        return true
      } catch {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 250 * (attempt + 1)))
      }
    }
    return false
  }

  if ((await strip.isVisible().catch(() => false)) && await clickWorkspaceButton(card)) {
    return
  }

  await page.getByTestId('header-deals-button').click()
  const modal = page.getByTestId('deal-library-modal')
  await expect(modal).toBeVisible({ timeout: 20_000 })
  const modalButton = modal.getByTestId(`workspace-docs-${dealId}`)
  if (await clickWorkspaceButton(modalButton)) return

  throw new Error(`Could not open workspace for ${dealId}`)
}

/**
 * Focus a lifecycle stage by clicking its spine step, then assert it became the active
 * step (aria-current). Replaces the old `workspace-tab-*` click + `.active` class checks.
 */
const STAGE_LABELS: Record<string, string> = {
  intake: 'Intake',
  diligence: 'Diligence',
  underwriting: 'Underwriting',
  financing: 'Financing',
  legal: 'Legal',
  closing: 'Closing',
  ic: 'IC',
}

export async function focusStage(page: Page, stageId: string): Promise<void> {
  const step = page.getByTestId(`spine-step-${stageId}`)
  await step.click()
  await expect(step).toHaveAttribute('aria-current', 'step')
  const label = STAGE_LABELS[stageId]
  if (label) {
    await expect(page.getByTestId('team-rail')).toContainText(`Your Team · ${label}`, { timeout: 20_000 })
  }
}

/**
 * Open the advanced drawer (Mission / Deal Team / Workpapers / Controls now live here,
 * behind the header `open-advanced` button) and return its locator.
 */
export async function openAdvancedDrawer(page: Page) {
  const drawer = page.getByTestId('advanced-drawer')
  if (!(await drawer.isVisible())) {
    await page.getByTestId('open-advanced').click()
  }
  await expect(drawer).toBeVisible({ timeout: 30_000 })
  return drawer
}

export async function closeAdvancedDrawer(page: Page): Promise<void> {
  await page.getByTestId('advanced-drawer-close').click()
  await expect(page.getByTestId('advanced-drawer')).toBeHidden()
}
