import { expect, test } from '@playwright/test'
import { existsSync, readFileSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'
import {
  API_URL,
  apiPost,
  cleanupDealArtifacts,
  cleanupGeneratedRuntimeArtifacts,
  dataRoot,
  expectApiOk,
  repoRoot,
  saveLaunchReadyDeal,
  stopActiveRun,
} from './helpers'

const DEAL_ID = 'DEAL-2099-913'
const DEAL_NAME = 'Playwright Codex Preset Fallback Deal'
const PRESET_NAME = 'Playwright Codex Preset Fallback'
const PRESET_FILE_PREFIX = 'playwright-codex-preset-fallback-'

function cleanupPresetArtifacts(): void {
  const presetRoot = join(dataRoot, 'workflow-presets')
  if (!existsSync(presetRoot)) return
  for (const fileName of readdirSync(presetRoot)) {
    if (fileName.startsWith(PRESET_FILE_PREFIX) && fileName.endsWith('.json')) {
      rmSync(join(presetRoot, fileName), { force: true })
    }
  }
}

function cleanupRuntimeArtifacts(outputPath?: unknown): void {
  cleanupDealArtifacts(DEAL_ID)
  cleanupGeneratedRuntimeArtifacts(DEAL_ID)
  rmSync(join(dataRoot, 'runs', DEAL_ID), { recursive: true, force: true })
  if (typeof outputPath === 'string' && outputPath.startsWith('data/codex-runs/')) {
    rmSync(join(repoRoot, outputPath), { recursive: true, force: true })
  }
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ request }) => {
  await stopActiveRun(request)
  cleanupPresetArtifacts()
  cleanupRuntimeArtifacts()
})

test.afterEach(async ({ request }) => {
  await stopActiveRun(request)
  cleanupPresetArtifacts()
  cleanupRuntimeArtifacts()
})

test('workflow launches inherit saved Codex controls from preset-only requests', async ({ request }) => {
  await saveLaunchReadyDeal(request, DEAL_ID, DEAL_NAME)

  const presetResponse = await apiPost(request, `${API_URL}/api/workflow-presets`, {
    data: {
      name: PRESET_NAME,
      workflowId: 'quick-deal-screen',
      dealId: DEAL_ID,
      inputs: {
        scenario: 'value-add',
        speed: 'slow',
        mode: 'fast',
        runtimeProvider: 'codex',
        reset: true,
        codexMaxAgents: 1,
        codexConcurrency: 1,
        codexSearch: true,
        requireSourceBackedInputs: false,
      },
    },
  })
  await expectApiOk(presetResponse)
  const presetPayload = (await presetResponse.json()) as { preset?: { presetId?: string } }
  const presetId = presetPayload.preset?.presetId
  expect(presetId).toEqual(expect.stringContaining(PRESET_FILE_PREFIX))
  if (typeof presetId !== 'string') throw new Error('Preset response did not include a presetId')

  const launchResponse = await apiPost(request, `${API_URL}/api/workflows/quick-deal-screen/launch`, {
    data: { presetId },
  })
  await expectApiOk(launchResponse)
  const launchPayload = (await launchResponse.json()) as {
    inputSnapshot?: { path?: string }
    outputPath?: string | null
    presetId?: string
  }
  await stopActiveRun(request)

  expect(launchPayload.presetId).toBe(presetId)
  expect(launchPayload.inputSnapshot?.path).toEqual(expect.stringContaining(`${DEAL_ID}/`))

  const snapshotPath = launchPayload.inputSnapshot?.path
  if (typeof snapshotPath !== 'string') throw new Error('Launch response did not include an input snapshot path')
  const snapshot = JSON.parse(readFileSync(join(repoRoot, snapshotPath), 'utf8')) as {
    launch?: Record<string, unknown>
  }

  expect(snapshot.launch).toMatchObject({
    dealId: DEAL_ID,
    workflowId: 'quick-deal-screen',
    presetId,
    scenario: 'value-add',
    speed: 'slow',
    mode: 'fast',
    runtimeProvider: 'codex',
    reset: true,
    codexMaxAgents: 1,
    codexConcurrency: 1,
    codexSearch: true,
    requireSourceBackedInputs: false,
  })

  cleanupRuntimeArtifacts(launchPayload.outputPath)
})
