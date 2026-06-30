import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'fs'
import { join } from 'path'
import type { RunMode, RunSpeed, RuntimeProvider } from './run-manager'

export type LaunchScenario = 'core-plus' | 'value-add' | 'distressed'

export interface WorkflowPhaseSelection {
  phaseKey: string
  agents: string[]
}

export interface WorkflowDefinition {
  id: string
  name: string
  summary: string
  operatorGoal: string
  recommendedScenario: LaunchScenario
  phases: WorkflowPhaseSelection[]
  requiredSourceFields?: string[]
}

export interface WorkflowPreset {
  presetId: string
  name: string
  workflowId: string
  dealId: string
  scenario: LaunchScenario
  speed: RunSpeed
  mode: RunMode
  runtimeProvider: RuntimeProvider
  reset: boolean
  codexMaxAgents: number | null
  codexConcurrency: number | null
  codexSearch: boolean
  requireSourceBackedInputs: boolean
  notes?: string
  inputs: {
    scenario: LaunchScenario
    speed: RunSpeed
    mode: RunMode
    runtimeProvider: RuntimeProvider
    reset: boolean
    codexMaxAgents: number | null
    codexConcurrency: number | null
    codexSearch: boolean
    requireSourceBackedInputs: boolean
    notes?: string
  }
  seed: number | null
  createdAt: string
  updatedAt: string
}

interface WorkflowCatalogFile {
  workflows?: WorkflowDefinition[]
}

interface ServiceContext {
  dataRoot: string
  projectRoot: string
}

interface SavePresetInput {
  presetId?: string
  name?: unknown
  workflowId?: unknown
  dealId?: unknown
  scenario?: unknown
  speed?: unknown
  mode?: unknown
  runtimeProvider?: unknown
  reset?: unknown
  codexMaxAgents?: unknown
  codexConcurrency?: unknown
  codexSearch?: unknown
  requireSourceBackedInputs?: unknown
  notes?: unknown
  seed?: unknown
  inputs?: unknown
}

function nowIso(): string {
  return new Date().toISOString()
}

function workflowCatalogPath(projectRoot: string): string {
  return join(projectRoot, 'config', 'workflows.json')
}

function presetsRoot(dataRoot: string): string {
  return join(dataRoot, 'workflow-presets')
}

function assertSafePresetId(value: string, label = 'preset ID'): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(value) || value.includes('..')) {
    throw new Error(`Invalid ${label}`)
  }
  return value
}

function presetPathForId(dataRoot: string, presetId: string): string {
  return join(presetsRoot(dataRoot), `${assertSafePresetId(presetId)}.json`)
}

function readJsonSafe<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T
  } catch {
    return null
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60)
}

function asScenario(value: unknown, fallback: LaunchScenario): LaunchScenario {
  return value === 'value-add' || value === 'distressed' || value === 'core-plus'
    ? value
    : fallback
}

function asSpeed(value: unknown): RunSpeed {
  return value === 'fast' || value === 'slow' || value === 'normal' ? value : 'normal'
}

function asMode(value: unknown): RunMode {
  return value === 'fast' ? 'fast' : 'live'
}

function asRuntimeProvider(value: unknown): RuntimeProvider {
  return value === 'simulation' ? 'simulation' : 'codex'
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function asCodexSearch(
  input: Record<string, unknown>,
  nestedInputs: Record<string, unknown>,
  runtimeProvider: RuntimeProvider,
): boolean {
  const value = hasOwn(input, 'codexSearch')
    ? input.codexSearch
    : hasOwn(nestedInputs, 'codexSearch')
      ? nestedInputs.codexSearch
      : undefined
  if (runtimeProvider === 'codex') return value !== false
  return value === true
}

function asSeed(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.round(value)
}

function asPositiveInteger(value: unknown, fallback: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const nextValue = Math.round(value)
  return nextValue > 0 ? nextValue : fallback
}

export function listWorkflows(context: ServiceContext): { workflows: WorkflowDefinition[] } {
  const catalog = readJsonSafe<WorkflowCatalogFile>(workflowCatalogPath(context.projectRoot))
  const workflows = Array.isArray(catalog?.workflows) ? catalog.workflows : []
  const rawCatalog = readJsonSafe<Record<string, unknown>>(workflowCatalogPath(context.projectRoot)) || {}
  return {
    version: typeof rawCatalog.version === 'number' ? rawCatalog.version : 1,
    defaultWorkflowId:
      typeof rawCatalog.defaultWorkflowId === 'string'
        ? rawCatalog.defaultWorkflowId
        : workflows[0]?.id || 'full-acquisition-review',
    workflows,
  } as { workflows: WorkflowDefinition[] }
}

export function getWorkflow(context: ServiceContext, workflowId: string): WorkflowDefinition | null {
  return listWorkflows(context).workflows.find((workflow) => workflow.id === workflowId) || null
}

export function listWorkflowPresets(context: ServiceContext): { presets: WorkflowPreset[] } {
  const root = presetsRoot(context.dataRoot)
  if (!existsSync(root)) return { presets: [] }
  const presets = readdirSync(root)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const filePresetId = name.slice(0, -'.json'.length)
      try {
        assertSafePresetId(filePresetId, 'preset file ID')
      } catch {
        return null
      }
      const preset = readJsonSafe<WorkflowPreset>(join(root, name))
      if (!preset?.presetId) return null
      try {
        assertSafePresetId(preset.presetId)
      } catch {
        return null
      }
      return preset.presetId === filePresetId ? preset : { ...preset, presetId: filePresetId }
    })
    .filter((preset): preset is WorkflowPreset => Boolean(preset?.presetId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return { presets }
}

export function saveWorkflowPreset(
  context: ServiceContext,
  input: SavePresetInput,
): WorkflowPreset {
  const nestedInputs =
    input.inputs && typeof input.inputs === 'object' ? (input.inputs as Record<string, unknown>) : {}
  const workflowId = typeof input.workflowId === 'string' ? input.workflowId.trim() : ''
  const dealId = typeof input.dealId === 'string' ? input.dealId.trim() : ''
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!workflowId) throw new Error('Missing required field: workflowId')
  if (!dealId) throw new Error('Missing required field: dealId')
  if (!name) throw new Error('Missing required field: name')

  const workflow = getWorkflow(context, workflowId)
  if (!workflow) throw new Error(`Unknown workflow: ${workflowId}`)

  const requestedPresetId =
    typeof input.presetId === 'string' && input.presetId.trim().length > 0
      ? assertSafePresetId(input.presetId.trim())
      : null
  const existing =
    requestedPresetId
      ? readJsonSafe<WorkflowPreset>(presetPathForId(context.dataRoot, requestedPresetId))
      : null
  const timestamp = nowIso()
  const presetId =
    requestedPresetId ||
    assertSafePresetId(`${slugify(name) || 'workflow-preset'}-${timestamp.replace(/[:.]/g, '-')}`)
  const runtimeProvider = asRuntimeProvider(input.runtimeProvider ?? nestedInputs.runtimeProvider)
  const codexSearch = asCodexSearch(input as Record<string, unknown>, nestedInputs, runtimeProvider)

  const preset: WorkflowPreset = {
    presetId,
    name,
    workflowId,
    dealId,
    scenario: asScenario(input.scenario ?? nestedInputs.scenario, workflow.recommendedScenario || 'core-plus'),
    speed: asSpeed(input.speed ?? nestedInputs.speed),
    mode: asMode(input.mode ?? nestedInputs.mode),
    runtimeProvider,
    reset: input.reset === true || nestedInputs.reset === true,
    codexMaxAgents: asPositiveInteger(input.codexMaxAgents ?? nestedInputs.codexMaxAgents, null),
    codexConcurrency: asPositiveInteger(input.codexConcurrency ?? nestedInputs.codexConcurrency, 1),
    codexSearch,
    requireSourceBackedInputs: input.requireSourceBackedInputs === true || nestedInputs.requireSourceBackedInputs === true,
    notes:
      typeof input.notes === 'string'
        ? input.notes
        : typeof nestedInputs.notes === 'string'
          ? nestedInputs.notes
          : undefined,
    inputs: {
      scenario: asScenario(input.scenario ?? nestedInputs.scenario, workflow.recommendedScenario || 'core-plus'),
      speed: asSpeed(input.speed ?? nestedInputs.speed),
      mode: asMode(input.mode ?? nestedInputs.mode),
      runtimeProvider,
      reset: input.reset === true || nestedInputs.reset === true,
      codexMaxAgents: asPositiveInteger(input.codexMaxAgents ?? nestedInputs.codexMaxAgents, null),
      codexConcurrency: asPositiveInteger(input.codexConcurrency ?? nestedInputs.codexConcurrency, 1),
      codexSearch,
      requireSourceBackedInputs: input.requireSourceBackedInputs === true || nestedInputs.requireSourceBackedInputs === true,
      notes:
        typeof input.notes === 'string'
          ? input.notes
          : typeof nestedInputs.notes === 'string'
            ? nestedInputs.notes
            : undefined,
    },
    seed: asSeed(input.seed ?? nestedInputs.seed),
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  }

  const root = presetsRoot(context.dataRoot)
  mkdirSync(root, { recursive: true })
  writeFileSync(presetPathForId(context.dataRoot, preset.presetId), JSON.stringify(preset, null, 2))
  return preset
}
