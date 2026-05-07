import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'fs'
import { join } from 'path'
import type { RunSpeed } from './run-manager'

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
}

export interface WorkflowPreset {
  presetId: string
  name: string
  workflowId: string
  dealId: string
  scenario: LaunchScenario
  speed: RunSpeed
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

function asSeed(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.round(value)
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
    .map((name) => readJsonSafe<WorkflowPreset>(join(root, name)))
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

  const existing =
    typeof input.presetId === 'string' && input.presetId.trim().length > 0
      ? readJsonSafe<WorkflowPreset>(join(presetsRoot(context.dataRoot), `${input.presetId.trim()}.json`))
      : null
  const timestamp = nowIso()
  const presetId =
    existing?.presetId ||
    `${slugify(name) || 'workflow-preset'}-${timestamp.replace(/[:.]/g, '-')}`

  const preset: WorkflowPreset = {
    presetId,
    name,
    workflowId,
    dealId,
    scenario: asScenario(input.scenario ?? nestedInputs.scenario, workflow.recommendedScenario || 'core-plus'),
    speed: asSpeed(input.speed ?? nestedInputs.speed),
    seed: asSeed(input.seed ?? nestedInputs.seed),
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  }

  const root = presetsRoot(context.dataRoot)
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, `${preset.presetId}.json`), JSON.stringify(preset, null, 2))
  return preset
}
