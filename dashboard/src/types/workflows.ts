import type { RunMode, RunSpeed } from './checkpoint'
import type { DealLibraryItem, LaunchScenario } from './deals'

export type WorkflowId = string
export type WorkflowPhaseKey = string
export type WorkflowLaunchMode = RunMode

export interface WorkflowPhaseSelection {
  phaseKey: WorkflowPhaseKey
  agents: string[]
}

export interface WorkflowDefinition {
  id: WorkflowId
  name: string
  summary: string
  operatorGoal: string
  recommendedScenario: LaunchScenario
  phases: WorkflowPhaseSelection[]
}

export interface WorkflowCatalogResponse {
  version: number
  defaultWorkflowId: WorkflowId
  workflows: WorkflowDefinition[]
}

export interface WorkflowPresetInputs {
  scenario: LaunchScenario
  speed: RunSpeed
  mode: WorkflowLaunchMode
  reset: boolean
  notes?: string
  tags?: string[]
}

export interface WorkflowPreset {
  id: string
  name: string
  workflowId: WorkflowId
  dealId?: string
  inputs: WorkflowPresetInputs
  createdAt: string
  updatedAt: string
}

export interface WorkflowPresetSaveRequest {
  name: string
  workflowId: WorkflowId
  dealId?: string
  inputs: WorkflowPresetInputs
}

export interface WorkflowPresetSaveResponse {
  preset: WorkflowPreset
  presets?: WorkflowPreset[]
}

export interface WorkflowPresetsResponse {
  presets: WorkflowPreset[]
}

export interface WorkflowLaunchRequest {
  dealId: string
  presetId?: string
  mode: WorkflowLaunchMode
  speed: RunSpeed
  scenario: LaunchScenario
  reset: boolean
  notes?: string
}

export interface WorkflowLaunchResponse {
  runId: string
  status: string
  mode: WorkflowLaunchMode | string
  speed: RunSpeed | string
  startedAt?: string
  pid?: number | null
  deal?: DealLibraryItem
  workflow?: WorkflowDefinition
  presetId?: string
  readiness?: {
    status: string
    blockers: string[]
    warnings: string[]
    sourceCoverage?: Record<string, number>
  }
  inputSnapshot?: {
    path: string
    sourceCoverage?: Record<string, number>
  }
}

export interface WorkflowSelectionDraft extends WorkflowPresetInputs {
  dealId: string
  workflowId: WorkflowId
  presetName: string
  presetId?: string
}
